# Caching Layer

A comprehensive caching layer for shipping rate quotes with multiple cache providers, automatic cache warming, and fallback handling.

## Features

- **Multiple Cache Providers**: In-memory and Redis caching
- **Automatic TTL Management**: Configurable TTL for different operation types
- **Cache Decorators**: Automatic method-level caching with decorators
- **Cache Warming**: Pre-populate cache with common routes
- **Circuit Breaker Integration**: Works with existing circuit breaker patterns
- **Environment-Based Configuration**: Different settings for dev/staging/production
- **Fallback Handling**: Graceful degradation when cache fails
- **Cache Statistics**: Detailed metrics and monitoring

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Provider      │    │   Cache Layer    │    │   Cache Store   │
│   Adapters      │───▶│   Decorators     │───▶│   Memory/Redis  │
│                 │    │   Configuration  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Cache Warmer    │
                       │  Fallback Logic  │
                       └──────────────────┘
```

## Quick Start

### Basic Usage

```typescript
import { MemoryCache, Cacheable } from '@pkg/providers/cache';

// Create cache instance
const cache = new MemoryCache({
  maxSize: 1000,
  defaultTTL: 5 * 60 * 1000 // 5 minutes
});

// Use cache decorator
class ShippingService {
  constructor(private cache: CacheInterface) {
    (this as any).cache = cache;
  }

  @Cacheable({ ttl: 10 * 60 * 1000 }) // 10 minutes
  async getRateQuote(from: Address, to: Address, parcel: Parcel): Promise<RateQuote[]> {
    // Your rate quote logic here
    return [];
  }
}
```

### Redis Cache

```typescript
import { RedisCache } from '@pkg/providers/cache';

const redisCache = new RedisCache({
  host: 'localhost',
  port: 6379,
  keyPrefix: 'shipping:cache:'
});
```

### Configuration

```typescript
import { cacheConfig } from '@pkg/providers/cache';

// Get current configuration
const config = cacheConfig.getConfig();

// Get TTL for specific operation
const rateQuoteTTL = cacheConfig.getTTL('rateQuote');

// Environment variables
// CACHE_PROVIDER=memory|redis
// CACHE_TTL_RATE_QUOTE=300000
// REDIS_HOST=localhost
// REDIS_PORT=6379
```

## Cache Providers

### Memory Cache

Fast in-memory caching with LRU eviction:

```typescript
const memoryCache = new MemoryCache({
  maxSize: 1000,              // Maximum entries
  defaultTTL: 5 * 60 * 1000,  // 5 minutes default TTL
  cleanupInterval: 60 * 1000  // Cleanup every minute
});

// Get cache statistics
const stats = await memoryCache.getDetailedStats();
console.log(`Hit rate: ${stats.hitRate * 100}%`);
```

### Redis Cache

Distributed caching with Redis:

```typescript
const redisCache = new RedisCache({
  host: 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  db: 0,
  keyPrefix: 'shipping:',
  connectionTimeout: 10000,
  commandTimeout: 5000
});

// Health check
const isHealthy = await redisCache.healthCheck();
console.log(`Redis cache healthy: ${isHealthy}`);
```

## Cache Decorators

### Basic Caching

```typescript
@Cacheable({
  ttl: 10 * 60 * 1000,  // 10 minutes
  key: 'simple'         // or 'hash' or custom function
})
async getRateQuote(input: ShipmentInput): Promise<RateQuote[]> {
  // Method automatically cached
}
```

### Conditional Caching

```typescript
@ConditionalCache(
  (from, to, parcel) => parcel.weight > 1, // Only cache heavy parcels
  { ttl: 15 * 60 * 1000 }
)
async getRateQuote(input: ShipmentInput): Promise<RateQuote[]> {
  // Only cached if condition is true
}
```

### Cache Invalidation

```typescript
@CacheInvalidate('rate:easypost:*')  // Invalidate matching patterns
async purchaseRate(rateId: string): Promise<PurchaseResult> {
  // Cache automatically invalidated after purchase
}
```

### Custom Cache Keys

```typescript
@Cacheable({
  key: (from, to, parcel) => `rate:${from.zip}-${to.zip}-${parcel.weight}`,
  ttl: 5 * 60 * 1000
})
async getRateQuote(input: ShipmentInput): Promise<RateQuote[]> {
  // Custom cache key generation
}
```

## Cache Warming

Pre-populate cache with common routes:

```typescript
import { CacheWarmer, DEFAULT_WARMUP_ROUTES } from '@pkg/providers/cache';

const warmer = new CacheWarmer(cache, {
  enabled: true,
  warmupOnStart: true,
  warmupInterval: 30 * 60 * 1000, // 30 minutes
  routes: DEFAULT_WARMUP_ROUTES
});

// Start warming
await warmer.start();

// Add custom route
warmer.addRoute({
  name: 'custom-route',
  from: { city: 'NYC', state: 'NY', zip: '10001', country: 'US' },
  to: { city: 'LA', state: 'CA', zip: '90210', country: 'US' },
  parcels: [{ weight: 1, dimensions: { length: 12, width: 8, height: 6 } }],
  providers: ['easypost'],
  priority: 5
});
```

## Integration with Provider Adapters

The caching layer is automatically integrated into provider adapters:

```typescript
// EasyPost adapter with caching
const easyPostAdapter = new EasyPostAdapter();

