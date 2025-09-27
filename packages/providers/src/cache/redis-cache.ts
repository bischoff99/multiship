import Redis from 'ioredis';
import { BaseCache } from './cache-interface.js';
import { CacheOptions, CacheStats } from '../types.js';

// Node.js Timer type
type Timer = ReturnType<typeof setInterval>;

/**
 * Redis cache configuration
 */
export interface RedisCacheConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  connectionTimeout?: number;
  commandTimeout?: number;
  lazyConnect?: boolean;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  family?: number;
  cluster?: any[];
  sentinels?: any[];
}

/**
 * Redis-based distributed cache with connection pooling and error handling
 */
export class RedisCache<T = any> extends BaseCache<T> {
  private redis: Redis;
  private config: RedisCacheConfig;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private healthCheckInterval?: Timer;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

  constructor(config: RedisCacheConfig = {}) {
    super();

    this.config = {
      host: 'localhost',
      port: 6379,
      keyPrefix: 'multiship:cache:',
      connectionTimeout: 10000,
      commandTimeout: 5000,
      lazyConnect: false, // Changed to false for better test reliability
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      ...config
    };

    this.redis = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      keyPrefix: this.config.keyPrefix,
      connectTimeout: this.config.connectionTimeout,
      commandTimeout: this.config.commandTimeout,
      lazyConnect: this.config.lazyConnect,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      enableReadyCheck: this.config.enableReadyCheck,
      family: this.config.family,
      sentinels: this.config.sentinels
    });

    this.setupEventHandlers();
    this.startHealthCheck();
  }

  /**
   * Setup Redis event handlers for connection management
   */
  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('Redis cache connected');
    });

    this.redis.on('ready', () => {
      this.isConnected = true;
      console.log('Redis cache ready');
    });

    this.redis.on('error', (error: Error) => {
      this.isConnected = false;
      console.error('Redis cache error:', error);
      this.handleReconnection();
    });

    this.redis.on('close', () => {
      this.isConnected = false;
      console.log('Redis cache connection closed');
      this.handleReconnection();
    });

    this.redis.on('reconnecting', () => {
      this.isConnected = false;
      console.log('Redis cache reconnecting...');
    });
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnection(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

      setTimeout(() => {
        console.log(`Redis cache reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        this.redis.connect();
      }, delay);
    } else {
      console.error('Redis cache max reconnection attempts reached');
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        console.error('Redis cache health check failed:', error);
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Get a value from Redis cache
   */
  async get(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const rawData = await this.redis.get(key);

      if (!rawData) {
        this.stats.misses++;
        return null;
      }

      const entry = JSON.parse(rawData);

      // Check if expired
      if (this.isExpired(entry)) {
        await this.redis.del(key);
        this.stats.misses++;
        this.stats.evictions++;
        return null;
      }

      this.stats.hits++;
      return entry.data;
    } catch (error) {
      console.error('Redis cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Set a value in Redis cache
   */
  async set(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const entry = this.createEntry(value, options);
      const serializedEntry = JSON.stringify(entry);

      const ttl = options?.ttl || 300000; // 5 minutes default

      if (ttl > 0) {
        await this.redis.setex(key, Math.ceil(ttl / 1000), serializedEntry);
      } else {
        await this.redis.set(key, serializedEntry);
      }

      this.stats.sets++;
    } catch (error) {
      console.error('Redis cache set error:', error);
    }
  }

  /**
   * Delete a value from Redis cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.redis.del(key);
      const deleted = result > 0;

      if (deleted) {
        this.stats.deletes++;
      }

      return deleted;
    } catch (error) {
      console.error('Redis cache delete error:', error);
      return false;
    }
  }

  /**
   * Check if key exists in Redis cache
   */
  async has(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const exists = await this.redis.exists(key);

      if (exists === 0) {
        return false;
      }

      // Check if expired by getting the value
      const value = await this.get(key);
      return value !== null;
    } catch (error) {
      console.error('Redis cache has error:', error);
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      if (!this.isConnected) {
        return;
      }

      const pattern = this.config.keyPrefix ? `${this.config.keyPrefix}*` : '*';
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.stats.deletes += keys.length;
      }
    } catch (error) {
      console.error('Redis cache clear error:', error);
    }
  }

  /**
   * Get all cache keys
   */
  async keys(pattern?: string): Promise<string[]> {
    try {
      if (!this.isConnected) {
        return [];
      }

      const keyPattern = pattern
        ? `${this.config.keyPrefix}${pattern}`
        : `${this.config.keyPrefix}*`;

      const keys = await this.redis.keys(keyPattern);

      // Remove prefix from returned keys
      return keys.map((key: string) =>
        this.config.keyPrefix ? key.replace(this.config.keyPrefix, '') : key
      );
    } catch (error) {
      console.error('Redis cache keys error:', error);
      return [];
    }
  }

  /**
   * Get cache size in bytes
   */
  async size(): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      // Get memory usage if available (Redis 4.0+)
      try {
        const info = await this.redis.info('memory');
        const match = info.match(/used_memory:(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      } catch {
        // Fallback to key count estimation
        const pattern = this.config.keyPrefix ? `${this.config.keyPrefix}*` : '*';
        const keys = await this.redis.keys(pattern);
        return keys.length * 100; // Rough estimation
      }
    } catch (error) {
      console.error('Redis cache size error:', error);
      return 0;
    }
  }

  /**
   * Cleanup expired entries using Redis SCAN
   */
  async cleanup(): Promise<void> {
    try {
      if (!this.isConnected) {
        return;
      }

      const pattern = this.config.keyPrefix ? `${this.config.keyPrefix}*` : '*';
      const stream = this.redis.scanStream({ match: pattern, count: 100 });

      let expiredCount = 0;

      stream.on('data', async (keys: string[]) => {
        for (const key of keys) {
          try {
            const rawData = await this.redis.get(key);
            if (rawData) {
              const entry = JSON.parse(rawData);
              if (this.isExpired(entry)) {
                await this.redis.del(key);
                expiredCount++;
              }
            }
          } catch (error) {
            // Skip invalid entries
          }
        }
      });

      await new Promise<void>((resolve) => {
        stream.on('end', () => {
          if (expiredCount > 0) {
            this.stats.evictions += expiredCount;
          }
          resolve();
        });
      });
    } catch (error) {
      console.error('Redis cache cleanup error:', error);
    }
  }

  /**
   * Connect to Redis if not already connected
   */
  async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.redis.connect();
        this.isConnected = true;
      } catch (error) {
        console.error('Redis cache connection failed:', error);
        this.isConnected = false;
        throw error;
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const startTime = Date.now();
      await this.redis.ping();
      const responseTime = Date.now() - startTime;

      // Consider healthy if response time is reasonable
      return responseTime < 5000; // 5 seconds
    } catch (error) {
      console.error('Redis cache health check failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Get detailed Redis cache information
   */
  async getDetailedStats(): Promise<{
    stats: CacheStats;
    hitRate: number;
    redisInfo: {
      connected: boolean;
      responseTime: number;
      memoryUsage?: number;
      keyspaceHits?: number;
      keyspaceMisses?: number;
    };
  }> {
    const baseStats = await this.getStats();
    const totalRequests = baseStats.hits + baseStats.misses;
    const hitRate = totalRequests > 0 ? baseStats.hits / totalRequests : 0;

    let responseTime = 0;
    let memoryUsage = 0;
    let keyspaceHits = 0;
    let keyspaceMisses = 0;

    try {
      const startTime = Date.now();
      await this.redis.ping();
      responseTime = Date.now() - startTime;

      // Get Redis info if available
      try {
        const info = await this.redis.info('memory');
        const memoryMatch = info.match(/used_memory:(\d+)/);
        memoryUsage = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;
      } catch {
        // Memory info not available
      }

      try {
        const info = await this.redis.info('stats');
        const hitsMatch = info.match(/keyspace_hits:(\d+)/);
        const missesMatch = info.match(/keyspace_misses:(\d+)/);
        keyspaceHits = hitsMatch ? parseInt(hitsMatch[1], 10) : 0;
        keyspaceMisses = missesMatch ? parseInt(missesMatch[1], 10) : 0;
      } catch {
        // Stats info not available
      }
    } catch (error) {
      console.error('Redis cache detailed stats error:', error);
    }

    return {
      stats: baseStats,
      hitRate,
      redisInfo: {
        connected: this.isConnected,
        responseTime,
        memoryUsage,
        keyspaceHits,
        keyspaceMisses
      }
    };
  }

  /**
   * Close Redis connection and cleanup resources
   */
  async close(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    try {
      await this.redis.quit();
    } catch (error) {
      console.error('Redis cache close error:', error);
    }
  }

  /**
   * Force reconnection to Redis
   */
  async reconnect(): Promise<boolean> {
    try {
      await this.redis.disconnect();
      await this.redis.connect();
      return true;
    } catch (error) {
      console.error('Redis cache reconnect error:', error);
      return false;
    }
  }

  /**
   * Get Redis connection status
   */
  getConnectionStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }
}