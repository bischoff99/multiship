import { MemoryCache } from '../../cache/memory-cache.js';
import { RedisCache } from '../../cache/redis-cache.js';
import { TestDataFactory, PerformanceTestUtils } from '../test-utils.js';

describe('Cache Performance Benchmarks', () => {
  let memoryCache: MemoryCache;
  let redisCache: RedisCache | null = null;

  beforeAll(async () => {
    memoryCache = new MemoryCache({
      maxSize: 10000,
      defaultTTL: 300000 // 5 minutes
    });

    // Try to create Redis cache if Redis is available
    try {
      redisCache = new RedisCache({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        keyPrefix: 'benchmark:',
        lazyConnect: false // Ensure immediate connection for tests
      });
      
      // Wait for connection to be established
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
        const redisClient = (redisCache as any).redis;
        redisClient.on('ready', () => {
          clearTimeout(timeout);
          resolve(true);
        });
        redisClient.on('error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      await redisCache.healthCheck();
      console.log('Redis cache available for benchmarking');
    } catch (error) {
      console.log('Redis cache not available, skipping Redis benchmarks:', error instanceof Error ? error.message : String(error));
      redisCache = null;
    }
  });

  afterAll(async () => {
    memoryCache.destroy();

    if (redisCache) {
      try {
        await redisCache.clear();
        await redisCache.close(); // Properly close Redis connection
      } catch (error) {
        console.error('Error cleaning up Redis cache:', error);
      }
    }
  });

  describe('Memory Cache Benchmarks', () => {
    it('should handle basic get/set operations efficiently', async () => {
      const testData = TestDataFactory.createMockRateQuotes(10);
      const testKey = 'benchmark:test-data';

      const { result, duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        await memoryCache.set(testKey, testData, { ttl: 60000 });
        return await memoryCache.get(testKey);
      });

      expect(result).toEqual(testData);
      expect(duration).toBeLessThan(100); // Should be very fast (< 100ms)

      console.log(`Memory cache get/set: ${duration.toFixed(2)}ms`);
    });

    it('should handle cache misses efficiently', async () => {
      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        return await memoryCache.get('nonexistent-key');
      });

      expect(duration).toBeLessThan(10); // Should be very fast even for misses
      console.log(`Memory cache miss: ${duration.toFixed(2)}ms`);
    });

    it('should handle concurrent operations', async () => {
      const operations = Array.from({ length: 100 }, (_, i) => ({
        key: `concurrent-${i}`,
        data: TestDataFactory.createMockRateQuotes(5)
      }));

      const { results, totalTime, avgTime } = await PerformanceTestUtils.benchmarkConcurrentOperations(
        async () => {
          const op = operations[Math.floor(Math.random() * operations.length)];
          await memoryCache.set(op.key, op.data, { ttl: 60000 });
          return await memoryCache.get(op.key);
        },
        10, // concurrency
        100 // iterations
      );

      expect(results).toHaveLength(100);
      expect(avgTime).toBeLessThan(50); // Average should be reasonable

      console.log(`Concurrent memory cache - Total: ${totalTime.toFixed(2)}ms, Avg: ${avgTime.toFixed(2)}ms`);
    });

    it('should handle large datasets efficiently', async () => {
      // Create a large dataset
      const largeData = {
        quotes: TestDataFactory.createMockRateQuotes(1000),
        metadata: {
          timestamp: Date.now(),
          version: '1.0.0',
          providers: ['easypost', 'shippo', 'veeqo']
        }
      };

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        await memoryCache.set('large-dataset', largeData, { ttl: 300000 });
        return await memoryCache.get('large-dataset');
      });

      expect(duration).toBeLessThan(200); // Should handle large data reasonably
      console.log(`Large dataset memory cache: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Redis Cache Benchmarks', () => {
    beforeEach(async () => {
      if (!redisCache) {
        return;
      }

      // Clear cache before each test
      await redisCache.clear();
    });

    it('should handle basic Redis operations efficiently', async () => {
      if (!redisCache) {
        console.log('Skipping Redis benchmark - not available');
        return;
      }

      const testData = TestDataFactory.createMockRateQuotes(10);
      const testKey = 'redis-benchmark:test-data';

      const { result, duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        await redisCache!.set(testKey, testData, { ttl: 60000 });
        return await redisCache!.get(testKey);
      });

      expect(result).toEqual(testData);
      expect(duration).toBeLessThan(200); // Redis operations should be fast

      console.log(`Redis cache get/set: ${duration.toFixed(2)}ms`);
    });

    it('should handle Redis cache misses efficiently', async () => {
      if (!redisCache) {
        console.log('Skipping Redis benchmark - not available');
        return;
      }

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        return await redisCache!.get('nonexistent-redis-key');
      });

      expect(duration).toBeLessThan(50); // Redis misses should be fast
      console.log(`Redis cache miss: ${duration.toFixed(2)}ms`);
    });

    it('should handle Redis concurrent operations', async () => {
      if (!redisCache) {
        console.log('Skipping Redis concurrent benchmark - not available');
        return;
      }

      const operations = Array.from({ length: 50 }, (_, i) => ({
        key: `redis-concurrent-${i}`,
        data: TestDataFactory.createMockRateQuotes(3)
      }));

      const { results, totalTime, avgTime } = await PerformanceTestUtils.benchmarkConcurrentOperations(
        async () => {
          const op = operations[Math.floor(Math.random() * operations.length)];
          await redisCache!.set(op.key, op.data, { ttl: 60000 });
          return await redisCache!.get(op.key);
        },
        5, // Lower concurrency for Redis
        50 // iterations
      );

      expect(results).toHaveLength(50);
      expect(avgTime).toBeLessThan(100);

      console.log(`Concurrent Redis cache - Total: ${totalTime.toFixed(2)}ms, Avg: ${avgTime.toFixed(2)}ms`);
    });
  });

  describe('Cache Performance Comparison', () => {
    it('should demonstrate cache hit performance benefits', async () => {
      const testData = TestDataFactory.createMockRateQuotes(20);
      const testKey = 'performance-comparison';

      // First, populate cache
      await memoryCache.set(testKey, testData, { ttl: 60000 });

      // Measure cache hit performance
      const { duration: hitDuration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        return await memoryCache.get(testKey);
      });

      // Measure cache miss + set performance
      await memoryCache.delete(testKey);
      const { duration: missDuration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        await memoryCache.set(testKey, testData, { ttl: 60000 });
        return await memoryCache.get(testKey);
      });

      console.log(`Cache hit: ${hitDuration.toFixed(2)}ms, Cache miss+set: ${missDuration.toFixed(2)}ms`);
      console.log(`Performance improvement: ${(missDuration / hitDuration).toFixed(1)}x faster`);
    });

    it('should benchmark memory usage', async () => {
      const initialStats = await memoryCache.getStats();
      const initialSize = initialStats.size;

      // Add many entries
      const entries = Array.from({ length: 100 }, (_, i) => ({
        key: `memory-test-${i}`,
        data: TestDataFactory.createMockRateQuotes(10)
      }));

      for (const entry of entries) {
        await memoryCache.set(entry.key, entry.data, { ttl: 300000 });
      }

      const finalStats = await memoryCache.getStats();
      const finalSize = finalStats.size;

      console.log(`Memory cache entries: ${initialSize} -> ${finalSize}`);
      console.log(`Memory cache hit rate: ${((finalStats.hits / (finalStats.hits + finalStats.misses)) * 100).toFixed(1)}%`);
    });
  });

  describe('Cache Warming Performance', () => {
    it('should measure cache warming effectiveness', async () => {
      // Simulate cache warming scenario
      const commonRoutes = Array.from({ length: 20 }, (_, i) => ({
        key: `warmup-route-${i}`,
        data: TestDataFactory.createMockRateQuotes(5)
      }));

      const { duration: warmingDuration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        const promises = commonRoutes.map(route =>
          memoryCache.set(route.key, route.data, { ttl: 600000 })
        );
        await Promise.all(promises);
      });

      // Now measure how much faster subsequent requests are
      const { duration: cachedDuration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        const promises = commonRoutes.slice(0, 10).map(route =>
          memoryCache.get(route.key)
        );
        return await Promise.all(promises);
      });

      console.log(`Cache warming: ${warmingDuration.toFixed(2)}ms`);
      console.log(`Cached retrieval: ${cachedDuration.toFixed(2)}ms`);
      console.log(`Average per cached request: ${(cachedDuration / 10).toFixed(2)}ms`);
    });
  });
});