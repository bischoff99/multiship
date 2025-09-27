import { RedisCacheConfig } from '../cache/redis-cache.js';

/**
 * Cache provider types
 */
export type CacheProvider = 'memory' | 'redis';

/**
 * TTL configurations for different operation types
 */
export interface TTLOptions {
  // Rate quote operations
  rateQuote: number;
  rateQuoteProvider: number;

  // Health check operations
  healthCheck: number;

  // Purchase operations
  purchase: number;

  // Default TTL
  default: number;

  // Custom TTLs
  custom: Record<string, number>;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  provider: CacheProvider;
  enabled: boolean;

  // Memory cache options
  memory: {
    maxSize: number;
    defaultTTL: number;
    cleanupInterval: number;
  };

  // Redis cache options
  redis: RedisCacheConfig;

  // TTL settings
  ttl: TTLOptions;

  // Environment-based overrides
  environment: 'development' | 'test' | 'staging' | 'production';
}

/**
 * Default TTL values (in milliseconds)
 */
const DEFAULT_TTL: TTLOptions = {
  rateQuote: 5 * 60 * 1000,        // 5 minutes
  rateQuoteProvider: 10 * 60 * 1000, // 10 minutes
  healthCheck: 30 * 1000,          // 30 seconds
  purchase: 60 * 60 * 1000,        // 1 hour
  default: 5 * 60 * 1000,          // 5 minutes
  custom: {}
};

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  provider: 'memory',
  enabled: true,

  memory: {
    maxSize: 1000,
    defaultTTL: 5 * 60 * 1000,     // 5 minutes
    cleanupInterval: 60 * 1000     // 1 minute
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: 'multiship:cache:',
    connectionTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: true,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false
  },

  ttl: DEFAULT_TTL,

  environment: (process.env.NODE_ENV as any) || 'development'
};

/**
 * Environment-specific configurations
 */
const ENVIRONMENT_CONFIGS: Record<string, Partial<CacheConfig>> = {
  development: {
    enabled: true,
    provider: 'memory',
    memory: {
      maxSize: 100,
      defaultTTL: 60 * 1000,     // 1 minute for dev
      cleanupInterval: 30 * 1000 // 30 seconds
    }
  },

  test: {
    enabled: true,
    provider: 'memory',
    memory: {
      maxSize: 50,
      defaultTTL: 1000,          // 1 second for tests
      cleanupInterval: 500       // 500ms
    }
  },

  staging: {
    enabled: true,
    provider: 'redis',
    ttl: {
      ...DEFAULT_TTL,
      rateQuote: 10 * 60 * 1000,     // 10 minutes
      rateQuoteProvider: 15 * 60 * 1000 // 15 minutes
    }
  },

  production: {
    enabled: true,
    provider: 'redis',
    ttl: {
      ...DEFAULT_TTL,
      rateQuote: 15 * 60 * 1000,     // 15 minutes
      rateQuoteProvider: 30 * 60 * 1000 // 30 minutes
    }
  }
};

/**
 * Cache configuration manager
 */
export class CacheConfigManager {
  private static instance: CacheConfigManager;
  private config: CacheConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CacheConfigManager {
    if (!CacheConfigManager.instance) {
      CacheConfigManager.instance = new CacheConfigManager();
    }
    return CacheConfigManager.instance;
  }

  /**
   * Load configuration with environment overrides
   */
  private loadConfig(): CacheConfig {
    const env = this.detectEnvironment();
    const baseConfig = { ...DEFAULT_CONFIG };
    const envConfig = ENVIRONMENT_CONFIGS[env] || {};

    // Merge configurations
    const mergedConfig: CacheConfig = {
      ...baseConfig,
      ...envConfig,
      environment: env,

      // Deep merge for nested objects
      memory: {
        ...baseConfig.memory,
        ...envConfig.memory
      },

      redis: {
        ...baseConfig.redis,
        ...envConfig.redis
      },

      ttl: {
        ...baseConfig.ttl,
        ...envConfig.ttl,
        custom: {
          ...baseConfig.ttl.custom,
          ...envConfig.ttl?.custom
        }
      }
    };

    // Override with environment variables
    this.applyEnvironmentVariables(mergedConfig);

    return mergedConfig;
  }

