import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { providerFactory } from '@pkg/providers/factory';
import { providerHealthCheck } from '@pkg/providers/monitoring/health-check';
import { getHealthService } from '@pkg/providers/monitoring/health-service';
import { getDashboardProvider, DashboardTimeRange } from '@pkg/providers/monitoring/dashboard';
import { getMetricsCollector } from '@pkg/providers/monitoring/metrics';

export default async function health(app: FastifyInstance) {
  // Overall system health
  app.get('/health', {
    schema: {
      description: 'Get overall system health status',
      tags: ['Health'],
      summary: 'System health check',
      response: {
        200: z.object({
          status: z.enum(['healthy', 'degraded', 'unhealthy']),
          timestamp: z.number(),
          uptime: z.number(),
          version: z.string(),
          summary: z.object({
            providers: z.number(),
            healthyProviders: z.number(),
            cacheHitRate: z.number(),
            averageResponseTime: z.number()
          })
        }),
        503: z.object({
          status: z.string(),
          timestamp: z.number(),
          error: z.string(),
          uptime: z.number()
        })
      }
    }
  }, async () => {
    try {
      const healthResponse = await providerHealthCheck.performAllChecks();
      const statusCode = healthResponse.status === 'healthy' ? 200 : 503;

      return {
        status: healthResponse.status,
        timestamp: healthResponse.timestamp,
        uptime: healthResponse.uptime,
        version: healthResponse.version,
        summary: healthResponse.summary
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
        uptime: process.uptime()
      };
    }
  });

  // Individual provider health
  app.get('/health/providers', async () => {
    try {
      const healthResults = await providerFactory.healthCheckAll();

      return {
        timestamp: Date.now(),
        providers: healthResults
      };
    } catch (error) {
      return {
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
        providers: {}
      };
    }
  });

  // Specific provider health
  app.get('/health/providers/:provider', async (request) => {
    const { provider } = request.params as { provider: string };

    try {
      const healthResult = await providerHealthCheck.performCheck('providers');
      const providers = healthResult?.details as Record<string, boolean> || {};

      return {
        timestamp: Date.now(),
        provider,
        healthy: providers[provider] || false
      };
    } catch (error) {
      return {
        timestamp: Date.now(),
        provider,
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Cache health and performance
  app.get('/health/cache', async () => {
    try {
      const cacheHealth = await providerHealthCheck.performCheck('cache');

      return {
        timestamp: Date.now(),
        status: cacheHealth?.status || 'unknown',
        message: cacheHealth?.message || 'Cache monitoring not available',
        details: cacheHealth?.details || {}
      };
    } catch (error) {
      return {
        timestamp: Date.now(),
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // System resources health
  app.get('/health/system', async () => {
    try {
      const systemHealth = await providerHealthCheck.performCheck('system-resources');

      return {
        timestamp: Date.now(),
        status: systemHealth?.status || 'unknown',
        message: systemHealth?.message || 'System monitoring not available',
        details: systemHealth?.details || {}
      };
    } catch (error) {
      return {
        timestamp: Date.now(),
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Prometheus-style metrics endpoint
  app.get('/metrics', async () => {
    try {
      const metricsCollector = getMetricsCollector();
      const prometheusFormat = await metricsCollector.exportPrometheusFormat();

      return {
        contentType: 'text/plain; version=0.0.4; charset=utf-8',
        body: prometheusFormat
      };
    } catch (error) {
      return {
        contentType: 'text/plain; charset=utf-8',
        body: `# Error generating metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  });

  // Dashboard data endpoint
  app.get('/health/dashboard', async (request) => {
    const query = request.query as { timeRange?: string };
    const timeRange = (query.timeRange as DashboardTimeRange) || DashboardTimeRange.LAST_1_HOUR;

    try {
      const dashboardProvider = getDashboardProvider();
      const dashboardData = await dashboardProvider.getDashboardData(timeRange);

      return dashboardData;
    } catch (error) {
      return {
        timestamp: Date.now(),
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error',
        widgets: {},
        summary: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          uptime: 0,
          healthScore: 0,
          activeProviders: 0,
          cacheHitRate: 0,
          systemLoad: { memory: 0, cpu: 0 }
        },
        alerts: [],
        trends: []
      };
    }
  });

  // Dashboard widget endpoint
  app.get('/health/dashboard/:widgetId', async (request) => {
    const { widgetId } = request.params as { widgetId: string };

    try {
      const dashboardProvider = getDashboardProvider();
      const widget = await dashboardProvider.getWidgetData(widgetId);

      if (!widget) {
        return { error: 'Widget not found' };
      }

      return widget;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Health service status
  app.get('/health/service', async () => {
    try {
      const healthService = getHealthService();
      const status = healthService.getStatus();

      return {
        timestamp: Date.now(),
        ...status
      };
    } catch (error) {
      return {
        timestamp: Date.now(),
        running: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Readiness probe
  app.get('/health/ready', async () => {
    try {
      // Check if all critical services are ready
      const healthResponse = await providerHealthCheck.performAllChecks();

      // Consider system ready if overall status is healthy or degraded
      const ready = healthResponse.status === 'healthy' || healthResponse.status === 'degraded';

      return {
        ready,
        timestamp: Date.now(),
        status: healthResponse.status
      };
    } catch (error) {
      return {
        ready: false,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Liveness probe
  app.get('/health/live', async () => {
    // Simple liveness check - if the service is responding, it's alive
    return {
      alive: true,
      timestamp: Date.now(),
      uptime: process.uptime()
    };
  });
}
