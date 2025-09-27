import { MemoryCache } from '../../../cache/memory-cache.js';
import { CacheOptions } from '../../../types.js';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  describe('Basic Operations', () => {
    it('should set and get values correctly', async () => {
      const testData = { message: 'test value', number: 42 };

      await cache.set('test-key', testData);
      const result = await cache.get('test-key');

      expect(result).toEqual(testData);
    });

    it('should return null for non-existent keys', async () => {
      const result = await cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('should delete values correctly', async () => {
      await cache.set('test-key', 'test-value');
      expect(await cache.has('test-key')).toBe(true);

      const deleted = await cache.delete('test-key');
      expect(deleted).toBe(true);
      expect(await cache.has('test-key')).toBe(false);
    });

    it('should return false when deleting non-existent keys', async () => {
      const deleted = await cache.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('TTL (Time To Live)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should expire entries after TTL', async () => {
      const options: CacheOptions = { ttl: 1000 }; // 1 second
      await cache.set('test-key', 'test-value', options);

      expect(await cache.get('test-key')).toBe('test-value');

      // Advance time past TTL
      jest.advanceTimersByTime(1001);

      const result = await cache.get('test-key');
      expect(result).toBeNull();
    });

    it('should handle different TTL values', async () => {
      await cache.set('short-ttl', 'value1', { ttl: 100 });
      await cache.set('long-ttl', 'value2', { ttl: 10000 });

      jest.advanceTimersByTime(500);

      expect(await cache.get('short-ttl')).toBeNull();
      expect(await cache.get('long-ttl')).toBe('value2');
    });

    it('should use default TTL when not specified', async () => {
      // Assuming default TTL is set in the cache implementation
      await cache.set('test-key', 'test-value');

      // Should still be available immediately
      expect(await cache.get('test-key')).toBe('test-value');
    });
  });

  describe('Namespace Support', () => {
    it('should support namespaced keys', async () => {
      const options: CacheOptions = { namespace: 'user' };
      await cache.set('123', { id: 123, name: 'John' }, options);

      const result = await cache.get('user:123');
      expect(result).toEqual({ id: 123, name: 'John' });
    });

    it('should isolate different namespaces', async () => {
      await cache.set('key1', 'value1', { namespace: 'ns1' });
      await cache.set('key1', 'value2', { namespace: 'ns2' });

      expect(await cache.get('ns1:key1')).toBe('value1');
      expect(await cache.get('ns2:key1')).toBe('value2');
      expect(await cache.get('key1')).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits and misses', async () => {
      const stats1 = await cache.getStats();
      const initialHits = stats1.hits;
      const initialMisses = stats1.misses;

      await cache.set('test-key', 'test-value');

      // Hit
      await cache.get('test-key');
      const stats2 = await cache.getStats();
      expect(stats2.hits).toBe(initialHits + 1);
      expect(stats2.misses).toBe(initialMisses);

      // Miss
      await cache.get('non-existent');
      const stats3 = await cache.getStats();
      expect(stats3.misses).toBe(initialMisses + 1);
    });

    it('should track sets and deletes', async () => {
      const stats1 = await cache.getStats();
      const initialSets = stats1.sets;
      const initialDeletes = stats1.deletes;

      await cache.set('test-key', 'test-value');
      const stats2 = await cache.getStats();
      expect(stats2.sets).toBe(initialSets + 1);

      await cache.delete('test-key');
      const stats3 = await cache.getStats();
      expect(stats3.deletes).toBe(initialDeletes + 1);
    });

    it('should track cache size', async () => {
      const stats1 = await cache.getStats();
      expect(stats1.size).toBe(0);

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const stats2 = await cache.getStats();
      expect(stats2.size).toBe(3);

      await cache.delete('key2');
      const stats3 = await cache.getStats();
      expect(stats3.size).toBe(2);
    });
  });

  describe('Cache Operations', () => {
    it('should clear all entries', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      expect(await cache.getStats()).toMatchObject({ size: 3 });

      await cache.clear();

      expect(await cache.getStats()).toMatchObject({ size: 0 });
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(await cache.get('key3')).toBeNull();
    });

    it('should return all keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('ns1:key3', 'value3', { namespace: 'ns1' });

      const keys = await cache.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('ns1:key3');
    });

    it('should filter keys by pattern', async () => {
      await cache.set('user:1', 'value1');
      await cache.set('user:2', 'value2');
      await cache.set('post:1', 'value3');
      await cache.set('comment:1', 'value4');

      const userKeys = await cache.keys('user:*');
      expect(userKeys).toHaveLength(2);
      expect(userKeys).toContain('user:1');
      expect(userKeys).toContain('user:2');

      const postKeys = await cache.keys('post:*');
      expect(postKeys).toHaveLength(1);
      expect(postKeys).toContain('post:1');
    });

    it('should cleanup expired entries', async () => {
      jest.useFakeTimers();

      await cache.set('expired', 'value1', { ttl: 1000 });
      await cache.set('valid', 'value2', { ttl: 10000 });

      jest.advanceTimersByTime(5000);

      await cache.cleanup();

      expect(await cache.get('expired')).toBeNull();
      expect(await cache.get('valid')).toBe('value2');

      jest.useRealTimers();
    });
  });

  describe('Health Check', () => {
    it('should return true for health check', async () => {
      const isHealthy = await cache.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Size Calculation', () => {
    it('should return approximate size', async () => {
      const size1 = await cache.size();
      expect(typeof size1).toBe('number');
      expect(size1).toBeGreaterThanOrEqual(0);

      await cache.set('test', { large: 'data'.repeat(100) });

      const size2 = await cache.size();
      expect(size2).toBeGreaterThan(size1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty keys', async () => {
      await cache.set('', 'empty-key-value');
      const result = await cache.get('');
      expect(result).toBe('empty-key-value');
    });

    it('should handle special characters in keys', async () => {
      const specialKey = 'key-with-special-chars!@#$%^&*()';
      await cache.set(specialKey, 'special-value');
      const result = await cache.get(specialKey);
      expect(result).toBe('special-value');
    });

    it('should handle large values', async () => {
      const largeValue = { data: 'x'.repeat(10000) };
      await cache.set('large-key', largeValue);
      const result = await cache.get('large-key');
      expect(result).toEqual(largeValue);
    });

    it('should handle concurrent operations', async () => {
      const promises = [];

      // Concurrent sets
      for (let i = 0; i < 100; i++) {
        promises.push(cache.set(`key-${i}`, `value-${i}`));
      }

      await Promise.all(promises);

      // Concurrent gets
      const getPromises = [];
      for (let i = 0; i < 100; i++) {
        getPromises.push(cache.get(`key-${i}`));
      }

      const results = await Promise.all(getPromises);
      expect(results).toHaveLength(100);
      expect(results.every(result => result !== null)).toBe(true);
    });
  });

  describe('Memory Management', () => {
    it('should handle memory pressure gracefully', async () => {
      // Fill cache with many entries
      for (let i = 0; i < 1000; i++) {
        await cache.set(`key-${i}`, { data: `value-${i}`.repeat(10) });
      }

      const stats = await cache.getStats();
      expect(stats.size).toBe(1000);

      // Clear half the entries
      for (let i = 0; i < 500; i++) {
        await cache.delete(`key-${i}`);
      }

      const finalStats = await cache.getStats();
      expect(finalStats.size).toBe(500);
    });
  });
});