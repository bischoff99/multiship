import EasyPost from '@easypost/api';
import { ProviderAdapter, ShipmentInput, RateQuote, PurchaseResult, CircuitBreakerState } from '../types.js';
import { MemoryCache } from '../cache/memory-cache.js';
import { RedisCache } from '../cache/redis-cache.js';
import { Cacheable, CacheInvalidate, CacheUtils } from '../cache/cache-decorator.js';
import { cacheConfig, CacheConfigUtils } from '../config/cache-config.js';
import { Logger, LogLevel, ConsoleDestination } from '../utils/logger.js';
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

export class EasyPostAdapter implements ProviderAdapter {
  readonly name = 'easypost';
  readonly enabled: boolean;
  private client: any;
  private cache: any;
  private circuitBreaker: CircuitBreaker;
  private config: any;
  private logger: Logger;

  constructor() {
    this.config = getProviderConfig('easypost');
    const apiKey = process.env.EASYPOST_API_KEY || '';
    this.enabled = Boolean(apiKey) && this.config.enabled;

    this.client = new (EasyPost as any)(apiKey!);

    // Initialize logger with provider-specific configuration
    this.logger = new Logger(
      this.config.logLevel,
      [new ConsoleDestination()],
      { provider: this.name }
    );

    // Initialize cache based on configuration
    this.initializeCache();

    // Initialize circuit breaker with configuration
    this.circuitBreaker = new CircuitBreaker(
      this.config.circuitBreaker,
      this.logger
    );

    this.logger.info('EasyPostAdapter initialized', {
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
          'EasyPost request timeout',
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
    const cacheKey = CacheConfigUtils.createRateQuoteKey('easypost', input.from, input.to, input.parcel);
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
   * Get fresh quote from EasyPost API
   */
  private async getFreshQuote(input: ShipmentInput, correlationId: string, logger: any): Promise<RateQuote[]> {
    logger.debug('Creating shipment for rate quote', { correlationId });

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

    logger.debug('Shipment created, processing rates', {
      correlationId,
      shipmentId: shipment.id,
      ratesCount: (shipment.rates ?? []).length
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
    const correlationId = this.logger.generateCorrelationId();
    const logger = this.logger.withCorrelationId(correlationId).forOperation('purchase');

    if (!shipmentId) {
      const validationError = new ConfigurationError(
        'shipmentId is required for EasyPost purchases',
        this.name,
        createErrorContext({
          provider: this.name,
          operation: 'purchase',
          correlationId
        })
      );
      logger.error('Missing shipmentId', { correlationId }, validationError);
      throw validationError;
    }

    logger.info('Purchasing shipment', { correlationId, rateId, shipmentId });

    const result = await this.executeWithRetry(async () => {
      const bought = await this.client.Shipment.buy(shipmentId, { id: rateId });
      return {
        provider: 'easypost' as const,
        shipmentId: bought.id,
        labelUrl: bought.postage_label?.label_url,
        trackingCode: bought.tracking_code
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
        const rateQuotePattern = CacheConfigUtils.createRateQuoteKey('easypost', {}, {}, {});
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
      const cacheKey = CacheConfigUtils.createHealthCheckKey('easypost');
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
   * Perform actual health check against EasyPost API
   */
  private async performHealthCheck(correlationId: string, logger: any): Promise<boolean> {
    try {
      logger.debug('Performing health check', { correlationId });

      // Simple API call to check if service is responsive
      await this.client.Shipment.retrieve('test');

      logger.debug('Health check passed', { correlationId });
      return true;
    } catch (error) {
      logger.warn('Health check failed', {
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
}