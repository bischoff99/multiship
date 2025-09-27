import { getHealthService, HealthServiceStatus } from './health-service.js';
import { getMetricsCollector, MetricQuery, MetricQueryResult, MetricType } from './metrics.js';
import { providerHealthCheck, HealthCheckResponse, HealthStatus } from './health-check.js';
import { getMonitoringConfig } from '../config/monitoring-config.js';
import { defaultLogger as logger } from '../utils/logger.js';

/**
 * Dashboard time range options
 */
export enum DashboardTimeRange {
  LAST_5_MINUTES = '5m',
  LAST_15_MINUTES = '15m',
  LAST_1_HOUR = '1h',
  LAST_4_HOURS = '4h',
  LAST_24_HOURS = '24h',
  LAST_7_DAYS = '7d'
}

/**
 * Dashboard widget data
 */
export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'status' | 'alert' | 'table';
  title: string;
  data: any;
  lastUpdated: number;
  refreshInterval?: number;
}

/**
 * Real-time dashboard data
 */
export interface DashboardData {
  timestamp: number;
  timeRange: DashboardTimeRange;
  widgets: Record<string, DashboardWidget>;
  summary: DashboardSummary;
  alerts: DashboardAlert[];
  trends: TrendData[];
}

/**
 * Dashboard summary statistics
 */
export interface DashboardSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  uptime: number;
  healthScore: number;
  activeProviders: number;
  cacheHitRate: number;
  systemLoad: {
    memory: number;
    cpu: number;
  };
}

/**
 * Dashboard alert information
 */
export interface DashboardAlert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
  source: string;
}

/**
 * Trend data for charts
 */
export interface TrendData {
  metric: string;
  labels: string[];
  data: Array<{
    timestamp: number;
    value: number;
  }>;
  trend: 'up' | 'down' | 'stable';
  change: number; // percentage change
}

/**
 * Dashboard data provider
 */
export class DashboardProvider {
  private healthService = getHealthService();
  private metricsCollector = getMetricsCollector();
  private config = getMonitoringConfig();
  private lastUpdate: number = 0;

  /**
   * Get complete dashboard data
   */
  async getDashboardData(
    timeRange: DashboardTimeRange = DashboardTimeRange.LAST_1_HOUR
  ): Promise<DashboardData> {
    const startTime = this.getTimeRangeStart(timeRange);

    try {
      // Get real-time metrics
      const [
        healthResponse,
        serviceStatus,
        metricsData,
        alerts,
        trends
      ] = await Promise.all([
        providerHealthCheck.performAllChecks(),
        this.healthService.getStatus(),
        this.getMetricsData(startTime),
        this.getAlertsData(),
        this.getTrendData(startTime, timeRange)
      ]);

      // Calculate summary statistics
      const summary = await this.calculateSummary(startTime, healthResponse);

      // Build widgets
      const widgets = await this.buildWidgets(healthResponse, metricsData, serviceStatus);

      const dashboardData: DashboardData = {
        timestamp: Date.now(),
        timeRange,
        widgets,
        summary,
        alerts,
        trends
      };

      this.lastUpdate = Date.now();
      return dashboardData;

    } catch (error) {
      logger.error('Failed to get dashboard data', { timeRange }, error as Error);
      throw error;
    }
  }

  /**
   * Get specific widget data
   */
  async getWidgetData(widgetId: string): Promise<DashboardWidget | null> {
    const dashboardData = await this.getDashboardData();
    return dashboardData.widgets[widgetId] || null;
  }

  /**
   * Get health status widget
   */
  async getHealthStatusWidget(): Promise<DashboardWidget> {
    const healthResponse = await providerHealthCheck.performAllChecks();

    return {
      id: 'health-status',
      type: 'status',
      title: 'System Health',
      data: {
        status: healthResponse.status,
        summary: healthResponse.summary,
        checks: healthResponse.checks.map(check => ({
          name: check.name,
          status: check.status,
          message: check.message,
          responseTime: check.responseTime
        }))
      },
      lastUpdated: Date.now(),
      refreshInterval: 30000 // 30 seconds
    };
  }

