import { Logger } from '../utils/logger.js';
import { CacheError } from '../errors/provider-errors.js';
import { CacheInterface, CacheStats, CacheOptions } from '../types.js';

export interface CacheManagerConfig {
  defaultTTL: number;
  maxRetries: number;
  retryDelayMs: number;
  enableMetrics: boolean;
  enableCompression: boolean;
  compressionThreshold: number;
}

export class CacheManager {
  private cache: CacheInterface;
  private logger: Logger;
  private config: CacheManagerConfig;
  private stats: CacheStats;
  private errorCount = 0;
  private totalRequests = 0;

  constructor(
    cache: CacheInterface,
    logger: Logger,
    config: Partial<CacheManagerConfig> = {}
  ) {
    this.cache = cache;
    this.logger = logger;
    this.config = {
      defaultTTL: 300000, // 5 minutes
      maxRetries: 3,
      retryDelayMs: 100,
      enableMetrics: true,
      enableCompression: true,
      compressionThreshold: 1024, // 1KB
      ...config
    };

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0
    };
  }

  /**
   * Get value from cache with retry logic and metrics
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const startTime = Date.now();
    this.totalRequests++;

    try {
      const result = await this.executeWithRetry(
        () => this.cache.get(key),
        'get',
        key
      );

      if (result !== null) {
        this.stats.hits++;
        this.logger.debug('Cache hit', {
          key,
          duration: Date.now() - startTime,
          size: this.getSize(result)
        });
      } else {
        this.stats.misses++;
        this.logger.debug('Cache miss', {
          key,
          duration: Date.now() - startTime
        });
      }

      return result;
    } catch (error) {
      this.errorCount++;
      this.logger.error('Cache get error', { key }, error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        `Failed to get cache value for key: ${key}`,
        'cache-manager',
        'get',
        key,
        'get',
        { correlationId: this.getCorrelationId() }
      );
    }
  }

  /**
   * Set value in cache with compression and retry logic
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const startTime = Date.now();
    this.totalRequests++;

    try {
      const processedValue = this.processValue(value);
      const ttl = options.ttl || this.config.defaultTTL;

      await this.executeWithRetry(
        () => this.cache.set(key, processedValue, { ...options, ttl }),
        'set',
        key
      );

      this.stats.sets++;
      this.logger.debug('Cache set', {
        key,
        duration: Date.now() - startTime,
        ttl,
        size: this.getSize(processedValue)
      });
    } catch (error) {
      this.errorCount++;
      this.logger.error('Cache set error', { key }, error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        `Failed to set cache value for key: ${key}`,
        'cache-manager',
        'set',
        key,
        'set',
        { correlationId: this.getCorrelationId() }
      );
    }
  }

  /**
   * Delete value from cache with retry logic
   */
  async delete(key: string): Promise<boolean> {
    const startTime = Date.now();
    this.totalRequests++;

    try {
      const result = await this.executeWithRetry(
        () => this.cache.delete(key),
        'delete',
        key
      );

      this.stats.deletes++;
      this.logger.debug('Cache delete', {
        key,
        duration: Date.now() - startTime,
        success: result
      });

      return result;
    } catch (error) {
      this.errorCount++;
      this.logger.error('Cache delete error', { key }, error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        `Failed to delete cache value for key: ${key}`,
        'cache-manager',
        'delete',
        key,
        'delete',
        { correlationId: this.getCorrelationId() }
      );
    }
  }

  /**
   * Get multiple values from cache
   */
  async mget<T>(keys: string[]): Promise<Map<string, T | null>> {
    const startTime = Date.now();
    this.totalRequests += keys.length;

    try {
      const results = new Map<string, T | null>();
      
      // Execute in parallel for better performance
      const promises = keys.map(async (key) => {
        try {
          const value = await this.get<T>(key);
          results.set(key, value);
        } catch (error) {
          this.logger.warn('Failed to get individual cache key', { key }, error instanceof Error ? error : new Error(String(error)));
          results.set(key, null);
        }
      });

      await Promise.all(promises);

      this.logger.debug('Cache mget completed', {
        keys: keys.length,
        duration: Date.now() - startTime,
        hits: Array.from(results.values()).filter(v => v !== null).length
      });

      return results;
    } catch (error) {
      this.logger.error('Cache mget error', { keys: keys.length }, error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        `Failed to get multiple cache values`,
        'cache-manager',
        'mget',
        undefined,
        'mget',
        { correlationId: this.getCorrelationId() }
      );
    }
  }

  /**
   * Set multiple values in cache
   */
  async mset<T>(entries: Map<string, T>, options: CacheOptions = {}): Promise<void> {
    const startTime = Date.now();
    this.totalRequests += entries.size;

    try {
      // Execute in parallel for better performance
      const promises = Array.from(entries.entries()).map(async ([key, value]) => {
        try {
          await this.set(key, value, options);
        } catch (error) {
          this.logger.warn('Failed to set individual cache key', { key }, error instanceof Error ? error : new Error(String(error)));
        }
      });

      await Promise.all(promises);

      this.logger.debug('Cache mset completed', {
        entries: entries.size,
        duration: Date.now() - startTime
      });
    } catch (error) {
      this.logger.error('Cache mset error', { entries: entries.size }, error instanceof Error ? error : new Error(String(error)));
      throw new CacheError(
        `Failed to set multiple cache values`,
        'cache-manager',
        'mset',
        undefined,
        'mset',
        { correlationId: this.getCorrelationId() }
      );
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: number; errors: number; totalRequests: number } {
    const hitRate = this.totalRequests > 0 
      ? (this.stats.hits / this.totalRequests) * 100 
      : 0;

    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      errors: this.errorCount,
      totalRequests: this.totalRequests
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0
    };
    this.errorCount = 0;
    this.totalRequests = 0;
    this.logger.info('Cache statistics reset');
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationType: string,
    key?: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.config.maxRetries) {
          break;
        }

        this.logger.warn('Cache operation retry', {
          operation: operationType,
          attempt,
          maxRetries: this.config.maxRetries,
          key,
          error: lastError.message
        });

        await new Promise(resolve => 
          setTimeout(resolve, this.config.retryDelayMs * attempt)
        );
      }
    }

    throw lastError!;
  }

  /**
   * Process value before caching (compression, serialization, etc.)
   */
  private processValue<T>(value: T): T {
    if (!this.config.enableCompression) {
      return value;
    }

    const serialized = JSON.stringify(value);
    if (serialized.length > this.config.compressionThreshold) {
      // In a real implementation, you'd compress the data here
      // For now, we'll just return the original value
      this.logger.debug('Value would be compressed', {
        originalSize: serialized.length,
        threshold: this.config.compressionThreshold
      });
    }

    return value;
  }

  /**
   * Get approximate size of a value
   */
  private getSize(value: any): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  /**
   * Get correlation ID from logger context
   */
  private getCorrelationId(): string | undefined {
    // Access logger context safely
    try {
      return (this.logger as any).context?.correlationId;
    } catch {
      return undefined;
    }
  }
}