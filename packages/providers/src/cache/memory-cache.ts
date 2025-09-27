import { BaseCache } from './cache-interface.js';
import { CacheOptions, CacheStats } from '../types.js';

// Node.js Timer type
type Timer = ReturnType<typeof setInterval>;

/**
 * Doubly linked list node for LRU implementation
 */
interface CacheNode<T> {
  key: string;
  data: T;
  timestamp: number;
  ttl: number;
  prev?: CacheNode<T>;
  next?: CacheNode<T>;
}

/**
 * In-memory cache with LRU eviction and TTL support
 */
export class MemoryCache<T = any> extends BaseCache<T> {
  private cache = new Map<string, CacheNode<T>>();
  private head?: CacheNode<T>;
  private tail?: CacheNode<T>;
  private maxSize: number;
  private cleanupInterval?: Timer;
  private readonly CLEANUP_INTERVAL_MS = 60000; // 1 minute
  private readonly DEFAULT_TTL_MS = 300000; // 5 minutes

  constructor(options: {
    maxSize?: number;
    defaultTTL?: number;
    cleanupInterval?: number;
  } = {}) {
    super();
    this.maxSize = options.maxSize || 1000;
    this.stats.maxSize = this.maxSize;

    // Start cleanup interval
    const cleanupInterval = options.cleanupInterval || this.CLEANUP_INTERVAL_MS;
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupInterval);
  }

  /**
   * Get a value from cache
   */
  async get(key: string): Promise<T | null> {
    const node = this.cache.get(key);

    if (!node) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (this.isExpired(node)) {
      this.cache.delete(key);
      this.removeFromList(node);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    // Move to front (most recently used)
    this.moveToFront(node);
    this.stats.hits++;
    return node.data;
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: T, options?: CacheOptions): Promise<void> {
    const fullKey = options?.namespace && !key.includes(':') ? `${options.namespace}:${key}` : key;
    const node = this.cache.get(fullKey);

    if (node) {
      // Update existing node
      node.data = value;
      node.timestamp = Date.now();
      node.ttl = options?.ttl || this.DEFAULT_TTL_MS;
      this.moveToFront(node);
    } else {
      // Create new node
      const newNode: CacheNode<T> = {
        key: fullKey,
        data: value,
        timestamp: Date.now(),
        ttl: options?.ttl || this.DEFAULT_TTL_MS
      };

      // Evict if at max size
      if (this.cache.size >= this.maxSize && this.tail) {
        this.evictLRU();
      }

      this.cache.set(fullKey, newNode);
      this.addToFront(newNode);
    }

    this.stats.sets++;
    this.updateSize();
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<boolean> {
    const node = this.cache.get(key);

    if (!node) {
      return false;
    }

    this.cache.delete(key);
    this.removeFromList(node);
    this.stats.deletes++;
    this.updateSize();
    return true;
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    const node = this.cache.get(key);
    if (!node) return false;

    if (this.isExpired(node)) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.head = undefined;
    this.tail = undefined;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      size: 0,
      maxSize: this.maxSize
    };
  }

  /**
   * Get all cache keys
   */
  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.cache.keys());

    if (!pattern) {
      return allKeys;
    }

    // Simple pattern matching (supports wildcards)
    const regex = new RegExp(
      pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
    );

    return allKeys.filter(key => regex.test(key));
  }

  /**
   * Get cache size in bytes (approximate)
   */
  async size(): Promise<number> {
    // Rough estimation: average 100 bytes per entry
    return this.cache.size * 100;
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, node] of this.cache.entries()) {
      if (node.ttl > 0 && now - node.timestamp > node.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      await this.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.stats.evictions += expiredKeys.length;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple memory check
      const testKey = '__health_check__';
      await this.set(testKey, 'test' as T, { ttl: 1000 });
      const retrieved = await this.get(testKey);
      await this.delete(testKey);
      return retrieved === 'test';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get detailed cache information
   */
  async getDetailedStats(): Promise<{
    stats: CacheStats;
    hitRate: number;
    averageAge: number;
    oldestEntry?: string;
    newestEntry?: string;
  }> {
    const baseStats = await this.getStats();
    const totalRequests = baseStats.hits + baseStats.misses;
    const hitRate = totalRequests > 0 ? baseStats.hits / totalRequests : 0;

    const now = Date.now();
    let totalAge = 0;
    let validEntries = 0;
    let oldestEntry: string | undefined;
    let newestEntry: string | undefined;
    let oldestAge = 0;
    let newestAge = now;

    for (const [key, node] of this.cache.entries()) {
      if (!this.isExpired(node)) {
        const age = now - node.timestamp;
        totalAge += age;
        validEntries++;

        if (age > oldestAge) {
          oldestAge = age;
          oldestEntry = key;
        }

        if (age < newestAge) {
          newestAge = age;
          newestEntry = key;
        }
      }
    }

    const averageAge = validEntries > 0 ? totalAge / validEntries : 0;

    return {
      stats: baseStats,
      hitRate,
      averageAge,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Destroy the cache and cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clear();
  }

  // Private methods for linked list management

  private moveToFront(node: CacheNode<T>): void {
    if (node === this.head) return;

    this.removeFromList(node);
    this.addToFront(node);
  }

  private addToFront(node: CacheNode<T>): void {
    node.prev = undefined;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeFromList(node: CacheNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = undefined;
    node.next = undefined;
  }

  private evictLRU(): void {
    if (!this.tail) return;

    const lruKey = this.tail.key;
    this.cache.delete(lruKey);
    this.removeFromList(this.tail);
    this.stats.evictions++;
  }

  private updateSize(): void {
    this.stats.size = this.cache.size;
  }
}