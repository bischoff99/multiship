import { MemoryCache } from '../cache/memory-cache.js';
import { RedisCache } from '../cache/redis-cache.js';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastRequest?: number;
}

/**
 * Token bucket rate limiter implementation
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens
   */
  tryConsume(tokens: number = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  /**
   * Get remaining tokens
   */
  getRemaining(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Sliding window rate limiter
 */
export class SlidingWindowRateLimiter {
  private cache: MemoryCache<RateLimitEntry>;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.cache = new MemoryCache({
      maxSize: 10000,
      defaultTTL: config.windowMs + 1000 // Add buffer for cleanup
    });
  }

  /**
   * Check if request should be rate limited
   */
  async check(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const key = `rate-limit:${identifier}`;

    // Get current entry
    let entry = await this.cache.get(key) as RateLimitEntry | null;

    if (!entry || entry.resetTime <= now) {
      // New window or expired entry
      entry = {
        count: 0,
        resetTime: now + this.config.windowMs,
        lastRequest: now
      };
    }

    // Check if we're over the limit
    if (entry.count >= this.config.maxRequests) {
      return {
        success: false,
        limit: this.config.maxRequests,
        remaining: 0,
        resetTime: entry.resetTime
      };
    }

    // Increment counter
    entry.count++;
    entry.lastRequest = now;

    // Update cache
    await this.cache.set(key, entry, { ttl: this.config.windowMs + 1000 });

    return {
      success: true,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetTime: entry.resetTime
    };
  }

  /**
   * Reset rate limit for identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = `rate-limit:${identifier}`;
    await this.cache.delete(key);
  }

  /**
   * Get current rate limit status
   */
  async getStatus(identifier: string): Promise<RateLimitEntry | null> {
    const key = `rate-limit:${identifier}`;
    return await this.cache.get(key);
  }
}

/**
 * Rate limiter factory
 */
export class RateLimiterFactory {
  private static instance: RateLimiterFactory;
  private limiters = new Map<string, SlidingWindowRateLimiter>();

  private constructor() {}

  static getInstance(): RateLimiterFactory {
    if (!RateLimiterFactory.instance) {
      RateLimiterFactory.instance = new RateLimiterFactory();
    }
    return RateLimiterFactory.instance;
  }

  /**
   * Get or create a rate limiter
   */
  getLimiter(name: string, config: RateLimitConfig): SlidingWindowRateLimiter {
    if (!this.limiters.has(name)) {
      this.limiters.set(name, new SlidingWindowRateLimiter(config));
    }
    return this.limiters.get(name)!;
  }

  /**
   * Remove a rate limiter
   */
  removeLimiter(name: string): void {
    this.limiters.delete(name);
  }

  /**
   * Get all rate limiter names
   */
  getLimiterNames(): string[] {
    return Array.from(this.limiters.keys());
  }
}

/**
 * Default rate limiters for common scenarios
 */
export const DefaultRateLimiters = {
  /**
   * Strict rate limiting for quote operations
   */
  QUOTE_REQUESTS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,    // 100 requests per minute
  },

  /**
   * More permissive rate limiting for purchase operations
   */
  PURCHASE_REQUESTS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50,     // 50 requests per minute
  },

  /**
   * Very permissive rate limiting for health checks
   */
  HEALTH_CHECKS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 300,    // 300 requests per minute
  },

  /**
   * Strict rate limiting for webhook endpoints
   */
  WEBHOOK_REQUESTS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200,    // 200 requests per minute
  }
};

/**
 * Rate limiting middleware factory
 */
export function createRateLimitMiddleware(
  limiterName: string,
  config: RateLimitConfig,
  identifierFn?: (req: any) => string
) {
  const rateLimiter = RateLimiterFactory.getInstance().getLimiter(limiterName, config);

  return async (req: any, res: any, next: () => void) => {
    try {
      // Generate identifier for rate limiting
      const identifier = identifierFn ? identifierFn(req) : getClientIdentifier(req);

      // Check rate limit
      const result = await rateLimiter.check(identifier);

      // Add rate limit headers
      res.header('X-RateLimit-Limit', result.limit);
      res.header('X-RateLimit-Remaining', result.remaining);
      res.header('X-RateLimit-Reset', new Date(result.resetTime).toUTCString());

      if (!result.success) {
        // Rate limit exceeded
        res.header('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000));
        res.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Continue without rate limiting on error
      next();
    }
  };
}

/**
 * Default identifier function based on IP address
 */
function getClientIdentifier(req: any): string {
  // Try to get real IP from various headers
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.ip ||
    req.connection?.remoteAddress ||
    'unknown';

  return `ip:${ip}`;
}

/**
 * Identifier function based on API key
 */
export function getApiKeyIdentifier(req: any): string {
  const apiKey = req.headers.authorization?.replace('Bearer ', '') || 'anonymous';
  return `apikey:${apiKey}`;
}

/**
 * Identifier function based on user agent
 */
export function getUserAgentIdentifier(req: any): string {
  const userAgent = req.headers['user-agent'] || 'unknown';
  return `ua:${userAgent}`;
}

/**
 * Combined identifier function
 */
export function getCombinedIdentifier(req: any): string {
  const ip = getClientIdentifier(req);
  const apiKey = getApiKeyIdentifier(req);
  return `${ip}:${apiKey}`;
}

/**
 * Rate limiting utilities
 */
export const RateLimitUtils = {
  /**
   * Create rate limiter for quote endpoints
   */
  createQuoteRateLimiter() {
    return createRateLimitMiddleware(
      'quote-requests',
      DefaultRateLimiters.QUOTE_REQUESTS,
      getApiKeyIdentifier
    );
  },

  /**
   * Create rate limiter for purchase endpoints
   */
  createPurchaseRateLimiter() {
    return createRateLimitMiddleware(
      'purchase-requests',
      DefaultRateLimiters.PURCHASE_REQUESTS,
      getApiKeyIdentifier
    );
  },

  /**
   * Create rate limiter for health endpoints
   */
  createHealthRateLimiter() {
    return createRateLimitMiddleware(
      'health-checks',
      DefaultRateLimiters.HEALTH_CHECKS,
      getClientIdentifier
    );
  },

  /**
   * Create rate limiter for webhook endpoints
   */
  createWebhookRateLimiter() {
    return createRateLimitMiddleware(
      'webhook-requests',
      DefaultRateLimiters.WEBHOOK_REQUESTS,
      getClientIdentifier
    );
  }
};