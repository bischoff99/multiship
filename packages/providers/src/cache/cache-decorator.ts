import { CacheInterface, CacheOptions } from '../types.js';

/**
 * Cache key generation strategy
 */
export type KeyStrategy = 'simple' | 'hash' | 'custom' | ((...args: any[]) => string);

/**
 * Cache decorator options
 */
export interface CacheDecoratorOptions extends CacheOptions {
  key?: string | KeyStrategy;
  keyPrefix?: string;
  condition?: (...args: any[]) => boolean;
  excludeCondition?: (...args: any[]) => boolean;
  fallback?: () => any;
  onCacheHit?: (key: string, value: any) => void;
  onCacheMiss?: (key: string) => void;
  onError?: (error: Error, key: string) => void;
}

/**
 * Default cache key generator
 */
function generateCacheKey(methodName: string, args: any[], strategy: KeyStrategy): string {
  switch (strategy) {
    case 'simple':
      return `${methodName}:${JSON.stringify(args)}`;

    case 'hash':
      // Simple hash function for args
      const hash = JSON.stringify(args).split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);
      return `${methodName}:${hash}`;

    case 'custom':
      // Custom strategy should be provided as a function
      throw new Error('Custom key strategy requires a function');

    default:
      // If it's a function, use it
      if (typeof strategy === 'function') {
        return strategy(...args);
      }

      // Default to simple strategy
      return `${methodName}:${JSON.stringify(args)}`;
  }
}

/**
 * Cache decorator factory
 */
export function Cacheable(options: CacheDecoratorOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cacheKey = options.keyPrefix || `${target.constructor.name}:${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const cache = (this as any).cache as CacheInterface;

      if (!cache) {
        console.warn('Cache instance not found on object, executing method without caching');
        return originalMethod.apply(this, args);
      }

      try {
        // Check exclude condition first
        if (options.excludeCondition && options.excludeCondition(...args)) {
          return originalMethod.apply(this, args);
        }

        // Check include condition
        if (options.condition && !options.condition(...args)) {
          return originalMethod.apply(this, args);
        }

        // Generate cache key
        const keyStrategy = (options.key as KeyStrategy) || 'simple';
        const methodName = options.keyPrefix ? propertyKey : `${cacheKey}:${propertyKey}`;
        const cacheKeyString = generateCacheKey(methodName, args, keyStrategy);

        // Try to get from cache
        const cachedResult = await cache.get(cacheKeyString);

        if (cachedResult !== null) {
          options.onCacheHit?.(cacheKeyString, cachedResult);
          return cachedResult;
        }

        // Cache miss - execute method
        options.onCacheMiss?.(cacheKeyString);

        const result = await originalMethod.apply(this, args);

        // Cache the result
        const cacheOptions: CacheOptions = {
          ttl: options.ttl,
          namespace: options.namespace
        };

        await cache.set(cacheKeyString, result, cacheOptions);
        return result;

      } catch (error) {
        const errorInstance = error instanceof Error ? error : new Error(String(error));
        options.onError?.(errorInstance, 'unknown');

        // If fallback is provided, use it
        if (options.fallback) {
          try {
            return options.fallback();
          } catch (fallbackError) {
            console.error('Cache decorator fallback failed:', fallbackError);
          }
        }

        // Re-throw original error
        throw errorInstance;
      }
    };

    return descriptor;
  };
}

/**
 * Cache invalidation decorator
 */
export function CacheInvalidate(pattern?: string | string[]) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cache = (this as any).cache as CacheInterface;

      if (!cache) {
        console.warn('Cache instance not found on object, executing method without invalidation');
        return originalMethod.apply(this, args);
      }

      // Execute the original method first
      const result = await originalMethod.apply(this, args);

      try {
        // Invalidate cache entries
        if (pattern) {
          const patterns = Array.isArray(pattern) ? pattern : [pattern];

          for (const p of patterns) {
            const keys = await cache.keys(p);
            for (const key of keys) {
              await cache.delete(key);
            }
          }
        } else {
          // If no pattern specified, try to generate pattern from method name
          const defaultPattern = `${target.constructor.name}:${propertyKey}:*`;
          const keys = await cache.keys(defaultPattern);
          for (const key of keys) {
            await cache.delete(key);
          }
        }
      } catch (error) {
        console.error('Cache invalidation error:', error);
        // Don't fail the original operation if cache invalidation fails
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Cache update decorator - updates cache with new value
 */
export function CacheUpdate(key: string, options: CacheOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cache = (this as any).cache as CacheInterface;

      if (!cache) {
        console.warn('Cache instance not found on object, executing method without cache update');
        return originalMethod.apply(this, args);
      }

      // Execute the original method first
      const result = await originalMethod.apply(this, args);

      try {
        // Update cache with result
        await cache.set(key, result, options);
      } catch (error) {
        console.error('Cache update error:', error);
        // Don't fail the original operation if cache update fails
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Conditional cache decorator - only caches if condition is met
 */
export function ConditionalCache(
  condition: (...args: any[]) => boolean,
  options: CacheDecoratorOptions = {}
) {
  return Cacheable({
    ...options,
    condition
  });
}

/**
 * Time-based cache decorator - caches for specific duration based on method
 */
export function TimeCache(ttlMs: number, options: Omit<CacheDecoratorOptions, 'ttl'> = {}) {
  return Cacheable({
    ...options,
    ttl: ttlMs
  });
}

/**
 * Utility functions for manual cache operations
 */
export class CacheUtils {
  /**
   * Generate a cache key from method name and arguments
   */
  static generateKey(methodName: string, args: any[], strategy: KeyStrategy = 'simple'): string {
    return generateCacheKey(methodName, args, strategy);
  }

  /**
   * Create a cache key with namespace
   */
  static namespacedKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  /**
   * Create a hash-based cache key for large arguments
   */
  static hashKey(methodName: string, args: any[]): string {
    return generateCacheKey(methodName, args, 'hash');
  }

  /**
   * Create a custom cache key using a function
   */
  static customKey(args: any[], keyFn: (...args: any[]) => string): string {
    return keyFn(...args);
  }
}