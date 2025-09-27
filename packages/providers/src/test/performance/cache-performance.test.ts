import { MemoryCache } from '../../cache/memory-cache.js';
import { MockCache, PerformanceTestUtils } from '../test-utils.js';

describe('Cache Performance Tests', () => {
  let cache: MemoryCache;
  let mockCache: MockCache;

  beforeEach(() => {
    cache = new MemoryCache();
    mockCache = new MockCache();
  });

  describe('Memory Cache Performance', () => {
    it('should handle high-frequency set/get operations efficiently', async () => {
      const operations = 10000;
      const keys = Array.from({ length: operations }, (_, i) => `key_${i % 100}`); // 100 unique keys
      const values = Array.from({ length: operations }, (_, i) => ({ data: `value_${i}`, timestamp: i }));

      // Measure set performance
      const { duration: setDuration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        const promises = keys.map((key, i) => cache.set(key, values[i]));
        await Promise.all(promises);
      });

      const avgSetTime = setDuration / operations;
      console.log(`Average set time: ${avgSetTime.toFixed(4)}ms per operation`);

      // Should be able to set 10k operations in reasonable time
      expect(setDuration).toBeLessThan(5000); // Less than 5 seconds
      expect(avgSetTime).toBeLessThan(0.5); // Less than 0.5ms per operation

      // Measure get performance
      const { duration: getDuration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        const promises = keys.map(key => cache.get(key));
        await Promise.all(promises);
      });

      const avgGetTime = getDuration / operations;
      console.log(`Average get time: ${avgGetTime.toFixed(4)}ms per operation`);

      expect(getDuration).toBeLessThan(3000); // Less than 3 seconds
      expect(avgGetTime).toBeLessThan(0.3); // Less than 0.3ms per operation
    });

    it('should handle concurrent operations without significant performance degradation', async () => {
      const operations = 1000;
      const concurrency = 10;
      const iterations = operations / concurrency;

      const operation = async () => {
        const promises = [];
        for (let i = 0; i < 10; i++) {
          const key = `concurrent_key_${Math.random().toString(36).substr(2, 9)}`;
          const value = { data: `concurrent_value_${i}`, timestamp: Date.now() };
          promises.push(cache.set(key, value));
          promises.push(cache.get(key));
        }
        await Promise.all(promises);
      };

      const { totalTime, avgTime } = await PerformanceTestUtils.benchmarkConcurrentOperations(
        operation,
        concurrency,
        iterations
      );

      console.log(`Concurrent operations - Total: ${totalTime.toFixed(2)}ms, Average: ${avgTime.toFixed(2)}ms`);

      // Should handle concurrent operations efficiently
      expect(totalTime).toBeLessThan(10000); // Less than 10 seconds
      expect(avgTime).toBeLessThan(100); // Less than 100ms per batch
    });

    it('should scale well with cache size', async () => {
      // Test with different cache sizes
      const sizes = [100, 1000, 10000];

      for (const size of sizes) {
        const startTime = performance.now();

        // Fill cache
        const promises = [];
        for (let i = 0; i < size; i++) {
          promises.push(cache.set(`size_key_${i}`, { data: `value_${i}`, index: i }));
        }
        await Promise.all(promises);

        // Read from cache
        const readPromises = [];
        for (let i = 0; i < size; i++) {
          readPromises.push(cache.get(`size_key_${i}`));
        }
        await Promise.all(readPromises);

        const duration = performance.now() - startTime;
        const avgTime = duration / (size * 2); // Account for both reads and writes

        console.log(`Cache size ${size}: ${duration.toFixed(2)}ms total, ${avgTime.toFixed(4)}ms per operation`);

        // Performance should degrade gracefully
        expect(duration).toBeLessThan(size * 0.1); // Less than 0.1ms per operation
      }
    });

    it('should handle cache cleanup efficiently', async () => {
      // Fill cache with some expired entries
      const totalEntries = 10000;
      const expiredRatio = 0.3;

      for (let i = 0; i < totalEntries; i++) {
        const ttl = i < totalEntries * expiredRatio ? 1 : 3600000; // 1ms vs 1 hour
        await cache.set(`cleanup_key_${i}`, `value_${i}`, { ttl });
      }

      // Advance time to expire entries
      const mockNow = Date.now() + 100; // Advance 100ms
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        await cache.cleanup();
      });

      console.log(`Cache cleanup for ${totalEntries} entries: ${duration.toFixed(2)}ms`);

      // Cleanup should be efficient
      expect(duration).toBeLessThan(1000); // Less than 1 second

      // Restore Date.now
      jest.restoreAllMocks();
    });
  });

  describe('Mock Cache Performance', () => {
    it('should handle high-volume operations', async () => {
      const operations = 50000;

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        const promises = [];

        for (let i = 0; i < operations; i++) {
          const key = `perf_key_${i}`;
          const value = { id: i, data: `value_${i}`.repeat(10) };

          if (i % 3 === 0) {
            promises.push(mockCache.set(key, value));
          } else if (i % 3 === 1) {
            promises.push(mockCache.get(key));
          } else {
            promises.push(mockCache.delete(key));
          }
        }

        await Promise.all(promises);
      });

      const avgTime = duration / operations;
      console.log(`Mock cache performance: ${duration.toFixed(2)}ms for ${operations} operations (${avgTime.toFixed(4)}ms avg)`);

      // Should handle high volume efficiently
      expect(duration).toBeLessThan(10000); // Less than 10 seconds
      expect(avgTime).toBeLessThan(0.2); // Less than 0.2ms per operation
    });

    it('should handle large object storage', async () => {
      const largeObject = {
        id: 'large_test',
        data: 'x'.repeat(100000), // 100KB string
        nested: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          values: Array.from({ length: 10 }, (_, j) => `nested_${i}_${j}`)
        })),
        metadata: {
          created: new Date().toISOString(),
          tags: Array.from({ length: 100 }, (_, i) => `tag_${i}`)
        }
      };

      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        await mockCache.set('large_object', largeObject);
        const retrieved = await mockCache.get('large_object');
        return retrieved;
      });

      console.log(`Large object performance: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(100); // Should handle large objects quickly
    });
  });

  describe('Cache Memory Usage', () => {
    it('should not have significant memory leaks', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        await cache.set(`leak_key_${i}`, { data: `value_${i}`.repeat(100) });
        if (i % 100 === 0) {
          await cache.clear(); // Clear periodically
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      console.log(`Memory usage: ${memoryIncreaseMB.toFixed(2)}MB increase`);

      // Memory increase should be reasonable (less than 50MB for this test)
      expect(memoryIncreaseMB).toBeLessThan(50);
    });

    it('should handle memory pressure gracefully', async () => {
      const maxOperations = 50000;

      // Fill cache to capacity
      for (let i = 0; i < maxOperations; i++) {
        await cache.set(`pressure_key_${i}`, `value_${i}`.repeat(100));
      }

      const stats = await cache.getStats();
      console.log(`Cache stats under pressure:`, stats);

      // Should still be functional
      expect(stats.size).toBeGreaterThan(0);

      // Should be able to perform operations
      const result = await cache.get('pressure_key_0');
      expect(result).toBeDefined();
    });
  });

  describe('Cache Hit/Miss Performance', () => {
    it('should maintain performance with mixed hit/miss ratios', async () => {
      // Setup cache with some entries
      const totalKeys = 1000;
      for (let i = 0; i < totalKeys; i++) {
        await cache.set(`ratio_key_${i}`, `value_${i}`);
      }

      const ratios = [0.1, 0.5, 0.9]; // 10%, 50%, 90% hit rates

      for (const hitRatio of ratios) {
        const operations = 10000;
        let hits = 0;
        let misses = 0;

        const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
          for (let i = 0; i < operations; i++) {
            const useExisting = Math.random() < hitRatio;
            const keyIndex = useExisting ? Math.floor(Math.random() * totalKeys) : totalKeys + i;
            const key = `ratio_key_${keyIndex}`;

            const result = await cache.get(key);
            if (result !== null) {
              hits++;
            } else {
              misses++;
            }
          }
        });

        const actualHitRatio = hits / (hits + misses);
        const avgTime = duration / operations;

        console.log(
          `Hit ratio ${hitRatio}: actual ${actualHitRatio.toFixed(2)}, ` +
          `time ${avgTime.toFixed(4)}ms/op`
        );

        expect(actualHitRatio).toBeGreaterThan(hitRatio - 0.1); // Within 10% of expected
        expect(avgTime).toBeLessThan(1); // Less than 1ms per operation
      }
    });
  });

  describe('Cache TTL Performance', () => {
    it('should handle frequent TTL checks efficiently', async () => {
      // Setup cache with various TTLs
      const entries = 10000;

      for (let i = 0; i < entries; i++) {
        const ttl = [1000, 5000, 10000, 60000][i % 4];
        await cache.set(`ttl_key_${i}`, `value_${i}`, { ttl });
      }

      // Perform frequent gets that trigger TTL checks
      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        for (let round = 0; round < 10; round++) {
          const promises = [];
          for (let i = 0; i < entries; i++) {
            promises.push(cache.get(`ttl_key_${i}`));
          }
          await Promise.all(promises);
        }
      });

      const totalOperations = entries * 10;
      const avgTime = duration / totalOperations;

      console.log(`TTL performance: ${duration.toFixed(2)}ms for ${totalOperations} operations`);
      console.log(`Average time per operation: ${avgTime.toFixed(4)}ms`);

      expect(avgTime).toBeLessThan(0.5); // Should be very fast
    });
  });

  describe('Cache Stress Tests', () => {
    it('should handle extreme load without crashing', async () => {
      const stressOperations = 100000;

      const { totalTime, errors } = await PerformanceTestUtils.benchmarkConcurrentOperations(
        async () => {
          const key = `stress_${Math.random().toString(36).substr(2, 9)}`;
          const value = { stress: true, data: 'x'.repeat(100) };

          await cache.set(key, value);
          await cache.get(key);
          if (Math.random() < 0.1) { // 10% delete rate
            await cache.delete(key);
          }
        },
        50, // High concurrency
        stressOperations / 50
      );

      console.log(`Stress test: ${totalTime.toFixed(2)}ms, ${errors} errors`);

      expect(errors).toBe(0); // Should not have errors
      expect(totalTime).toBeLessThan(30000); // Less than 30 seconds
    });

    it('should handle rapid cache invalidation', async () => {
      // Setup cache
      for (let i = 0; i < 10000; i++) {
        await cache.set(`invalidate_key_${i}`, `value_${i}`);
      }

      // Rapid invalidation
      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        const promises = [];
        for (let i = 0; i < 10000; i++) {
          promises.push(cache.delete(`invalidate_key_${i}`));
        }
        await Promise.all(promises);
      });

      console.log(`Rapid invalidation: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(5000); // Should be fast

      // Verify all entries are gone
      const stats = await cache.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Cache Pattern Performance', () => {
    it('should handle pattern-based key operations efficiently', async () => {
      // Setup cache with organized keys
      for (let i = 0; i < 1000; i++) {
        await cache.set(`user:${i}:profile`, { userId: i, profile: `profile_${i}` });
        await cache.set(`user:${i}:settings`, { userId: i, settings: `settings_${i}` });
        await cache.set(`post:${i}:data`, { postId: i, data: `post_${i}` });
      }

      // Test pattern operations
      const { duration } = await PerformanceTestUtils.measureExecutionTime(async () => {
        const userProfiles = await cache.keys('user:*:profile');
        const userSettings = await cache.keys('user:*:settings');
        const postData = await cache.keys('post:*:data');

        return { userProfiles, userSettings, postData };
      });

      console.log(`Pattern operations: ${duration.toFixed(2)}ms`);

      expect(duration).toBeLessThan(1000); // Should be reasonably fast
    });
  });

  describe('Cache Benchmark Comparisons', () => {
    it('should compare performance between different cache implementations', async () => {
      const operations = 5000;

      // Test MemoryCache
      const memoryResults = await PerformanceTestUtils.benchmarkConcurrentOperations(
        async () => {
          const key = `bench_key_${Math.random().toString(36).substr(2, 9)}`;
          const value = { benchmark: true, data: 'test_data' };
          await cache.set(key, value);
          await cache.get(key);
        },
        10,
        operations / 10
      );

      // Test MockCache
      const mockResults = await PerformanceTestUtils.benchmarkConcurrentOperations(
        async () => {
          const key = `bench_key_${Math.random().toString(36).substr(2, 9)}`;
          const value = { benchmark: true, data: 'test_data' };
          await mockCache.set(key, value);
          await mockCache.get(key);
        },
        10,
        operations / 10
      );

      console.log('Performance comparison:');
      console.log(`MemoryCache: ${memoryResults.totalTime.toFixed(2)}ms`);
      console.log(`MockCache: ${mockResults.totalTime.toFixed(2)}ms`);

      // Both should perform reasonably well
      expect(memoryResults.totalTime).toBeLessThan(10000);
      expect(mockResults.totalTime).toBeLessThan(10000);

      // Mock cache might be faster due to simplified implementation
      const performanceRatio = mockResults.totalTime / memoryResults.totalTime;
      console.log(`Performance ratio (Mock/Memory): ${performanceRatio.toFixed(2)}`);
    });
  });
});