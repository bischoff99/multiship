import EasyPost from '@easypost/api';
import { ProviderAdapter, ShipmentInput, RateQuote, PurchaseResult, CircuitBreakerState } from '../types.js';
import { MemoryCache } from '../cache/memory-cache.js';
import { RedisCache } from '../cache/redis-cache.js';
import { Cacheable, CacheInvalidate, CacheUtils } from '../cache/cache-decorator.js';
import { cacheConfig, CacheConfigUtils } from '../config/cache-config.js';

export class EasyPostAdapter implements ProviderAdapter {
  readonly name = 'easypost';
  readonly enabled: boolean;
  private client: any;
  private cache: any;
  private circuitBreaker: CircuitBreakerState;
  private readonly MAX_FAILURES = 5;
  private readonly TIMEOUT_MS = 30000;
  private readonly HALF_OPEN_TIMEOUT_MS = 60000;

  constructor() {
    const apiKey = process.env.EASYPOST_API_KEY;
    this.enabled = Boolean(apiKey);
    this.client = new (EasyPost as any)(apiKey!);

    // Initialize cache based on configuration
    this.initializeCache();

    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED'
    };
  }

  /**
   * Initialize cache instance based on configuration
   */
  private initializeCache(): void {
    const config = cacheConfig.getConfig();

    if (!config.enabled) {
      return;
    }

    if (config.provider === 'redis') {
      this.cache = new RedisCache(config.redis);
    } else {
      this.cache = new MemoryCache(config.memory);
    }
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check circuit breaker
        if (!this.canExecute()) {
          throw new Error(`EasyPost circuit breaker is ${this.circuitBreaker.state}`);
        }

        const result = await Promise.race([
          operation(),
          this.timeoutPromise()
        ]);

        // Success - reset circuit breaker
        this.onSuccess();
        return result;
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          this.onFailure();
          throw error;
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw lastError!;
  }

  private canExecute(): boolean {
    const now = Date.now();

    switch (this.circuitBreaker.state) {
      case 'CLOSED':
        return true;
      case 'OPEN':
        if (now - this.circuitBreaker.lastFailureTime > this.HALF_OPEN_TIMEOUT_MS) {
          this.circuitBreaker.state = 'HALF_OPEN';
          return true;
        }
        return false;
      case 'HALF_OPEN':
        return true;
      default:
        return false;
    }
  }

  private onSuccess(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.state = 'CLOSED';
  }

  private onFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failures >= this.MAX_FAILURES) {
      this.circuitBreaker.state = 'OPEN';
    }
  }

  private timeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('EasyPost request timeout')), this.TIMEOUT_MS);
    });
  }

  async quote(input: ShipmentInput): Promise<RateQuote[]> {
    return this.executeWithRetry(async () => {
      // Check if caching is enabled and should be used for this operation
      if (this.cache && CacheConfigUtils.shouldCache('rateQuote', cacheConfig.getConfig())) {
        return this.getCachedQuote(input);
      }

      return this.getFreshQuote(input);
    });
  }

  /**
   * Get cached quote if available, otherwise fetch fresh quote
   */
  private async getCachedQuote(input: ShipmentInput): Promise<RateQuote[]> {
    const cacheKey = CacheConfigUtils.createRateQuoteKey('easypost', input.from, input.to, input.parcel);
    const ttl = cacheConfig.getTTL('rateQuote');

    try {
      // Try to get from cache first
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      // Cache miss - get fresh quote and cache it
      const freshResult = await this.getFreshQuote(input);
      await this.cache.set(cacheKey, freshResult, { ttl });

      return freshResult;
    } catch (error) {
      console.error('Cache error, falling back to fresh quote:', error);
      return this.getFreshQuote(input);
    }
  }

  /**
   * Get fresh quote from EasyPost API
   */
  private async getFreshQuote(input: ShipmentInput): Promise<RateQuote[]> {
    const shipment = await this.client.Shipment.create({
      to_address: input.to,
      from_address: input.from,
      parcel: {
        length: input.parcel.length,
        width: input.parcel.width,
        height: input.parcel.height,
        weight: input.parcel.weight
      },
      reference: input.reference
    });

    return (shipment.rates ?? []).map((r: any) => ({
      provider: 'easypost' as const,
      rateId: r.id,
      shipmentId: shipment.id,
      service: r.service,
      carrier: r.carrier,
      amount: Math.round(Number(r.rate) * 100),
      currency: r.currency,
      estDeliveryDays: r.est_delivery_days ?? null
    }));
  }

  async purchase(rateId: string, shipmentId?: string): Promise<PurchaseResult> {
    if (!shipmentId) {
      throw new Error('shipmentId is required for EasyPost purchases');
    }

    const result = await this.executeWithRetry(async () => {
      const bought = await this.client.Shipment.buy(shipmentId, { id: rateId });
      return {
        provider: 'easypost' as const,
        shipmentId: bought.id,
        labelUrl: bought.postage_label?.label_url,
        trackingCode: bought.tracking_code
      };
    });

    // Invalidate related caches after successful purchase
    if (this.cache) {
      try {
        const rateQuotePattern = CacheConfigUtils.createRateQuoteKey('easypost', {}, {}, {});
        const keys = await this.cache.keys(rateQuotePattern);
        for (const key of keys) {
          await this.cache.delete(key);
        }
      } catch (error) {
        console.error('Failed to invalidate cache after purchase:', error);
      }
    }

    return result;
  }

  async healthCheck(): Promise<boolean> {
    // Use caching for health checks with shorter TTL
    if (this.cache && CacheConfigUtils.shouldCache('healthCheck', cacheConfig.getConfig())) {
      const cacheKey = CacheConfigUtils.createHealthCheckKey('easypost');
      const ttl = cacheConfig.getTTL('healthCheck');

      try {
        const cached = await this.cache.get(cacheKey);
        if (cached !== null) {
          return cached;
        }

        const isHealthy = await this.performHealthCheck();
        await this.cache.set(cacheKey, isHealthy, { ttl });
        return isHealthy;
      } catch (error) {
        console.error('Cache error during health check, performing direct check:', error);
        return this.performHealthCheck();
      }
    }

    return this.performHealthCheck();
  }

  /**
   * Perform actual health check against EasyPost API
   */
  private async performHealthCheck(): Promise<boolean> {
    try {
      // Simple API call to check if service is responsive
      await this.client.Shipment.retrieve('test');
      return true;
    } catch (error) {
      return false;
    }
  }
}