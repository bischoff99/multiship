import ShippoSDK from 'shippo';
import { ProviderAdapter, ShipmentInput, RateQuote, PurchaseResult, CircuitBreakerState } from '../types.js';
import { MemoryCache } from '../cache/memory-cache.js';
import { RedisCache } from '../cache/redis-cache.js';
import { cacheConfig, CacheConfigUtils } from '../config/cache-config.js';
import { Logger, LogLevel } from '../utils/logger.js';
import { CircuitBreaker } from '../utils/circuit-breaker.js';
import {
  ProviderError,
  NetworkError,
  ConfigurationError,
  TimeoutError,
  CircuitBreakerError,
  RateLimitError,
  classifyError,
  createErrorContext,
  generateCorrelationId
} from '../errors/provider-errors.js';
import { getProviderConfig } from '../config/provider-config.js';

export class ShippoAdapter implements ProviderAdapter {
  readonly name = 'shippo';
  readonly enabled: boolean;
  private client: any;
  private cache: any;
  private circuitBreaker: CircuitBreaker;
  private config: any;
  private logger: Logger;

  constructor() {
    this.config = getProviderConfig('shippo');
    const apiKey = process.env.SHIPPO_API_KEY;
    this.enabled = Boolean(apiKey) && this.config.enabled;

    this.client = new (ShippoSDK as any)(apiKey!);

    // Initialize logger with provider-specific configuration
    this.logger = new Logger(
      this.config.logLevel,
      [new (require('../utils/logger.js').ConsoleDestination)()],
      { provider: this.name }
    );

    // Initialize cache based on configuration
    this.initializeCache();

    // Initialize circuit breaker with configuration
    this.circuitBreaker = new CircuitBreaker(
      this.config.circuitBreaker,
      this.logger
    );

    this.logger.info('ShippoAdapter initialized', {
      enabled: this.enabled,
      circuitBreakerState: this.circuitBreaker.getState().state
    });
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

  private async executeWithRetry<T>(operation: () => Promise<T>, maxRetries?: number): Promise<T> {
    const config = this.config.retry;
    const retryCount = maxRetries ?? config.maxRetries;
    let lastError: ProviderError;

    const logger = this.logger.withContext({ operation: 'executeWithRetry' });

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        // Use circuit breaker to execute operation
        const result = await this.circuitBreaker.execute(async () => {
          return await Promise.race([
            operation(),
            this.timeoutPromise()
          ]);
        }, 'executeWithRetry');

        logger.debug('Operation succeeded', { attempt, totalAttempts: retryCount });
        return result;
      } catch (error) {
        const providerError = classifyError(error, this.name, 'executeWithRetry', {
          attempt,
          maxRetries: retryCount
        });

        lastError = providerError;
        logger.warn('Operation attempt failed', {
          attempt,
          maxRetries: retryCount,
          errorMessage: providerError.message,
          isRetryable: providerError.isRetryable
        }, providerError);

        if (attempt === retryCount) {
          logger.error('All retry attempts exhausted', {
            attempt,
            maxRetries: retryCount,
            finalError: providerError.message
          }, providerError);
          throw providerError;
        }

        // Wait before retry with exponential backoff
        const delay = Math.min(
          config.baseDelayMs * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelayMs
        );

        logger.info('Retrying after delay', { delay, attempt, maxRetries: retryCount });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }


  private timeoutPromise(): Promise<never> {
    const timeoutMs = this.config.timeouts.requestTimeout;
    return new Promise((_, reject) => {
      setTimeout(() => {
        const timeoutError = new TimeoutError(
          'Shippo request timeout',
          this.name,
          'request',
          timeoutMs
        );
        this.logger.logTimeout(this.name, 'request', timeoutMs);
        reject(timeoutError);
      }, timeoutMs);
    });
  }

  async quote(input: ShipmentInput): Promise<RateQuote[]> {
    const correlationId = this.logger.generateCorrelationId();
    const logger = this.logger.withCorrelationId(correlationId).forOperation('quote');

    return this.executeWithRetry(async () => {
      try {
        logger.info('Getting rate quote', {
          correlationId,
          from: input.from,
          to: input.to,
          parcel: input.parcel
        });

        // Check if caching is enabled and should be used for this operation
        if (this.cache && CacheConfigUtils.shouldCache('rateQuote', cacheConfig.getConfig())) {
          return this.getCachedQuote(input, correlationId, logger);
        }

        return this.getFreshQuote(input, correlationId, logger);
      } catch (error) {
        logger.error('Rate quote failed', { correlationId }, error instanceof Error ? error : undefined);
        throw error;
      }
    });
  }

  /**
   * Get cached quote if available, otherwise fetch fresh quote
   */
  private async getCachedQuote(input: ShipmentInput, correlationId: string, logger: any): Promise<RateQuote[]> {
    const cacheKey = CacheConfigUtils.createRateQuoteKey('shippo', input.from, input.to, input.parcel);
    const ttl = cacheConfig.getTTL('rateQuote');

    try {
      // Try to get from cache first
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        logger.debug('Cache hit for rate quote', { correlationId, cacheKey });
        return cachedResult;
      }

      // Cache miss - get fresh quote and cache it
      const freshResult = await this.getFreshQuote(input, correlationId, logger);
      await this.cache.set(cacheKey, freshResult, { ttl });

      logger.debug('Cached fresh quote result', { correlationId, cacheKey });
      return freshResult;
    } catch (error) {
      logger.warn('Cache error, falling back to fresh quote', { correlationId, error: error instanceof Error ? error.message : String(error) });
      return this.getFreshQuote(input, correlationId, logger);
    }
  }