  /**
   * Detect current environment
   */
  private detectEnvironment(): 'development' | 'test' | 'staging' | 'production' {
    const env = process.env.NODE_ENV?.toLowerCase();

    if (env === 'test') return 'test';
    if (env === 'production') return 'production';
    if (env === 'staging') return 'staging';

    return 'development';
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentVariables(config: CacheConfig): void {
    // Cache provider
    if (process.env.CACHE_PROVIDER) {
      config.provider = process.env.CACHE_PROVIDER as CacheProvider;
    }

    // Cache enabled
    if (process.env.CACHE_ENABLED !== undefined) {
      config.enabled = process.env.CACHE_ENABLED === 'true';
    }

    // Memory cache settings
    if (process.env.CACHE_MEMORY_MAX_SIZE) {
      config.memory.maxSize = parseInt(process.env.CACHE_MEMORY_MAX_SIZE, 10);
    }

    if (process.env.CACHE_MEMORY_DEFAULT_TTL) {
      config.memory.defaultTTL = parseInt(process.env.CACHE_MEMORY_DEFAULT_TTL, 10);
    }

    // TTL settings
    if (process.env.CACHE_TTL_RATE_QUOTE) {
      config.ttl.rateQuote = parseInt(process.env.CACHE_TTL_RATE_QUOTE, 10);
    }

    if (process.env.CACHE_TTL_RATE_QUOTE_PROVIDER) {
      config.ttl.rateQuoteProvider = parseInt(process.env.CACHE_TTL_RATE_QUOTE_PROVIDER, 10);
    }

    if (process.env.CACHE_TTL_HEALTH_CHECK) {
      config.ttl.healthCheck = parseInt(process.env.CACHE_TTL_HEALTH_CHECK, 10);
    }

    if (process.env.CACHE_TTL_PURCHASE) {
      config.ttl.purchase = parseInt(process.env.CACHE_TTL_PURCHASE, 10);
    }

    if (process.env.CACHE_TTL_DEFAULT) {
      config.ttl.default = parseInt(process.env.CACHE_TTL_DEFAULT, 10);
    }

    // Redis settings
    if (process.env.REDIS_HOST) {
      config.redis.host = process.env.REDIS_HOST;
    }

    if (process.env.REDIS_PORT) {
      config.redis.port = parseInt(process.env.REDIS_PORT, 10);
    }

    if (process.env.REDIS_PASSWORD) {
      config.redis.password = process.env.REDIS_PASSWORD;
    }

    if (process.env.REDIS_DB) {
      config.redis.db = parseInt(process.env.REDIS_DB, 10);
    }

    if (process.env.REDIS_KEY_PREFIX) {
      config.redis.keyPrefix = process.env.REDIS_KEY_PREFIX;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Get TTL for specific operation type
   */
  getTTL(operationType: keyof Omit<TTLOptions, 'custom'>): number {
    const ttl = this.config.ttl[operationType];
    return typeof ttl === 'number' ? ttl : this.config.ttl.default;
  }

  /**
   * Get TTL for custom operation
   */
  getCustomTTL(operation: string): number {
    return this.config.ttl.custom[operation] || this.config.ttl.default;
  }

  /**
   * Set TTL for custom operation
   */
  setCustomTTL(operation: string, ttl: number): void {
    this.config.ttl.custom[operation] = ttl;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<CacheConfig>): void {
    this.config = {
      ...this.config,
      ...updates,

      // Deep merge nested objects
      memory: {
        ...this.config.memory,
        ...updates.memory
      },

      redis: {
        ...this.config.redis,
        ...updates.redis
      },

      ttl: {
        ...this.config.ttl,
        ...updates.ttl,
        custom: {
          ...this.config.ttl.custom,
          ...updates.ttl?.custom
        }
      }
    };
  }

  /**
   * Reload configuration from environment
   */
  reload(): void {
    this.config = this.loadConfig();
  }

  /**
   * Get configuration summary for logging
   */
  getSummary(): Record<string, any> {
    return {
      provider: this.config.provider,
      enabled: this.config.enabled,
      environment: this.config.environment,
      memory: this.config.memory,
      ttl: this.config.ttl,
      redisConfigured: !!this.config.redis.host
    };
  }
}

/**
 * Global cache configuration instance
 */
export const cacheConfig = CacheConfigManager.getInstance();

/**
 * Utility functions for cache configuration
 */
export class CacheConfigUtils {
  /**
   * Create a cache key for rate quote operation
   */
  static createRateQuoteKey(
    provider: string,
    fromAddress: any,
    toAddress: any,
    parcel: any
  ): string {
    // Create a normalized key that ignores irrelevant differences
    const normalizedParcel = {
      weight: parcel.weight,
      dimensions: `${parcel.length}x${parcel.width}x${parcel.height}`
    };

    const keyData = {
      provider,
      from: this.normalizeAddress(fromAddress),
      to: this.normalizeAddress(toAddress),
      parcel: normalizedParcel
    };

    // Simple hash-based approach for cache key generation
    const hashStr = JSON.stringify(keyData);
    let hash = 0;
    for (let i = 0; i < hashStr.length; i++) {
      const char = hashStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `rate:${provider}:${Math.abs(hash)}`;
  }

  /**
   * Create a cache key for health check operation
   */
  static createHealthCheckKey(provider: string): string {
    return `health:${provider}`;
  }

  /**
   * Create a cache key for purchase operation
   */
  static createPurchaseKey(provider: string, rateId: string): string {
    return `purchase:${provider}:${rateId}`;
  }

  /**
   * Normalize address for consistent caching
   */
  private static normalizeAddress(address: any): any {
    return {
      city: address.city?.toLowerCase(),
      state: address.state?.toLowerCase(),
      zip: address.zip,
      country: address.country?.toLowerCase()
    };
  }

  /**
   * Check if operation should be cached based on environment
   */
  static shouldCache(operation: string, config: CacheConfig): boolean {
    if (!config.enabled) return false;

    // In development, cache less frequently
    if (config.environment === 'development') {
      const devCacheableOps = ['healthCheck'];
      return devCacheableOps.includes(operation);
    }

    // In test environment, generally don't cache
    if (config.environment === 'test') {
      return false;
    }

    return true;
  }
}