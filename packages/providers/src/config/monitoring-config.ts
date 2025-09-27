import { z } from 'zod';

export const MonitoringConfig = z.object({
  // Health check configuration
  healthCheck: z.object({
    interval: z.number().default(30000), // 30 seconds
    timeout: z.number().default(5000), // 5 seconds
    retries: z.number().default(3),
    enabled: z.boolean().default(true),
  }),

  // Metrics configuration
  metrics: z.object({
    enabled: z.boolean().default(true),
    retention: z.object({
      hours: z.number().default(24), // Keep metrics for 24 hours
      maxEntries: z.number().default(10000), // Maximum number of metric entries
    }),

    // Performance thresholds
    thresholds: z.object({
      responseTime: z.object({
        warning: z.number().default(1000), // 1 second
        critical: z.number().default(5000), // 5 seconds
      }),
      errorRate: z.object({
        warning: z.number().default(0.05), // 5%
        critical: z.number().default(0.10), // 10%
      }),
      cacheHitRate: z.object({
        warning: z.number().default(0.80), // 80%
        critical: z.number().default(0.60), // 60%
      }),
      memoryUsage: z.object({
        warning: z.number().default(0.80), // 80%
        critical: z.number().default(0.90), // 90%
      }),
    }),
  }),

  // Alert configuration
  alerts: z.object({
    enabled: z.boolean().default(true),
    channels: z.array(z.enum(['console', 'webhook', 'email'])).default(['console']),

    // Webhook configuration
    webhook: z.object({
      url: z.string().optional(),
      headers: z.record(z.string()).optional(),
      timeout: z.number().default(5000),
    }),

    // Email configuration (if email alerts are enabled)
    email: z.object({
      smtp: z.object({
        host: z.string().optional(),
        port: z.number().default(587),
        secure: z.boolean().default(false),
        auth: z.object({
          user: z.string().optional(),
          pass: z.string().optional(),
        }),
      }),
      from: z.string().optional(),
      to: z.array(z.string()).default([]),
    }),

    // Alert rules
    rules: z.object({
      healthCheckFailure: z.object({
        enabled: z.boolean().default(true),
        threshold: z.number().default(1), // Alert if any provider fails
      }),
      highErrorRate: z.object({
        enabled: z.boolean().default(true),
        threshold: z.number().default(0.10), // Alert if error rate > 10%
        window: z.number().default(300000), // Check every 5 minutes
      }),
      circuitBreakerOpen: z.object({
        enabled: z.boolean().default(true),
        threshold: z.number().default(1), // Alert if any circuit breaker opens
      }),
      cachePerformance: z.object({
        enabled: z.boolean().default(true),
        hitRateThreshold: z.number().default(0.60), // Alert if hit rate < 60%
      }),
    }),
  }),

  // External monitoring integration
  external: z.object({
    prometheus: z.object({
      enabled: z.boolean().default(false),
      port: z.number().default(9090),
      path: z.string().default('/metrics'),
    }),

    datadog: z.object({
      enabled: z.boolean().default(false),
      apiKey: z.string().optional(),
      appKey: z.string().optional(),
    }),

    newrelic: z.object({
      enabled: z.boolean().default(false),
      licenseKey: z.string().optional(),
      appName: z.string().default('multiship-providers'),
    }),
  }),

  // Database connectivity checks
  database: z.object({
    enabled: z.boolean().default(true),
    timeout: z.number().default(3000),
    maxConnections: z.number().default(10),
  }),

  // Circuit breaker monitoring
  circuitBreaker: z.object({
    enabled: z.boolean().default(true),
    // Thresholds for different circuit breaker states
    failureThreshold: z.object({
      warning: z.number().default(3),
      critical: z.number().default(5),
    }),
    // Recovery timeout configuration
    recoveryTimeout: z.object({
      min: z.number().default(60000), // 1 minute
      max: z.number().default(300000), // 5 minutes
    }),
  }),

  // Resource monitoring
  resources: z.object({
    enabled: z.boolean().default(true),
    interval: z.number().default(60000), // 1 minute
    memory: z.object({
      enabled: z.boolean().default(true),
      warningThreshold: z.number().default(0.8), // 80%
      criticalThreshold: z.number().default(0.9), // 90%
    }),
    cpu: z.object({
      enabled: z.boolean().default(true),
      warningThreshold: z.number().default(0.7), // 70%
      criticalThreshold: z.number().default(0.9), // 90%
    }),
  }),
});

