import { getMonitoringConfig } from '../config/monitoring-config.js';
import { CacheInterface } from '../types.js';
import { defaultLogger as logger } from '../utils/logger.js';

/**
 * Metric types enumeration
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  TIMER = 'timer'
}

/**
 * Individual metric data point
 */
export interface MetricDataPoint {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
  metadata?: Record<string, any>;
}

/**
 * Metric definition
 */
export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  labels?: string[];
  unit?: string;
}

/**
 * Stored metric data
 */
export interface StoredMetric {
  definition: MetricDefinition;
  dataPoints: MetricDataPoint[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Metrics query filters
 */
export interface MetricQuery {
  name?: string;
  type?: MetricType;
  startTime?: number;
  endTime?: number;
  labels?: Record<string, string>;
  limit?: number;
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
}

/**
 * Metrics query result
 */
export interface MetricQueryResult {
  metric: MetricDefinition;
  dataPoints: MetricDataPoint[];
  aggregatedValue?: number;
  query: MetricQuery;
}

/**
 * Metrics collector for gathering performance and operational metrics
 */
export class MetricsCollector {
  private cache: CacheInterface;
  private config = getMonitoringConfig();
  private registeredMetrics: Map<string, MetricDefinition> = new Map();
  private inMemoryMetrics: Map<string, StoredMetric> = new Map();

  constructor(cache: CacheInterface) {
    this.cache = cache;
    this.initializeBuiltInMetrics();
  }

  /**
   * Initialize built-in system metrics
   */
  private initializeBuiltInMetrics(): void {
    this.registerMetric({
      name: 'provider_request_total',
      type: MetricType.COUNTER,
      description: 'Total number of requests made to providers',
      labels: ['provider', 'operation', 'status']
    });

    this.registerMetric({
      name: 'provider_request_duration_seconds',
      type: MetricType.HISTOGRAM,
      description: 'Duration of provider requests in seconds',
      labels: ['provider', 'operation'],
      unit: 'seconds'
    });

    this.registerMetric({
      name: 'provider_error_total',
      type: MetricType.COUNTER,
      description: 'Total number of provider errors',
      labels: ['provider', 'operation', 'error_type']
    });

    this.registerMetric({
      name: 'cache_operations_total',
      type: MetricType.COUNTER,
      description: 'Total number of cache operations',
      labels: ['operation', 'status']
    });

    this.registerMetric({
      name: 'cache_hit_ratio',
      type: MetricType.GAUGE,
      description: 'Cache hit ratio percentage',
      labels: ['cache_type'],
      unit: 'percent'
    });

    this.registerMetric({
      name: 'circuit_breaker_state',
      type: MetricType.GAUGE,
      description: 'Circuit breaker current state',
      labels: ['provider', 'state']
    });

    this.registerMetric({
      name: 'system_memory_usage',
      type: MetricType.GAUGE,
      description: 'System memory usage percentage',
      unit: 'percent'
    });

    this.registerMetric({
      name: 'system_cpu_usage',
      type: MetricType.GAUGE,
      description: 'System CPU usage percentage',
      labels: ['cpu_core'],
      unit: 'percent'
    });

    this.registerMetric({
      name: 'active_connections',
      type: MetricType.GAUGE,
      description: 'Number of active connections',
      labels: ['connection_type']
    });
  }

  /**
   * Register a new metric
   */
  registerMetric(definition: MetricDefinition): void {
    this.registeredMetrics.set(definition.name, definition);
    this.inMemoryMetrics.set(definition.name, {
      definition,
      dataPoints: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  /**
   * Record a metric value
   */
  async recordMetric(
    name: string,
    value: number,
    labels?: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<void> {
    const metric = this.registeredMetrics.get(name);
    if (!metric) {
      logger.warn(`Attempted to record unknown metric: ${name}`);
      return;
    }

    const dataPoint: MetricDataPoint = {
      value,
      timestamp: Date.now(),
      labels,
      metadata
    };

    const storedMetric = this.inMemoryMetrics.get(name);
    if (storedMetric) {
      storedMetric.dataPoints.push(dataPoint);
      storedMetric.updatedAt = Date.now();

      // Keep only recent data points based on retention policy
      this.cleanupOldDataPoints(storedMetric);
    }

    // Store in cache for persistence
    try {
      await this.persistMetricDataPoint(name, dataPoint);
    } catch (error) {
      logger.error('Failed to persist metric data point', { name }, error as Error);
    }

    // Log high-value metrics for immediate attention
    if (this.shouldAlertOnMetric(name, value, labels)) {
      logger.warn('High metric value recorded', { name, value, labels });
    }
  }

  /**
   * Increment a counter metric
   */
  async incrementCounter(
    name: string,
    value: number = 1,
    labels?: Record<string, string>
  ): Promise<void> {
    const metric = this.registeredMetrics.get(name);
    if (!metric || metric.type !== MetricType.COUNTER) {
      logger.warn(`Metric ${name} is not a counter`);
      return;
    }

    await this.recordMetric(name, value, labels);
  }

  /**
   * Set a gauge metric value
   */
  async setGauge(
    name: string,
    value: number,
    labels?: Record<string, string>
  ): Promise<void> {
    const metric = this.registeredMetrics.get(name);
    if (!metric || metric.type !== MetricType.GAUGE) {
      logger.warn(`Metric ${name} is not a gauge`);
      return;
    }

    await this.recordMetric(name, value, labels);
  }

  /**
   * Record a timing metric
   */
  async recordTiming(
    name: string,
    durationMs: number,
    labels?: Record<string, string>
  ): Promise<void> {
    const metric = this.registeredMetrics.get(name);
    if (!metric || (metric.type !== MetricType.HISTOGRAM && metric.type !== MetricType.TIMER)) {
      logger.warn(`Metric ${name} is not a timing metric`);
      return;
    }

    await this.recordMetric(name, durationMs / 1000, labels, { durationMs });
  }

  /**
   * Query metrics data
   */
  async queryMetrics(query: MetricQuery): Promise<MetricQueryResult[]> {
    const results: MetricQueryResult[] = [];
    const config = this.config;

    for (const [name, storedMetric] of this.inMemoryMetrics.entries()) {
      // Filter by name if specified
      if (query.name && !name.includes(query.name)) {
        continue;
      }

      // Filter by type if specified
      if (query.type && storedMetric.definition.type !== query.type) {
        continue;
      }

      // Filter data points by time range
      let filteredDataPoints = storedMetric.dataPoints;

      if (query.startTime) {
        filteredDataPoints = filteredDataPoints.filter(dp => dp.timestamp >= query.startTime!);
      }

      if (query.endTime) {
        filteredDataPoints = filteredDataPoints.filter(dp => dp.timestamp <= query.endTime!);
      }

      // Filter by labels if specified
      if (query.labels) {
        filteredDataPoints = filteredDataPoints.filter(dp => {
          if (!dp.labels) return false;
          return Object.entries(query.labels!).every(([key, value]) =>
            dp.labels![key] === value
          );
        });
      }

      // Apply limit if specified
      if (query.limit) {
        filteredDataPoints = filteredDataPoints.slice(-query.limit);
      }

      if (filteredDataPoints.length > 0) {
        let aggregatedValue: number | undefined;

        // Calculate aggregation if specified
        if (query.aggregation && filteredDataPoints.length > 0) {
          switch (query.aggregation) {
            case 'sum':
              aggregatedValue = filteredDataPoints.reduce((sum, dp) => sum + dp.value, 0);
              break;
            case 'avg':
              aggregatedValue = filteredDataPoints.reduce((sum, dp) => sum + dp.value, 0) / filteredDataPoints.length;
              break;
            case 'min':
              aggregatedValue = Math.min(...filteredDataPoints.map(dp => dp.value));
              break;
            case 'max':
              aggregatedValue = Math.max(...filteredDataPoints.map(dp => dp.value));
              break;
            case 'count':
              aggregatedValue = filteredDataPoints.length;
              break;
          }
        }

        results.push({
          metric: storedMetric.definition,
          dataPoints: filteredDataPoints,
          aggregatedValue,
          query: { ...query }
        });
      }
    }

    return results;
  }

  /**
   * Get all registered metrics
   */
  getRegisteredMetrics(): MetricDefinition[] {
    return Array.from(this.registeredMetrics.values());
  }

  /**
   * Get specific metric definition
   */
  getMetricDefinition(name: string): MetricDefinition | undefined {
    return this.registeredMetrics.get(name);
  }

  /**
   * Get metric statistics
   */
  async getMetricStats(name: string): Promise<{
    count: number;
    latestValue?: number;
    latestTimestamp?: number;
    minValue?: number;
    maxValue?: number;
    avgValue?: number;
  } | null> {
    const storedMetric = this.inMemoryMetrics.get(name);
    if (!storedMetric || storedMetric.dataPoints.length === 0) {
      return null;
    }

    const values = storedMetric.dataPoints.map(dp => dp.value);
    const latestDataPoint = storedMetric.dataPoints[storedMetric.dataPoints.length - 1];

    return {
      count: values.length,
      latestValue: latestDataPoint.value,
      latestTimestamp: latestDataPoint.timestamp,
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
      avgValue: values.reduce((sum, val) => sum + val, 0) / values.length
    };
  }

  /**
   * Clean up old data points based on retention policy
   */
  private cleanupOldDataPoints(storedMetric: StoredMetric): void {
    const config = this.config;
    const retentionMs = config.metrics.retention.hours * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;

    storedMetric.dataPoints = storedMetric.dataPoints.filter(dp => dp.timestamp > cutoffTime);

    // Also limit the number of data points
    if (storedMetric.dataPoints.length > config.metrics.retention.maxEntries) {
      storedMetric.dataPoints = storedMetric.dataPoints.slice(-config.metrics.retention.maxEntries);
    }
  }

  /**
   * Persist metric data point to cache
   */
  private async persistMetricDataPoint(name: string, dataPoint: MetricDataPoint): Promise<void> {
    const key = `metric:${name}:${dataPoint.timestamp}`;
    await this.cache.set(key, dataPoint, {
      ttl: this.config.metrics.retention.hours * 60 * 60 * 1000 // Convert hours to ms
    });
  }

  /**
   * Check if a metric value should trigger an alert
   */
  private shouldAlertOnMetric(name: string, value: number, labels?: Record<string, string>): boolean {
    const thresholds = this.config.metrics.thresholds;

    switch (name) {
      case 'provider_request_duration_seconds':
        return value > thresholds.responseTime.critical;
      case 'provider_error_total':
        // This would need error rate calculation over a window
        return false; // Placeholder
      case 'cache_hit_ratio':
        return value < thresholds.cacheHitRate.critical;
      case 'system_memory_usage':
        return value > thresholds.memoryUsage.critical;
      default:
        return false;
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  async exportPrometheusFormat(): Promise<string> {
    const lines: string[] = [];

    for (const [name, storedMetric] of this.inMemoryMetrics.entries()) {
      // Add metric definition comment
      lines.push(`# HELP ${name} ${storedMetric.definition.description}`);
      lines.push(`# TYPE ${name} ${storedMetric.definition.type}`);

      // Add data points
      for (const dataPoint of storedMetric.dataPoints.slice(-100)) { // Last 100 points
        const labels = dataPoint.labels ?
          '{' + Object.entries(dataPoint.labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}' :
          '';

        lines.push(`${name}${labels} ${dataPoint.value} ${dataPoint.timestamp}`);
      }

      lines.push(''); // Empty line between metrics
    }

    return lines.join('\n');
  }
}

/**
 * Convenience functions for recording common metrics
 */
export class MetricsHelper {
  private collector: MetricsCollector;

  constructor(collector: MetricsCollector) {
    this.collector = collector;
  }

  /**
   * Record a provider operation
   */
  async recordProviderOperation(
    provider: string,
    operation: string,
    durationMs: number,
    success: boolean,
    errorType?: string
  ): Promise<void> {
    const labels = { provider, operation };

    // Record timing
    await this.collector.recordTiming('provider_request_duration_seconds', durationMs, labels);

    // Record counter
    await this.collector.incrementCounter('provider_request_total', 1, {
      ...labels,
      status: success ? 'success' : 'error'
    });

    // Record error if applicable
    if (!success && errorType) {
      await this.collector.incrementCounter('provider_error_total', 1, {
        ...labels,
        error_type: errorType
      });
    }
  }

  /**
   * Record cache operation
   */
  async recordCacheOperation(
    operation: string,
    success: boolean,
    cacheType?: string
  ): Promise<void> {
    await this.collector.incrementCounter('cache_operations_total', 1, {
      operation,
      status: success ? 'success' : 'error',
      ...(cacheType && { cache_type: cacheType })
    });
  }

  /**
   * Update cache hit ratio
   */
  async updateCacheHitRatio(hitRatio: number, cacheType?: string): Promise<void> {
    await this.collector.setGauge('cache_hit_ratio', hitRatio, {
      ...(cacheType && { cache_type: cacheType })
    });
  }

  /**
   * Record circuit breaker state change
   */
  async recordCircuitBreakerState(provider: string, state: string): Promise<void> {
    // Convert state to numeric value (CLOSED=0, HALF_OPEN=1, OPEN=2)
    const stateValue = state === 'CLOSED' ? 0 : state === 'HALF_OPEN' ? 1 : 2;

    await this.collector.setGauge('circuit_breaker_state', stateValue, {
      provider,
      state
    });
  }

  /**
   * Record system resource usage
   */
  async recordSystemResources(
    memoryUsage: number,
    cpuUsage?: number,
    cpuCore?: number
  ): Promise<void> {
    await this.collector.setGauge('system_memory_usage', memoryUsage);

    if (cpuUsage !== undefined && cpuCore !== undefined) {
      await this.collector.setGauge('system_cpu_usage', cpuUsage, {
        cpu_core: cpuCore.toString()
      });
    }
  }

  /**
   * Record active connections
   */
  async recordActiveConnections(count: number, connectionType?: string): Promise<void> {
    await this.collector.setGauge('active_connections', count, {
      ...(connectionType && { connection_type: connectionType })
    });
  }
}

// Singleton instance
let metricsCollector: MetricsCollector | null = null;
let metricsHelper: MetricsHelper | null = null;

/**
 * Initialize the metrics system with a cache interface
 */
export function initializeMetrics(cache: CacheInterface): MetricsCollector {
  if (!metricsCollector) {
    metricsCollector = new MetricsCollector(cache);
    metricsHelper = new MetricsHelper(metricsCollector);
  }
  return metricsCollector;
}

/**
 * Get the metrics collector instance
 */
export function getMetricsCollector(): MetricsCollector {
  if (!metricsCollector) {
    throw new Error('Metrics system not initialized. Call initializeMetrics first.');
  }
  return metricsCollector;
}

/**
 * Get the metrics helper instance
 */
export function getMetricsHelper(): MetricsHelper {
  if (!metricsHelper) {
    throw new Error('Metrics system not initialized. Call initializeMetrics first.');
  }
  return metricsHelper;
}

/**
 * Convenience function to record a metric
 */
export async function recordMetric(
  name: string,
  value: number,
  labels?: Record<string, string>,
  metadata?: Record<string, any>
): Promise<void> {
  await getMetricsCollector().recordMetric(name, value, labels, metadata);
}

/**
 * Convenience function to increment a counter
 */
export async function incrementCounter(
  name: string,
  value: number = 1,
  labels?: Record<string, string>
): Promise<void> {
  await getMetricsCollector().incrementCounter(name, value, labels);
}

/**
 * Convenience function to set a gauge
 */
export async function setGauge(
  name: string,
  value: number,
  labels?: Record<string, string>
): Promise<void> {
  await getMetricsCollector().setGauge(name, value, labels);
}

/**
 * Convenience function to record timing
 */
export async function recordTiming(
  name: string,
  durationMs: number,
  labels?: Record<string, string>
): Promise<void> {
  await getMetricsCollector().recordTiming(name, durationMs, labels);
}

/**
 * Convenience function to query metrics
 */
export async function queryMetrics(query: MetricQuery): Promise<MetricQueryResult[]> {
  return getMetricsCollector().queryMetrics(query);
}