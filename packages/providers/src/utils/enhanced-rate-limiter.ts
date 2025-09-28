import { Logger } from './logger.js';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
  onLimitReached?: (key: string, req: any) => void;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export interface SlidingWindowEntry {
  timestamp: number;
  count: number;
}

/**
 * Enhanced rate limiter with sliding window algorithm
 */
export class EnhancedRateLimiter {
  private windows: Map<string, SlidingWindowEntry[]> = new Map();
  private config: RateLimitConfig;
  private logger: Logger;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: RateLimitConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || new Logger();
    this.startCleanupInterval();
  }

  /**
   * Check if request is allowed
   */
  public isAllowed(key: string, req?: any): RateLimitInfo {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Get or create window for this key
    let window = this.windows.get(key) || [];
    
    // Remove old entries outside the window
    window = window.filter(entry => entry.timestamp > windowStart);
    
    // Count total requests in current window
    const currentCount = window.reduce((sum, entry) => sum + entry.count, 0);
    
    // Check if limit is exceeded
    const isAllowed = currentCount < this.config.maxRequests;
    
    if (isAllowed) {
      // Add current request
      window.push({ timestamp: now, count: 1 });
      this.windows.set(key, window);
    } else {
      // Call limit reached callback
      if (this.config.onLimitReached && req) {
        this.config.onLimitReached(key, req);
      }
    }

    // Calculate reset time (oldest entry + window size)
    const oldestEntry = window[0];
    const resetTime = oldestEntry ? oldestEntry.timestamp + this.config.windowMs : now + this.config.windowMs;
    
    // Calculate retry after (time until oldest entry expires)
    const retryAfter = oldestEntry ? Math.ceil((oldestEntry.timestamp + this.config.windowMs - now) / 1000) : 0;

    return {
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - currentCount - (isAllowed ? 1 : 0)),
      resetTime,
      retryAfter: isAllowed ? undefined : retryAfter
    };
  }

  /**
   * Record a request (for tracking purposes)
   */
  public recordRequest(key: string, success: boolean = true): void {
    if (this.config.skipSuccessfulRequests && success) {
      return;
    }
    
    if (this.config.skipFailedRequests && !success) {
      return;
    }

    // This is already handled in isAllowed, but can be used for additional tracking
    this.logger.debug('Rate limiter request recorded', {
      key: this.hashKey(key),
      success,
      timestamp: Date.now()
    });
  }

  /**
   * Get current rate limit info without consuming a request
   */
  public getInfo(key: string): RateLimitInfo {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    let window = this.windows.get(key) || [];
    window = window.filter(entry => entry.timestamp > windowStart);
    
    const currentCount = window.reduce((sum, entry) => sum + entry.count, 0);
    const oldestEntry = window[0];
    const resetTime = oldestEntry ? oldestEntry.timestamp + this.config.windowMs : now + this.config.windowMs;
    
    return {
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - currentCount),
      resetTime
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  public reset(key: string): void {
    this.windows.delete(key);
    this.logger.info('Rate limit reset', { key: this.hashKey(key) });
  }

  /**
   * Get statistics for all keys
   */
  public getStats(): {
    totalKeys: number;
    activeKeys: number;
    totalRequests: number;
    averageRequestsPerKey: number;
  } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    let totalRequests = 0;
    let activeKeys = 0;
    
    for (const [key, window] of this.windows.entries()) {
      const activeWindow = window.filter(entry => entry.timestamp > windowStart);
      if (activeWindow.length > 0) {
        activeKeys++;
        totalRequests += activeWindow.reduce((sum, entry) => sum + entry.count, 0);
      }
    }
    
    return {
      totalKeys: this.windows.size,
      activeKeys,
      totalRequests,
      averageRequestsPerKey: activeKeys > 0 ? totalRequests / activeKeys : 0
    };
  }

  /**
   * Cleanup old windows
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs * 2; // Keep 2x window size for safety
    
    let cleanedKeys = 0;
    
    for (const [key, window] of this.windows.entries()) {
      const activeWindow = window.filter(entry => entry.timestamp > cutoff);
      
      if (activeWindow.length === 0) {
        this.windows.delete(key);
        cleanedKeys++;
      } else {
        this.windows.set(key, activeWindow);
      }
    }
    
    if (cleanedKeys > 0) {
      this.logger.debug('Rate limiter cleanup', {
        cleanedKeys,
        remainingKeys: this.windows.size
      });
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.windowMs); // Cleanup every window period
  }

  /**
   * Hash sensitive keys for privacy
   */
  private hashKey(key: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 8);
  }

  /**
   * Destroy the rate limiter
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.windows.clear();
  }
}

/**
 * Rate limiter factory for common use cases
 */
export class RateLimiterFactory {
  /**
   * Create a rate limiter for API endpoints
   */
  public static createApiRateLimiter(
    windowMs: number = 60000,
    maxRequests: number = 100,
    logger?: Logger
  ): EnhancedRateLimiter {
    return new EnhancedRateLimiter({
      windowMs,
      maxRequests,
      keyGenerator: (req) => req.ip || 'unknown',
      onLimitReached: (key, req) => {
        logger?.warn('API rate limit exceeded', {
          key: key.substring(0, 8),
          ip: req.ip,
          userAgent: req.headers?.['user-agent'],
          url: req.url
        });
      }
    }, logger);
  }

  /**
   * Create a rate limiter for provider operations
   */
  public static createProviderRateLimiter(
    provider: string,
    windowMs: number = 60000,
    maxRequests: number = 50,
    logger?: Logger
  ): EnhancedRateLimiter {
    return new EnhancedRateLimiter({
      windowMs,
      maxRequests,
      keyGenerator: () => `provider:${provider}`,
      onLimitReached: (key) => {
        logger?.warn('Provider rate limit exceeded', {
          provider,
          key: key.substring(0, 8)
        });
      }
    }, logger);
  }

  /**
   * Create a rate limiter for user operations
   */
  public static createUserRateLimiter(
    windowMs: number = 60000,
    maxRequests: number = 200,
    logger?: Logger
  ): EnhancedRateLimiter {
    return new EnhancedRateLimiter({
      windowMs,
      maxRequests,
      keyGenerator: (req) => {
        // Use user ID if available, otherwise fall back to IP
        return req.user?.id || req.ip || 'anonymous';
      },
      onLimitReached: (key, req) => {
        logger?.warn('User rate limit exceeded', {
          key: key.substring(0, 8),
          userId: req.user?.id,
          ip: req.ip
        });
      }
    }, logger);
  }
}

/**
 * Middleware for Express/Fastify integration
 */
export function createRateLimitMiddleware(rateLimiter: EnhancedRateLimiter) {
  return (req: any, res: any, next?: () => void) => {
    const key = rateLimiter['config'].keyGenerator?.(req) || req.ip || 'unknown';
    const info = rateLimiter.isAllowed(key, req);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', info.limit);
    res.setHeader('X-RateLimit-Remaining', info.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(info.resetTime).toISOString());
    
    if (info.retryAfter) {
      res.setHeader('Retry-After', info.retryAfter);
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Try again in ${info.retryAfter} seconds.`,
        retryAfter: info.retryAfter
      });
      return;
    }
    
    if (next) {
      next();
    }
  };
}