  /**
   * Get metrics overview widget
   */
  async getMetricsOverviewWidget(): Promise<DashboardWidget> {
    const endTime = Date.now();
    const startTime = endTime - (60 * 60 * 1000); // Last hour

    const queries: MetricQuery[] = [
      { name: 'provider_request_total', startTime, endTime },
      { name: 'provider_error_total', startTime, endTime },
      { name: 'provider_request_duration_seconds', startTime, endTime, aggregation: 'avg' },
      { name: 'cache_hit_ratio', startTime, endTime, aggregation: 'avg' }
    ];

    const results = await Promise.all(queries.map(q => this.metricsCollector.queryMetrics(q)));

    return {
      id: 'metrics-overview',
      type: 'metric',
      title: 'Key Metrics',
      data: {
        totalRequests: results[0][0]?.aggregatedValue || 0,
        totalErrors: results[1][0]?.aggregatedValue || 0,
        avgResponseTime: results[2][0]?.aggregatedValue || 0,
        cacheHitRate: results[3][0]?.aggregatedValue || 0
      },
      lastUpdated: Date.now(),
      refreshInterval: 60000 // 1 minute
    };
  }

  /**
   * Get provider performance widget
   */
  async getProviderPerformanceWidget(): Promise<DashboardWidget> {
    const endTime = Date.now();
    const startTime = endTime - (60 * 60 * 1000); // Last hour

    const query: MetricQuery = {
      name: 'provider_request_duration_seconds',
      startTime,
      endTime
    };

    const results = await this.metricsCollector.queryMetrics(query);

    // Group by provider
    const providerData: Record<string, any> = {};

    for (const result of results) {
      for (const dataPoint of result.dataPoints) {
        const provider = dataPoint.labels?.provider || 'unknown';
        if (!providerData[provider]) {
          providerData[provider] = {
            requestCount: 0,
            totalResponseTime: 0,
            errorCount: 0
          };
        }

        providerData[provider].requestCount++;
        providerData[provider].totalResponseTime += dataPoint.value;
      }
    }

    // Calculate averages
    Object.keys(providerData).forEach(provider => {
      const data = providerData[provider];
      data.avgResponseTime = data.totalResponseTime / data.requestCount;
      delete data.totalResponseTime;
    });

    return {
      id: 'provider-performance',
      type: 'chart',
      title: 'Provider Performance',
      data: {
        providers: providerData,
        chartType: 'bar'
      },
      lastUpdated: Date.now(),
      refreshInterval: 60000
    };
  }

