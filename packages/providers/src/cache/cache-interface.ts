import { CacheInterface, CacheStats, CacheOptions } from '../types.js';

/**
 * Base cache interface implementation with common functionality
 */
export abstract class BaseCache<T = any> implements CacheInterface<T> {
  protected stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    size: 0
  };

  /**
   * Generate a namespaced key
   */
  protected getNamespacedKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  /**
   * Check if an entry is expired
   */
  protected isExpired(entry: any): boolean {
    if (!entry.ttl) return false;
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Create a cache entry
   */
  protected createEntry(data: T, options?: CacheOptions): any {
    return {
      data,
      timestamp: Date.now(),
      ttl: options?.ttl || 0
    };
  }

  abstract get(key: string): Promise<T | null>;
  abstract set(key: string, value: T, options?: CacheOptions): Promise<void>;
  abstract delete(key: string): Promise<boolean>;
  abstract has(key: string): Promise<boolean>;
  abstract clear(): Promise<void>;
  abstract keys(pattern?: string): Promise<string[]>;
  abstract size(): Promise<number>;
  abstract cleanup(): Promise<void>;
  abstract healthCheck(): Promise<boolean>;

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    return { ...this.stats };
  }

  /**
   * Get multiple values at once
   */
  async getMany(keys: string[]): Promise<(T | null)[]> {
    const results = await Promise.all(keys.map(key => this.get(key)));
    return results;
  }

  /**
   * Set multiple values at once
   */
  async setMany(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<void> {
    await Promise.all(entries.map(entry => this.set(entry.key, entry.value, entry.options)));
  }

  /**
   * Delete multiple keys at once
   */
  async deleteMany(keys: string[]): Promise<boolean[]> {
    const results = await Promise.all(keys.map(key => this.delete(key)));
    return results;
  }

  /**
   * Increment a numeric value
   */
  async increment(key: string, delta: number = 1): Promise<number | null> {
    const current = await this.get(key);
    if (current === null || typeof current !== 'number') {
      return null;
    }
    const newValue = current + delta;
    await this.set(key, newValue as T);
    return newValue;
  }

  /**
   * Decrement a numeric value
   */
  async decrement(key: string, delta: number = 1): Promise<number | null> {
    return this.increment(key, -delta);
  }

  /**
   * Get or set pattern - if key doesn't exist, set it with the provided value
   */
  async getOrSet(key: string, valueFactory: () => Promise<T>, options?: CacheOptions): Promise<T> {
    const existing = await this.get(key);
    if (existing !== null) {
      this.stats.hits++;
      return existing;
    }

    this.stats.misses++;
    const value = await valueFactory();
    await this.set(key, value, options);
    return value;
  }
}