  /**
   * Get fresh quote from Shippo API
   */
  private async getFreshQuote(input: ShipmentInput, correlationId: string, logger: any): Promise<RateQuote[]> {
    logger.debug('Creating shipment for rate quote', { correlationId });

    const shipment = await this.client.shipment.create({
      address_from: input.from,
      address_to: input.to,
      parcels: [{
        length: String(input.parcel.length),
        width: String(input.parcel.width),
        height: String(input.parcel.height),
        distance_unit: input.parcel.distance_unit ?? 'in',
        weight: String(input.parcel.weight),
        mass_unit: input.parcel.mass_unit ?? 'oz'
      }],
      async: false
    });

    logger.debug('Shipment created, processing rates', {
      correlationId,
      shipmentId: shipment.object_id,
      ratesCount: (shipment.rates ?? shipment.rates_list ?? []).length
    });

    const rates = shipment.rates ?? shipment.rates_list ?? [];
    return rates.map((r: any) => ({
      provider: 'shippo' as const,
      rateId: r.object_id,
      shipmentId: shipment.object_id,
      service: r.servicelevel?.name ?? r.servicelevel?.token ?? r.servicelevel,
      carrier: r.provider ?? r.carrier,
      amount: Math.round(Number(r.amount) * 100),
      currency: r.currency,
      estDeliveryDays: r.estimated_days ?? null
    }));
  }

  async purchase(rateId: string, shipmentId?: string): Promise<PurchaseResult> {
    const correlationId = this.logger.generateCorrelationId();
    const logger = this.logger.withCorrelationId(correlationId).forOperation('purchase');

    logger.info('Purchasing shipment', { correlationId, rateId, shipmentId });

    const result = await this.executeWithRetry(async () => {
      const tx = await this.client.transaction.create({
        rate: rateId,
        async: false
      });

      if (tx.status !== 'SUCCESS') {
        const purchaseError = new ConfigurationError(
          `Shippo purchase failed: ${tx.status}`,
          this.name,
          createErrorContext({
            provider: this.name,
            operation: 'purchase',
            correlationId,
            rateId,
            shipmentId
          })
        );
        logger.error('Purchase failed', { correlationId, status: tx.status }, purchaseError);
        throw purchaseError;
      }

      return {
        provider: 'shippo' as const,
        shipmentId: tx.shipment,
        labelUrl: tx.label_url,
        trackingCode: tx.tracking_number
      };
    });

    logger.info('Shipment purchased successfully', {
      correlationId,
      purchasedShipmentId: result.shipmentId,
      trackingCode: result.trackingCode
    });

    // Invalidate related caches after successful purchase
    if (this.cache) {
      try {
        const rateQuotePattern = CacheConfigUtils.createRateQuoteKey('shippo', {}, {}, {});
        const keys = await this.cache.keys(rateQuotePattern);
        for (const key of keys) {
          await this.cache.delete(key);
        }
        logger.debug('Cache invalidated after purchase', { correlationId, keysInvalidated: keys.length });
      } catch (error) {
        logger.warn('Failed to invalidate cache after purchase', {
          correlationId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return result;
  }

  async healthCheck(): Promise<boolean> {
    const correlationId = this.logger.generateCorrelationId();
    const logger = this.logger.withCorrelationId(correlationId).forOperation('healthCheck');

    // Use caching for health checks with shorter TTL
    if (this.cache && CacheConfigUtils.shouldCache('healthCheck', cacheConfig.getConfig())) {
      const cacheKey = CacheConfigUtils.createHealthCheckKey('shippo');
      const ttl = cacheConfig.getTTL('healthCheck');

      try {
        const cached = await this.cache.get(cacheKey);
        if (cached !== null) {
          logger.debug('Health check cache hit', { correlationId, cached });
          return cached;
        }

        const isHealthy = await this.performHealthCheck(correlationId, logger);
        await this.cache.set(cacheKey, isHealthy, { ttl });
        logger.debug('Health check cache updated', { correlationId, isHealthy });
        return isHealthy;
      } catch (error) {
        logger.warn('Cache error during health check, performing direct check', {
          correlationId,
          error: error instanceof Error ? error.message : String(error)
        });
        return this.performHealthCheck(correlationId, logger);
      }
    }

    return this.performHealthCheck(correlationId, logger);
  }

  /**
   * Perform actual health check against Shippo API
   */
  private async performHealthCheck(correlationId: string, logger: any): Promise<boolean> {
    try {
      // Simple API call to check if service is responsive
      await this.client.address.create({
        name: 'Test',
        street1: 'Test St',
        city: 'Test City',
        state: 'TS',
        zip: '12345',
        country: 'US'
      });
      logger.debug('Health check successful', { correlationId });
      return true;
    } catch (error) {
      const healthError = classifyError(error, this.name, 'healthCheck', {
        correlationId
      });
      logger.error('Health check failed', { correlationId }, healthError);
      return false;
    }
  }
}