export type MonitoringConfig = z.infer<typeof MonitoringConfig>;

// Default configuration
export const defaultMonitoringConfig: MonitoringConfig = {
  healthCheck: {
    interval: 30000,
    timeout: 5000,
    retries: 3,
    enabled: true,
  },
  metrics: {
    enabled: true,
    retention: {
      hours: 24,
      maxEntries: 10000,
    },
    thresholds: {
      responseTime: {
        warning: 1000,
        critical: 5000,
      },
      errorRate: {
        warning: 0.05,
        critical: 0.10,
      },
      cacheHitRate: {
        warning: 0.80,
        critical: 0.60,
      },
      memoryUsage: {
        warning: 0.80,
        critical: 0.90,
      },
    },
  },
  alerts: {
    enabled: true,
    channels: ['console'],
    webhook: {
      timeout: 5000,
    },
    email: {
      smtp: {
        port: 587,
        secure: false,
        auth: {},
      },
      to: [],
    },
    rules: {
      healthCheckFailure: {
        enabled: true,
        threshold: 1,
      },
      highErrorRate: {
        enabled: true,
        threshold: 0.10,
        window: 300000,
      },
      circuitBreakerOpen: {
        enabled: true,
        threshold: 1,
      },
      cachePerformance: {
        enabled: true,
        hitRateThreshold: 0.60,
      },
    },
  },
  external: {
    prometheus: {
      enabled: false,
      port: 9090,
      path: '/metrics',
    },
    datadog: {
      enabled: false,
    },
    newrelic: {
      enabled: false,
      appName: 'multiship-providers',
    },
  },
  database: {
    enabled: true,
    timeout: 3000,
    maxConnections: 10,
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: {
      warning: 3,
      critical: 5,
    },
    recoveryTimeout: {
      min: 60000,
      max: 300000,
    },
  },
  resources: {
    enabled: true,
    interval: 60000,
    memory: {
      enabled: true,
      warningThreshold: 0.8,
      criticalThreshold: 0.9,
    },
    cpu: {
      enabled: true,
      warningThreshold: 0.7,
      criticalThreshold: 0.9,
    },
  },
};

// Configuration instance
let monitoringConfig: MonitoringConfig = defaultMonitoringConfig;

/**
 * Get the current monitoring configuration
 */
export function getMonitoringConfig(): MonitoringConfig {
  return monitoringConfig;
}

/**
 * Update the monitoring configuration
 */
export function updateMonitoringConfig(newConfig: Partial<MonitoringConfig>): void {
  monitoringConfig = { ...monitoringConfig, ...newConfig };
}

/**
 * Reset monitoring configuration to defaults
 */
export function resetMonitoringConfig(): void {
  monitoringConfig = defaultMonitoringConfig;
}

/**
 * Validate and load monitoring configuration from environment variables
 */