  /**
   * Get system resources widget
   */
  async getSystemResourcesWidget(): Promise<DashboardWidget> {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    return {
      id: 'system-resources',
      type: 'metric',
      title: 'System Resources',
      data: {
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
        },
        uptime: {
          seconds: Math.round(uptime),
          formatted: this.formatUptime(uptime)
        },
        cpu: {
          note: 'CPU monitoring not yet implemented'
        }
      },
      lastUpdated: Date.now(),
      refreshInterval: 30000
    };
  }

  /**
   * Get alerts widget
   */
  async getAlertsWidget(): Promise<DashboardWidget> {
    const alerts = this.healthService.getActiveAlerts();

    return {
      id: 'active-alerts',
      type: 'alert',
      title: 'Active Alerts',
      data: {
        alerts: alerts.map(alert => ({
          id: alert.id,
          severity: alert.severity,
          title: alert.name,
          message: alert.message,
          timestamp: alert.timestamp,
          acknowledged: alert.acknowledged
        })),
        count: alerts.length
      },
      lastUpdated: Date.now(),
      refreshInterval: 10000 // 10 seconds
    };
  }

  /**
   * Get time series chart widget
   */
  async getTimeSeriesWidget(
    metricName: string,
    timeRange: DashboardTimeRange = DashboardTimeRange.LAST_1_HOUR
  ): Promise<DashboardWidget> {
    const startTime = this.getTimeRangeStart(timeRange);
    const query: MetricQuery = {
      name: metricName,
      startTime,
      endTime: Date.now(),
      limit: 100
    };

    const results = await this.metricsCollector.queryMetrics(query);

    return {
      id: `timeseries-${metricName}`,
      type: 'chart',
      title: `${metricName} Over Time`,
      data: {
        metric: metricName,
        data: results[0]?.dataPoints || [],
        chartType: 'line'
      },
      lastUpdated: Date.now(),
      refreshInterval: 60000
    };
  }

  /**
   * Get metrics data for the specified time range
   */
  private async getMetricsData(startTime: number): Promise<Record<string, MetricQueryResult[]>> {
    const metrics = [
      'provider_request_total',
      'provider_request_duration_seconds',
      'provider_error_total',
      'cache_hit_ratio',
      'system_memory_usage'
    ];

    const queries = metrics.map(metric => ({
      name: metric,
      startTime,
      endTime: Date.now()
    }));

    const results = await Promise.all(queries.map(q => this.metricsCollector.queryMetrics(q)));

    const metricsData: Record<string, MetricQueryResult[]> = {};
    metrics.forEach((metric, index) => {
      metricsData[metric] = results[index];
    });

    return metricsData;
  }

  /**
   * Get alerts data
   */
  private async getAlertsData(): Promise<DashboardAlert[]> {
    const activeAlerts = this.healthService.getActiveAlerts();

    return activeAlerts.map(alert => ({
      id: alert.id,
      severity: alert.severity,
      title: alert.name,
      message: alert.message,
      timestamp: alert.timestamp,
      acknowledged: alert.acknowledged,
      source: 'health-service'
    }));
  }

  /**
   * Get trend data for charts
   */
  private async getTrendData(startTime: number, timeRange: DashboardTimeRange): Promise<TrendData[]> {
    const trends: TrendData[] = [];

    try {
      // Calculate trends for key metrics
      const keyMetrics = [
        { name: 'provider_request_total', label: 'Total Requests' },
        { name: 'provider_error_total', label: 'Total Errors' },
        { name: 'provider_request_duration_seconds', label: 'Avg Response Time' }
      ];

      for (const metricInfo of keyMetrics) {
        const query: MetricQuery = {
          name: metricInfo.name,
          startTime,
          endTime: Date.now(),
          aggregation: 'sum'
        };

        const results = await this.metricsCollector.queryMetrics(query);
        const dataPoints = results[0]?.dataPoints || [];

        if (dataPoints.length >= 2) {
          const firstValue = dataPoints[0].value;
          const lastValue = dataPoints[dataPoints.length - 1].value;
          const change = firstValue !== 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;

          let trend: 'up' | 'down' | 'stable' = 'stable';
          if (change > 5) trend = 'up';
          else if (change < -5) trend = 'down';

          trends.push({
            metric: metricInfo.label,
            labels: [metricInfo.name],
            data: dataPoints.slice(-20), // Last 20 data points
            trend,
            change: Math.round(change * 100) / 100
          });
        }
      }
    } catch (error) {
      logger.error('Failed to get trend data', {}, error as Error);
    }

    return trends;
  }

  /**
   * Calculate dashboard summary statistics
   */
  private async calculateSummary(
    startTime: number,
    healthResponse: HealthCheckResponse
  ): Promise<DashboardSummary> {
    try {
      const metricsHelper = getMetricsCollector();

      // Get request metrics
      const requestQuery: MetricQuery = {
        name: 'provider_request_total',
        startTime,
        aggregation: 'sum'
      };

      const errorQuery: MetricQuery = {
        name: 'provider_error_total',
        startTime,
        aggregation: 'sum'
      };

      const durationQuery: MetricQuery = {
        name: 'provider_request_duration_seconds',
        startTime,
        aggregation: 'avg'
      };

      const cacheQuery: MetricQuery = {
        name: 'cache_hit_ratio',
        startTime,
        aggregation: 'avg'
      };

      const [requestResults, errorResults, durationResults, cacheResults] =
        await Promise.all([
          metricsHelper.queryMetrics(requestQuery),
          metricsHelper.queryMetrics(errorQuery),
          metricsHelper.queryMetrics(durationQuery),
          metricsHelper.queryMetrics(cacheQuery)
        ]);

      const totalRequests = requestResults[0]?.aggregatedValue || 0;
      const totalErrors = errorResults[0]?.aggregatedValue || 0;
      const avgResponseTime = durationResults[0]?.aggregatedValue || 0;
      const cacheHitRate = cacheResults[0]?.aggregatedValue || 0;

      // Calculate health score (0-100)
      const healthScore = this.calculateHealthScore(healthResponse);

      // Get system resource usage
      const memoryUsage = process.memoryUsage();
      const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      return {
        totalRequests: Math.round(totalRequests),
        successfulRequests: Math.round(totalRequests - totalErrors),
        failedRequests: Math.round(totalErrors),
        averageResponseTime: Math.round(avgResponseTime * 1000), // Convert to ms
        uptime: process.uptime(),
        healthScore,
        activeProviders: healthResponse.checks.filter(c => c.status === HealthStatus.HEALTHY).length,
        cacheHitRate: Math.round(cacheHitRate * 100), // Convert to percentage
        systemLoad: {
          memory: Math.round(memoryPercent),
          cpu: 0 // Would need actual CPU monitoring implementation
        }
      };
    } catch (error) {
      logger.error('Failed to calculate dashboard summary', {}, error as Error);

      // Return default values
      return {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        uptime: process.uptime(),
        healthScore: 0,
        activeProviders: 0,
        cacheHitRate: 0,
        systemLoad: {
          memory: 0,
          cpu: 0
        }
      };
    }
  }

  /**
   * Build all dashboard widgets
   */
  private async buildWidgets(
    healthResponse: HealthCheckResponse,
    metricsData: Record<string, MetricQueryResult[]>,
    serviceStatus: HealthServiceStatus
  ): Promise<Record<string, DashboardWidget>> {
    const widgets: Record<string, DashboardWidget> = {};

    // Health status widget
    widgets['health-status'] = await this.getHealthStatusWidget();

    // Metrics overview widget
    widgets['metrics-overview'] = await this.getMetricsOverviewWidget();

    // Provider performance widget
    widgets['provider-performance'] = await this.getProviderPerformanceWidget();

    // System resources widget
    widgets['system-resources'] = await this.getSystemResourcesWidget();

    // Active alerts widget
    widgets['active-alerts'] = await this.getAlertsWidget();

    // Time series widgets for key metrics
    const timeSeriesMetrics = [
      'provider_request_total',
      'provider_request_duration_seconds',
      'provider_error_total'
    ];

    for (const metric of timeSeriesMetrics) {
      widgets[`timeseries-${metric}`] = await this.getTimeSeriesWidget(metric);
    }

    return widgets;
  }

  /**
   * Calculate health score (0-100)
   */
  private calculateHealthScore(healthResponse: HealthCheckResponse): number {
    if (healthResponse.checks.length === 0) {
      return 0;
    }

    const weights = {
      [HealthStatus.HEALTHY]: 100,
      [HealthStatus.DEGRADED]: 50,
      [HealthStatus.UNHEALTHY]: 0,
      [HealthStatus.UNKNOWN]: 25
    };

    const totalWeight = healthResponse.checks.reduce((sum, check) => sum + weights[check.status], 0);
    const maxWeight = healthResponse.checks.length * 100;

    return Math.round((totalWeight / maxWeight) * 100);
  }

  /**
   * Get start time for time range
   */
  private getTimeRangeStart(timeRange: DashboardTimeRange): number {
    const now = Date.now();
    const ranges = {
      [DashboardTimeRange.LAST_5_MINUTES]: 5 * 60 * 1000,
      [DashboardTimeRange.LAST_15_MINUTES]: 15 * 60 * 1000,
      [DashboardTimeRange.LAST_1_HOUR]: 60 * 60 * 1000,
      [DashboardTimeRange.LAST_4_HOURS]: 4 * 60 * 60 * 1000,
      [DashboardTimeRange.LAST_24_HOURS]: 24 * 60 * 60 * 1000,
      [DashboardTimeRange.LAST_7_DAYS]: 7 * 24 * 60 * 60 * 1000
    };

    return now - ranges[timeRange];
  }

  /**
   * Format uptime to human readable string
   */
  private formatUptime(uptimeSeconds: number): string {
    const days = Math.floor(uptimeSeconds / (24 * 60 * 60));
    const hours = Math.floor((uptimeSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptimeSeconds % (60 * 60)) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Export dashboard data as JSON
   */
  async exportDashboardData(
    timeRange: DashboardTimeRange = DashboardTimeRange.LAST_1_HOUR
  ): Promise<string> {
    const data = await this.getDashboardData(timeRange);
    return JSON.stringify(data, null, 2);
  }

  /**
   * Get dashboard configuration
   */
  getDashboardConfig() {
    return {
      refreshIntervals: {
        'health-status': 30000,
        'metrics-overview': 60000,
        'provider-performance': 60000,
        'system-resources': 30000,
        'active-alerts': 10000
      },
      defaultTimeRange: DashboardTimeRange.LAST_1_HOUR,
      availableTimeRanges: Object.values(DashboardTimeRange),
      widgetTypes: ['metric', 'chart', 'status', 'alert', 'table']
    };
  }
}

// Singleton instance
let dashboardProvider: DashboardProvider | null = null;

/**
 * Get the dashboard provider instance
 */
export function getDashboardProvider(): DashboardProvider {
  if (!dashboardProvider) {
    dashboardProvider = new DashboardProvider();
  }
  return dashboardProvider;
}

/**
 * Convenience function to get dashboard data
 */
export async function getDashboardData(
  timeRange: DashboardTimeRange = DashboardTimeRange.LAST_1_HOUR
): Promise<DashboardData> {
  return getDashboardProvider().getDashboardData(timeRange);
}

/**
 * Convenience function to get widget data
 */
export async function getWidgetData(widgetId: string): Promise<DashboardWidget | null> {
  return getDashboardProvider().getWidgetData(widgetId);
}