import { CacheInterface, CacheOptions } from '../types.js';
import { cacheConfig, CacheConfigUtils } from '../config/cache-config.js';

// Node.js Timer type
type Timer = ReturnType<typeof setInterval>;

/**
 * Cache warming configuration
 */
export interface CacheWarmupConfig {
  enabled: boolean;
  warmupOnStart: boolean;
  warmupInterval?: number; // in milliseconds
  batchSize: number;
  maxConcurrency: number;
  routes: CacheWarmupRoute[];
}

/**
 * Cache warmup route definition
 */
export interface CacheWarmupRoute {
  name: string;
  from: {
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  to: {
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  parcels: Array<{
    weight: number;
    dimensions: {
      length: number;
      width: number;
      height: number;
    };
  }>;
  providers: string[];
  priority: number; // Higher number = higher priority
}

/**
 * Cache warming result
 */
export interface CacheWarmupResult {
  routeName: string;
  provider: string;
  success: boolean;
  cached: boolean;
  error?: string;
  duration: number;
}

/**
 * Cache warmer for pre-populating cache with common routes
 */
export class CacheWarmer {
  private cache: CacheInterface;
  private config: CacheWarmupConfig;
  private warmupInterval?: Timer;
  private isRunning = false;

  constructor(cache: CacheInterface, config: Partial<CacheWarmupConfig> = {}) {
    this.cache = cache;
    this.config = {
      enabled: true,
      warmupOnStart: true,
      warmupInterval: 30 * 60 * 1000, // 30 minutes
      batchSize: 10,
      maxConcurrency: 3,
      routes: [],
      ...config
    };
  }

  /**
   * Start cache warming process
   */
  async start(): Promise<void> {
    if (!this.config.enabled || this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      // Initial warmup if enabled
      if (this.config.warmupOnStart) {
        await this.performWarmup();
      }

      // Setup periodic warmup
      if (this.config.warmupInterval && this.config.warmupInterval > 0) {
        this.warmupInterval = setInterval(() => {
          this.performWarmup();
        }, this.config.warmupInterval);
      }
    } catch (error) {
      console.error('Cache warmer initialization failed:', error);
      this.isRunning = false;
    }
  }

  /**
   * Stop cache warming process
   */
  stop(): void {
    if (this.warmupInterval) {
      clearInterval(this.warmupInterval);
      this.warmupInterval = undefined;
    }
    this.isRunning = false;
  }

  /**
   * Add a route to the warmup configuration
   */
  addRoute(route: CacheWarmupRoute): void {
    this.config.routes.push(route);
    // Sort by priority (highest first)
    this.config.routes.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a route from warmup configuration
   */
  removeRoute(routeName: string): void {
    this.config.routes = this.config.routes.filter(r => r.name !== routeName);
  }

  /**
   * Get current warmup configuration
   */
  getConfig(): CacheWarmupConfig {
    return { ...this.config };
  }

  /**
   * Update warmup configuration
   */
  updateConfig(updates: Partial<CacheWarmupConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Perform cache warmup for all configured routes
   */
  async performWarmup(): Promise<CacheWarmupResult[]> {
    if (!this.config.enabled || this.config.routes.length === 0) {
      return [];
    }

    console.log(`Starting cache warmup for ${this.config.routes.length} routes`);

    const results: CacheWarmupResult[] = [];
    const routes = [...this.config.routes];

    // Process routes in batches
    for (let i = 0; i < routes.length; i += this.config.batchSize) {
      const batch = routes.slice(i, i + this.config.batchSize);
      const batchResults = await this.processBatch(batch);
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming APIs
      if (i + this.config.batchSize < routes.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const cachedCount = results.filter(r => r.cached).length;

    console.log(`Cache warmup completed: ${successCount}/${results.length} successful, ${cachedCount} already cached`);

    return results;
  }

  /**
   * Process a batch of routes concurrently
   */
  private async processBatch(routes: CacheWarmupRoute[]): Promise<CacheWarmupResult[]> {
    const promises = routes.map(route => this.processRoute(route));
    const results = await Promise.allSettled(promises);

    const allResults: CacheWarmupResult[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      } else {
        // Add error result for the failed route
        allResults.push({
          routeName: routes[index].name,
          provider: 'unknown',
          success: false,
          cached: false,
          error: result.reason?.message || 'Unknown error',
          duration: 0
        });
      }
    });

    return allResults;
  }

  /**
   * Process a single route for all its providers
   */
  private async processRoute(route: CacheWarmupRoute): Promise<CacheWarmupResult[]> {
    const results: CacheWarmupResult[] = [];

    // Process providers sequentially to respect rate limits
    for (const provider of route.providers) {
      const result = await this.warmupRouteForProvider(route, provider);
      results.push(result);

      // Small delay between providers
      if (route.providers.indexOf(provider) < route.providers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  /**
   * Warmup cache for a specific route and provider
   */
  private async warmupRouteForProvider(
    route: CacheWarmupRoute,
    provider: string
  ): Promise<CacheWarmupResult> {
    const startTime = Date.now();

    try {
      // Create mock shipment input for warmup
      const shipmentInput = {
        from: {
          city: route.from.city,
          state: route.from.state,
          zip: route.from.zip,
          country: route.from.country,
          street1: '123 Main St',
          name: 'Cache Warmer'
        },
        to: {
          city: route.to.city,
          state: route.to.state,
          zip: route.to.zip,
          country: route.to.country,
          street1: '456 Oak Ave',
          name: 'Cache Warmer'
        },
        parcel: route.parcels[0], // Use first parcel for warmup
        reference: `warmup-${route.name}-${provider}`
      };

      // Generate cache key
      const cacheKey = CacheConfigUtils.createRateQuoteKey(
        provider,
        shipmentInput.from,
        shipmentInput.to,
        shipmentInput.parcel
      );

      // Check if already cached
      const existing = await this.cache.get(cacheKey);
      if (existing) {
        return {
          routeName: route.name,
          provider,
          success: true,
          cached: true,
          duration: Date.now() - startTime
        };
      }

      // This is a mock warmup - in real implementation, you would:
      // 1. Get the provider adapter
      // 2. Call its quote method with the shipment input
      // 3. Cache the result

      console.log(`Cache warmup: Would fetch rates for ${route.name} via ${provider}`);

      // For now, simulate a successful cache operation
      const mockRates = [{
        provider: provider as any,
        rateId: 'warmup-rate-1',
        shipmentId: 'warmup-shipment-1',
        service: 'Standard',
        carrier: 'Mock Carrier',
        amount: 1000, // $10.00 in cents
        currency: 'USD',
        estDeliveryDays: 3
      }];

      const ttl = cacheConfig.getTTL('rateQuote');
      await this.cache.set(cacheKey, mockRates, { ttl });

      return {
        routeName: route.name,
        provider,
        success: true,
        cached: false,
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        routeName: route.name,
        provider,
        success: false,
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Get cache warmup statistics
   */
  async getStats(): Promise<{
    isRunning: boolean;
    routesCount: number;
    lastWarmup?: Date;
    nextWarmup?: Date;
  }> {
    return {
      isRunning: this.isRunning,
      routesCount: this.config.routes.length,
      nextWarmup: this.config.warmupInterval && this.config.warmupInterval > 0
        ? new Date(Date.now() + this.config.warmupInterval)
        : undefined
    };
  }
}

/**
 * Default cache warmup routes for common shipping scenarios
 */
export const DEFAULT_WARMUP_ROUTES: CacheWarmupRoute[] = [
  {
    name: 'NYC-to-LA',
    from: { city: 'New York', state: 'NY', zip: '10001', country: 'US' },
    to: { city: 'Los Angeles', state: 'CA', zip: '90210', country: 'US' },
    parcels: [
      { weight: 1, dimensions: { length: 12, width: 8, height: 6 } },
      { weight: 5, dimensions: { length: 18, width: 12, height: 12 } }
    ],
    providers: ['easypost', 'shippo'],
    priority: 10
  },
  {
    name: 'LA-to-Chicago',
    from: { city: 'Los Angeles', state: 'CA', zip: '90210', country: 'US' },
    to: { city: 'Chicago', state: 'IL', zip: '60601', country: 'US' },
    parcels: [
      { weight: 2, dimensions: { length: 10, width: 8, height: 4 } }
    ],
    providers: ['easypost', 'shippo'],
    priority: 8
  },
  {
    name: 'Miami-to-Seattle',
    from: { city: 'Miami', state: 'FL', zip: '33101', country: 'US' },
    to: { city: 'Seattle', state: 'WA', zip: '98101', country: 'US' },
    parcels: [
      { weight: 10, dimensions: { length: 24, width: 18, height: 12 } }
    ],
    providers: ['easypost', 'shippo'],
    priority: 6
  }
];