export function loadMonitoringConfigFromEnv(): MonitoringConfig {
  const config: MonitoringConfig = {
    healthCheck: {
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
      timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),
      retries: parseInt(process.env.HEALTH_CHECK_RETRIES || '3'),
      enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    },
    metrics: {
      enabled: process.env.METRICS_ENABLED !== 'false',
      retention: {
        hours: parseInt(process.env.METRICS_RETENTION_HOURS || '24'),
        maxEntries: parseInt(process.env.METRICS_MAX_ENTRIES || '10000'),
      },
      thresholds: {
        responseTime: {
          warning: parseInt(process.env.RESPONSE_TIME_WARNING || '1000'),
          critical: parseInt(process.env.RESPONSE_TIME_CRITICAL || '5000'),
        },
        errorRate: {
          warning: parseFloat(process.env.ERROR_RATE_WARNING || '0.05'),
          critical: parseFloat(process.env.ERROR_RATE_CRITICAL || '0.10'),
        },
        cacheHitRate: {
          warning: parseFloat(process.env.CACHE_HIT_RATE_WARNING || '0.80'),
          critical: parseFloat(process.env.CACHE_HIT_RATE_CRITICAL || '0.60'),
        },
        memoryUsage: {
          warning: parseFloat(process.env.MEMORY_USAGE_WARNING || '0.80'),
          critical: parseFloat(process.env.MEMORY_USAGE_CRITICAL || '0.90'),
        },
      },
    },
    alerts: {
      enabled: process.env.ALERTS_ENABLED !== 'false',
      channels: (process.env.ALERT_CHANNELS || 'console').split(',') as Array<'console' | 'webhook' | 'email'>,
      webhook: {
        url: process.env.WEBHOOK_URL,
        headers: process.env.WEBHOOK_HEADERS ? JSON.parse(process.env.WEBHOOK_HEADERS) : undefined,
        timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '5000'),
      },
      email: {
        smtp: {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        },
        from: process.env.SMTP_FROM,
        to: process.env.SMTP_TO ? process.env.SMTP_TO.split(',') : [],
      },
      rules: {
        healthCheckFailure: {
          enabled: process.env.HEALTH_CHECK_ALERTS !== 'false',
          threshold: parseInt(process.env.HEALTH_CHECK_THRESHOLD || '1'),
        },
        highErrorRate: {
          enabled: process.env.ERROR_RATE_ALERTS !== 'false',
          threshold: parseFloat(process.env.ERROR_RATE_THRESHOLD || '0.10'),
          window: parseInt(process.env.ERROR_RATE_WINDOW || '300000'),
        },
        circuitBreakerOpen: {
          enabled: process.env.CIRCUIT_BREAKER_ALERTS !== 'false',
          threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '1'),
        },
        cachePerformance: {
          enabled: process.env.CACHE_PERFORMANCE_ALERTS !== 'false',
          hitRateThreshold: parseFloat(process.env.CACHE_HIT_RATE_THRESHOLD || '0.60'),
        },
      },
    },
    external: {
      prometheus: {
        enabled: process.env.PROMETHEUS_ENABLED === 'true',
        port: parseInt(process.env.PROMETHEUS_PORT || '9090'),
        path: process.env.PROMETHEUS_PATH || '/metrics',
      },
      datadog: {
        enabled: process.env.DATADOG_ENABLED === 'true',
        apiKey: process.env.DATADOG_API_KEY,
        appKey: process.env.DATADOG_APP_KEY,
      },
      newrelic: {
        enabled: process.env.NEWRELIC_ENABLED === 'true',
        licenseKey: process.env.NEWRELIC_LICENSE_KEY,
        appName: process.env.NEWRELIC_APP_NAME || 'multiship-providers',
      },
    },
    database: {
      enabled: process.env.DATABASE_CHECKS !== 'false',
      timeout: parseInt(process.env.DATABASE_TIMEOUT || '3000'),
      maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '10'),
    },
    circuitBreaker: {
      enabled: process.env.CIRCUIT_BREAKER_MONITORING !== 'false',
      failureThreshold: {
        warning: parseInt(process.env.CIRCUIT_BREAKER_WARNING_THRESHOLD || '3'),
        critical: parseInt(process.env.CIRCUIT_BREAKER_CRITICAL_THRESHOLD || '5'),
      },
      recoveryTimeout: {
        min: parseInt(process.env.CIRCUIT_BREAKER_RECOVERY_MIN || '60000'),
        max: parseInt(process.env.CIRCUIT_BREAKER_RECOVERY_MAX || '300000'),
      },
    },
    resources: {
      enabled: process.env.RESOURCE_MONITORING !== 'false',
      interval: parseInt(process.env.RESOURCE_MONITORING_INTERVAL || '60000'),
      memory: {
        enabled: process.env.MEMORY_MONITORING !== 'false',
        warningThreshold: parseFloat(process.env.MEMORY_WARNING_THRESHOLD || '0.8'),
        criticalThreshold: parseFloat(process.env.MEMORY_CRITICAL_THRESHOLD || '0.9'),
      },
      cpu: {
        enabled: process.env.CPU_MONITORING !== 'false',
        warningThreshold: parseFloat(process.env.CPU_WARNING_THRESHOLD || '0.7'),
        criticalThreshold: parseFloat(process.env.CPU_CRITICAL_THRESHOLD || '0.9'),
      },
    },
  };

  // Validate the configuration
  const validatedConfig = MonitoringConfig.parse(config);
  monitoringConfig = validatedConfig;
  return validatedConfig;
}

// Load configuration from environment on module load
if (typeof process !== 'undefined' && process.env) {
  try {
    loadMonitoringConfigFromEnv();
  } catch (error) {
    console.warn('Failed to load monitoring configuration from environment:', error);
  }
}