// Health checks are cached
const isHealthy = await easyPostAdapter.healthCheck();

// Rate quotes are cached with appropriate TTL
const rates = await easyPostAdapter.quote(shipmentInput);

// Cache automatically invalidated after purchase
const result = await easyPostAdapter.purchase(rateId, shipmentId);
```

## Configuration

### Environment Variables

```bash
# Cache Provider
CACHE_PROVIDER=memory  # or 'redis'
CACHE_ENABLED=true

# Memory Cache
CACHE_MEMORY_MAX_SIZE=1000
CACHE_MEMORY_DEFAULT_TTL=300000

# TTL Settings (milliseconds)
CACHE_TTL_RATE_QUOTE=300000       # 5 minutes
CACHE_TTL_HEALTH_CHECK=30000      # 30 seconds
CACHE_TTL_PURCHASE=3600000        # 1 hour

# Redis Settings
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0
REDIS_KEY_PREFIX=shipping:cache:
```

### Environment-Specific Configuration

- **Development**: Memory cache, short TTLs, reduced cache sizes
- **Test**: Minimal caching for fast test execution
- **Staging**: Redis cache, medium TTLs
- **Production**: Redis cache, longer TTLs for better performance

## Monitoring and Metrics

### Cache Statistics

```typescript
// Get basic stats
const stats = await cache.getStats();
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);

// Get detailed stats
const detailedStats = await memoryCache.getDetailedStats();
console.log(`Hit rate: ${detailedStats.hitRate * 100}%`);
console.log(`Average cache age: ${detailedStats.averageAge}ms`);

// Redis specific stats
const redisStats = await redisCache.getDetailedStats();
console.log(`Redis response time: ${redisStats.redisInfo.responseTime}ms`);
```

### Cache Warming Statistics

```typescript
const warmerStats = await warmer.getStats();
console.log(`Warming active: ${warmerStats.isRunning}`);
console.log(`Routes configured: ${warmerStats.routesCount}`);
```

## Error Handling and Fallbacks

The caching layer includes comprehensive error handling:

- **Cache failures don't break operations**: Methods fall back to direct execution
- **Connection failures**: Automatic reconnection with exponential backoff
- **Memory pressure**: LRU eviction to maintain performance
- **Invalid data**: Automatic cleanup of corrupted cache entries

```typescript
@Cacheable({
  ttl: 5 * 60 * 1000,
  fallback: () => [], // Fallback if caching fails
  onError: (error, key) => {
    console.error(`Cache error for key ${key}:`, error);
  }
})
async getRateQuote(input: ShipmentInput): Promise<RateQuote[]> {
  // Method continues even if cache fails
}
```

## Best Practices

### Cache Key Design

- Use normalized addresses (city, state, zip, country only)
- Include relevant parcel dimensions but normalize them
- Use provider name as part of the key
- Consider using hash strategy for large objects

### TTL Configuration

- **Rate Quotes**: 5-15 minutes (shipping rates change infrequently)
- **Health Checks**: 30 seconds to 1 minute
- **Purchase Results**: 1 hour (purchases are final)

### Cache Warming

- Warm popular routes during low-traffic periods
- Use realistic test data that matches production patterns
- Monitor warming performance and adjust batch sizes
- Include error handling in warming processes

### Performance Considerations

- Memory cache for single-instance applications
- Redis cache for multi-instance or high-availability setups
- Monitor cache hit rates and adjust sizes accordingly
- Use cache statistics to identify optimization opportunities

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Reduce `maxSize` in memory cache configuration
   - Enable LRU eviction monitoring
   - Consider Redis for larger caches

2. **Low Hit Rates**
   - Review cache key generation strategy
   - Adjust TTL values
   - Check for cache invalidation issues

3. **Redis Connection Issues**
   - Verify Redis server availability
   - Check network connectivity
   - Review connection timeout settings

4. **Cache Corruption**
   - Enable automatic cleanup
   - Monitor cache statistics
   - Implement cache warming recovery

### Debug Information

```typescript
// Enable debug logging
console.log('Cache config:', cacheConfig.getSummary());
console.log('Cache stats:', await cache.getStats());
console.log('Cache keys:', await cache.keys('*'));

// Test cache operations
const testKey = 'test:debug';
await cache.set(testKey, 'test-value', { ttl: 60000 });
const retrieved = await cache.get(testKey);
console.log('Cache test:', retrieved);
await cache.delete(testKey);
```

## Migration Guide

### From No Caching

1. Add cache configuration to environment variables
2. Initialize cache instances in your services
3. Add `@Cacheable` decorators to expensive methods
4. Configure appropriate TTL values
5. Add cache warming for common scenarios

### From Custom Caching

1. Replace custom cache implementation with standardized providers
2. Update cache keys to use normalized format
3. Configure TTL values based on operation types
4. Add cache warming and fallback handling
5. Enable monitoring and statistics collection

This caching layer provides significant performance improvements for repeated rate quote requests while maintaining compatibility with existing circuit breaker and error handling systems.