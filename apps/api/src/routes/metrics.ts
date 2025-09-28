import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MetricsCollector } from '@pkg/providers';
import { checkDatabaseHealth, getConnectionMetrics } from '@pkg/db';

// Response schemas
const MetricsResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    providerMetrics: z.record(z.string(), z.any()),
    systemMetrics: z.any(),
    cacheMetrics: z.any(),
    databaseMetrics: z.any(),
    timestamp: z.string()
  }),
  timestamp: z.string()
});

const HealthResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    checks: z.object({
      database: z.boolean(),
      providers: z.record(z.string(), z.boolean()),
      cache: z.boolean()
    }),
    metrics: z.any(),
    timestamp: z.string()
  }),
  timestamp: z.string()
});

export default async function metrics(app: FastifyInstance, opts: any) {
  // Metrics endpoint
  app.get(
    '/metrics',
    {
      schema: {
        description: 'Get system and provider metrics',
        tags: ['Metrics'],
        summary: 'System metrics',
        response: {
          200: MetricsResponseSchema
        }
      }
    },
    async (req, res) => {
      try {
        // Get provider metrics
        const metricsCollector = MetricsCollector.getInstance();
        const providerMetrics = metricsCollector.getMetricsSummary(300000); // 5 minutes
        
        // Get system metrics
        const systemMetrics = {
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
          timestamp: Date.now()
        };
        
        // Get database metrics
        const dbHealth = await checkDatabaseHealth();
        const dbMetrics = getConnectionMetrics();
        
        // Record system metrics
        metricsCollector.recordSystemMetrics({
          ...systemMetrics,
          cacheStats: {
            hits: 0, // Would be populated from cache stats
            misses: 0,
            size: 0,
            hitRate: 0
          }
        });
        
        return {
          success: true,
          data: {
            providerMetrics: providerMetrics.providerMetrics,
            systemMetrics,
            cacheMetrics: providerMetrics.cacheMetrics,
            databaseMetrics: {
              health: dbHealth,
              connections: dbMetrics
            },
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        throw error;
      }
    }
  );

  // Health check endpoint with detailed metrics
  app.get(
    '/health/detailed',
    {
      schema: {
        description: 'Get detailed health status with metrics',
        tags: ['Health'],
        summary: 'Detailed health check',
        response: {
          200: HealthResponseSchema
        }
      }
    },
    async (req, res) => {
      try {
        // Check database health
        const dbHealth = await checkDatabaseHealth();
        
        // Check provider health (would need to be implemented)
        const providerHealth = {
          easypost: true,
          shippo: true,
          veeqo: true
        };
        
        // Determine overall status
        const allChecksPass = dbHealth.isHealthy && 
          Object.values(providerHealth).every(status => status);
        
        const status = allChecksPass ? 'healthy' : 
          (dbHealth.isHealthy ? 'degraded' : 'unhealthy');
        
        // Get current metrics
        const metricsCollector = MetricsCollector.getInstance();
        const metrics = metricsCollector.getMetricsSummary(60000); // 1 minute
        
        return {
          success: true,
          data: {
            status,
            checks: {
              database: dbHealth.isHealthy,
              providers: providerHealth,
              cache: true // Would check cache health
            },
            metrics,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        throw error;
      }
    }
  );

  // Prometheus metrics endpoint
  app.get(
    '/metrics/prometheus',
    {
      schema: {
        description: 'Get metrics in Prometheus format',
        tags: ['Metrics'],
        summary: 'Prometheus metrics'
      }
    },
    async (req, res) => {
      try {
        const metricsCollector = MetricsCollector.getInstance();
        const prometheusMetrics = metricsCollector.exportPrometheusMetrics();
        
        res.type('text/plain');
        return prometheusMetrics;
      } catch (error) {
        throw error;
      }
    }
  );

  // Metrics reset endpoint (for testing)
  app.post(
    '/metrics/reset',
    {
      schema: {
        description: 'Reset metrics (testing only)',
        tags: ['Metrics'],
        summary: 'Reset metrics'
      }
    },
    async (req, res) => {
      try {
        if (process.env.NODE_ENV === 'production') {
          return res.code(403).send({
            error: 'Forbidden',
            message: 'Metrics reset not allowed in production'
          });
        }
        
        const metricsCollector = MetricsCollector.getInstance();
        metricsCollector.clearOldMetrics(0); // Clear all metrics
        
        return {
          success: true,
          message: 'Metrics reset successfully',
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        throw error;
      }
    }
  );
}