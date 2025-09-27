// Cache interface and base classes
export { BaseCache } from './cache-interface.js';
export type { CacheInterface, CacheStats, CacheOptions, CacheEntry } from '../types.js';

// Cache implementations
export { MemoryCache } from './memory-cache.js';
export { RedisCache, type RedisCacheConfig } from './redis-cache.js';

// Cache decorators and utilities
export {
  Cacheable,
  CacheInvalidate,
  CacheUpdate,
  ConditionalCache,
  TimeCache,
  CacheUtils,
  type CacheDecoratorOptions,
  type KeyStrategy
} from './cache-decorator.js';

// Cache configuration
export {
  CacheConfigManager,
  cacheConfig,
  CacheConfigUtils,
  type CacheConfig,
  type TTLOptions,
  type CacheProvider
} from '../config/cache-config.js';

// Cache warming
export {
  CacheWarmer,
  DEFAULT_WARMUP_ROUTES,
  type CacheWarmupConfig,
  type CacheWarmupRoute,
  type CacheWarmupResult
} from './cache-warmer.js';