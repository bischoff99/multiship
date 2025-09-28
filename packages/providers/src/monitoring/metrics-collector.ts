import { Logger } from '../utils/logger.js';

export interface MetricData {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
}

export interface ProviderMetrics {
  provider: string;
  operation: string;
  success: boolean;
  duration: number;
  timestamp: number;
  errorType?: string;
  circuitBreakerState?: string;
  cacheHit?: boolean;
}

export interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
  timestamp: number;
  activeConnections?: number;
  cacheStats?: {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  };
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: MetricData[] = [];
  private logger: Logger;
  private maxMetrics: number = 10000;
  private flushInterval?: NodeJS.Timeout;

  private constructor(logger?: Logger) {
    this.logger = logger || new Logger();
    this.startFlushInterval();
  }

  public static getInstance(logger?: Logger): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector(logger);
    }
    return MetricsCollector.instance;
  }

  /**
   * Record a provider operation metric
   */
  public recordProviderOperation(metrics: ProviderMetrics): void {
    const tags = {
      provider: metrics.provider,
      operation: metrics.operation,
      success: metrics.success.toString(),
      ...(metrics.errorType && { errorType: metrics.errorType }),
      ...(metrics.circuitBreakerState && { circuitBreakerState: metrics.circuitBreakerState }),
      ...(metrics.cacheHit !== undefined && { cacheHit: metrics.cacheHit.toString() })
    };

    // Record operation duration
    this.addMetric({
      name: 'provider.operation.duration',
      value: metrics.duration,
      timestamp: metrics.timestamp,
      tags,
      type: 'histogram'
    });

    // Record operation count
    this.addMetric({
      name: 'provider.operation.count',
      value: 1,
      timestamp: metrics.timestamp,
      tags,
      type: 'counter'
    });

    // Record success/failure
    this.addMetric({
      name: 'provider.operation.success',
      value: metrics.success ? 1 : 0,
      timestamp: metrics.timestamp,
      tags,
      type: 'counter'
    });
  }

  /**
   * Record circuit breaker state change
   */
  public recordCircuitBreakerState(
    provider: string,
    state: string,
    previousState: string,
    timestamp: number = Date.now()
  ): void {
    this.addMetric({
      name: 'circuit.breaker.state_change',
      value: 1,
      timestamp,
      tags: {
        provider,
        state,
        previousState
      },
      type: 'counter'
    });
  }

  /**
   * Record cache operation
   */
  public recordCacheOperation(
    operation: 'hit' | 'miss' | 'set' | 'delete',
    key?: string,
    duration?: number,
    timestamp: number = Date.now()
  ): void {
    const tags = {
      operation,
      ...(key && { key: this.hashKey(key) })
    };

    this.addMetric({
      name: 'cache.operation.count',
      value: 1,
      timestamp,
      tags,
      type: 'counter'
    });

    if (duration !== undefined) {
      this.addMetric({
        name: 'cache.operation.duration',
        value: duration,
        timestamp,
        tags,
        type: 'histogram'
      });
    }
  }

  /**
   * Record system metrics
   */
  public recordSystemMetrics(metrics: SystemMetrics): void {
    // Memory usage
    this.addMetric({
      name: 'system.memory.heap_used',
      value: metrics.memoryUsage.heapUsed,
      timestamp: metrics.timestamp,
      type: 'gauge'
    });

    this.addMetric({
      name: 'system.memory.heap_total',
      value: metrics.memoryUsage.heapTotal,
      timestamp: metrics.timestamp,
      type: 'gauge'
    });

    this.addMetric({
      name: 'system.memory.external',
      value: metrics.memoryUsage.external,
      timestamp: metrics.timestamp,
      type: 'gauge'
    });

    // Uptime
    this.addMetric({
      name: 'system.uptime',
      value: metrics.uptime,
      timestamp: metrics.timestamp,
      type: 'gauge'
    });

    // Active connections
    if (metrics.activeConnections !== undefined) {
      this.addMetric({
        name: 'system.connections.active',
        value: metrics.activeConnections,
        timestamp: metrics.timestamp,
        type: 'gauge'
      });
    }

    // Cache stats
    if (metrics.cacheStats) {
      this.addMetric({
        name: 'cache.hits',
        value: metrics.cacheStats.hits,
        timestamp: metrics.timestamp,
        type: 'counter'
      });

      this.addMetric({
        name: 'cache.misses',
        value: metrics.cacheStats.misses,
        timestamp: metrics.timestamp,
        type: 'counter'
      });

      this.addMetric({
        name: 'cache.size',
        value: metrics.cacheStats.size,
        timestamp: metrics.timestamp,
        type: 'gauge'
      });

      this.addMetric({
        name: 'cache.hit_rate',
        value: metrics.cacheStats.hitRate,
        timestamp: metrics.timestamp,
        type: 'gauge'
      });
    }
  }

  /**
   * Get metrics summary
   */
  public getMetricsSummary(timeWindowMs: number = 300000): {
    totalMetrics: number;
    providerMetrics: Record<string, any>;
    systemMetrics: any;
    cacheMetrics: any;
  } {
    const cutoff = Date.now() - timeWindowMs;
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoff);

    const providerMetrics: Record<string, any> = {};
    const systemMetrics: any = {};
    const cacheMetrics: any = {};

    for (const metric of recentMetrics) {
      if (metric.name.startsWith('provider.')) {
        const provider = metric.tags?.provider || 'unknown';
        if (!providerMetrics[provider]) {
          providerMetrics[provider] = {
            operations: 0,
            successes: 0,
            failures: 0,
            totalDuration: 0,
            avgDuration: 0
          };
        }

        if (metric.name === 'provider.operation.count') {
          providerMetrics[provider].operations += metric.value;
        } else if (metric.name === 'provider.operation.success') {
          if (metric.value === 1) {
            providerMetrics[provider].successes += metric.value;
          } else {
            providerMetrics[provider].failures += 1;
          }
        } else if (metric.name === 'provider.operation.duration') {
          providerMetrics[provider].totalDuration += metric.value;
        }
      } else if (metric.name.startsWith('system.')) {
        systemMetrics[metric.name] = metric.value;
      } else if (metric.name.startsWith('cache.')) {
        cacheMetrics[metric.name] = metric.value;
      }
    }

    // Calculate averages
    for (const provider in providerMetrics) {
      const stats = providerMetrics[provider];
      if (stats.operations > 0) {
        stats.avgDuration = stats.totalDuration / stats.operations;
        stats.successRate = stats.successes / stats.operations;
      }
    }

    return {
      totalMetrics: recentMetrics.length,
      providerMetrics,
      systemMetrics,
      cacheMetrics
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  public exportPrometheusMetrics(): string {
    const lines: string[] = [];
    
    for (const metric of this.metrics) {
      const tags = metric.tags ? 
        Object.entries(metric.tags)
          .map(([key, value]) => `${key}="${value}"`)
          .join(',') : '';
      
      const tagString = tags ? `{${tags}}` : '';
      lines.push(`${metric.name}${tagString} ${metric.value} ${metric.timestamp}`);
    }

    return lines.join('\n');
  }

  /**
   * Clear old metrics
   */
  public clearOldMetrics(olderThanMs: number = 3600000): void {
    const cutoff = Date.now() - olderThanMs;
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Get all metrics
   */
  public getAllMetrics(): MetricData[] {
    return [...this.metrics];
  }

  /**
   * Add a metric
   */
  private addMetric(metric: MetricData): void {
    this.metrics.push(metric);

    // Limit metrics array size
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Hash sensitive keys for privacy
   */
  private hashKey(key: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 8);
  }

  /**
   * Start periodic flush of metrics
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.logger.debug('Metrics collector flush', {
        totalMetrics: this.metrics.length,
        summary: this.getMetricsSummary(300000) // 5 minutes
      });
    }, 60000); // Flush every minute
  }

  /**
   * Stop the metrics collector
   */
  public destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }
    this.metrics = [];
  }
}

// Export singleton instance
export const metricsCollector = MetricsCollector.getInstance();