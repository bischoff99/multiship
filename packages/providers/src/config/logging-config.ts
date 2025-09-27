import { z } from 'zod';
import { LogContext } from '../utils/logger.js';

export const LogLevel = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
export type LogLevel = z.infer<typeof LogLevel>;

export const LogFormat = z.enum(['json', 'pretty', 'simple']);
export type LogFormat = z.infer<typeof LogFormat>;

export const LoggingConfig = z.object({
  // Log level configuration
  level: LogLevel.default('info'),

  // Output configuration
  format: LogFormat.default('json'),
  timestamp: z.boolean().default(true),
  colorize: z.boolean().default(false),

  // Destination configuration
  destinations: z.object({
    console: z.object({
      enabled: z.boolean().default(true),
      level: LogLevel.default('info'),
      format: LogFormat.default('json'),
    }),
    file: z.object({
      enabled: z.boolean().default(false),
      path: z.string().optional(),
      level: LogLevel.default('info'),
      format: LogFormat.default('json'),
      maxSize: z.string().default('10m'), // 10 megabytes
      maxFiles: z.number().default(5),
    }),
  }),

  // Structured logging options
  structured: z.object({
    includeStackTrace: z.boolean().default(true),
    includeMetadata: z.boolean().default(true),
    includeCorrelationId: z.boolean().default(true),
    includeProvider: z.boolean().default(true),
    includeOperation: z.boolean().default(true),
    includeTimestamp: z.boolean().default(true),
  }),

  // Provider-specific logging
  providers: z.object({
    enableProviderLogs: z.boolean().default(true),
    logProviderRequests: z.boolean().default(false), // Set to false for security
    logProviderResponses: z.boolean().default(false), // Set to false for security
    logSensitiveData: z.boolean().default(false), // Never enable in production
    maskSensitiveFields: z.array(z.string()).default([
      'apiKey', 'password', 'token', 'secret', 'authorization'
    ]),
  }),

  // Performance logging
  performance: z.object({
    logSlowOperations: z.boolean().default(true),
    slowOperationThreshold: z.number().default(1000), // 1 second
    logCacheOperations: z.boolean().default(false),
    logCircuitBreakerEvents: z.boolean().default(true),
  }),

  // Sampling configuration (for high-volume logging)
  sampling: z.object({
    enabled: z.boolean().default(false),
    rate: z.number().min(0).max(1).default(0.1), // 10% sampling
    excludeHealthChecks: z.boolean().default(true),
    excludeCacheHits: z.boolean().default(true),
  }),
});

export type LoggingConfig = z.infer<typeof LoggingConfig>;

// Default configuration
export const defaultLoggingConfig: LoggingConfig = {
  level: 'info',
  format: 'json',
  timestamp: true,
  colorize: false,
  destinations: {
    console: {
      enabled: true,
      level: 'info',
      format: 'json',
    },
    file: {
      enabled: false,
      level: 'info',
      format: 'json',
      maxSize: '10m',
      maxFiles: 5,
    },
  },
  structured: {
    includeStackTrace: true,
    includeMetadata: true,
    includeCorrelationId: true,
    includeProvider: true,
    includeOperation: true,
    includeTimestamp: true,
  },
  providers: {
    enableProviderLogs: true,
    logProviderRequests: false,
    logProviderResponses: false,
    logSensitiveData: false,
    maskSensitiveFields: [
      'apiKey', 'password', 'token', 'secret', 'authorization'
    ],
  },
  performance: {
    logSlowOperations: true,
    slowOperationThreshold: 1000,
    logCacheOperations: false,
    logCircuitBreakerEvents: true,
  },
  sampling: {
    enabled: false,
    rate: 0.1,
    excludeHealthChecks: true,
    excludeCacheHits: true,
  },
};

// Configuration instance
let loggingConfig: LoggingConfig = defaultLoggingConfig;

/**
 * Get the current logging configuration
 */
export function getLoggingConfig(): LoggingConfig {
  return loggingConfig;
}

/**
 * Update the logging configuration
 */
export function updateLoggingConfig(newConfig: Partial<LoggingConfig>): void {
  loggingConfig = { ...loggingConfig, ...newConfig };
}

/**
 * Reset logging configuration to defaults
 */
export function resetLoggingConfig(): void {
  loggingConfig = defaultLoggingConfig;
}

/**
 * Load logging configuration from environment variables
 */
export function loadLoggingConfigFromEnv(): LoggingConfig {
  const config: LoggingConfig = {
    level: (process.env.LOG_LEVEL as LogLevel) || 'info',
    format: (process.env.LOG_FORMAT as LogFormat) || 'json',
    timestamp: process.env.LOG_TIMESTAMP !== 'false',
    colorize: process.env.LOG_COLORIZE === 'true',
    destinations: {
      console: {
        enabled: process.env.LOG_CONSOLE_ENABLED !== 'false',
        level: (process.env.LOG_CONSOLE_LEVEL as LogLevel) || 'info',
        format: (process.env.LOG_CONSOLE_FORMAT as LogFormat) || 'json',
      },
      file: {
        enabled: process.env.LOG_FILE_ENABLED === 'true',
        path: process.env.LOG_FILE_PATH,
        level: (process.env.LOG_FILE_LEVEL as LogLevel) || 'info',
        format: (process.env.LOG_FILE_FORMAT as LogFormat) || 'json',
        maxSize: process.env.LOG_FILE_MAX_SIZE || '10m',
        maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '5'),
      },
    },
    structured: {
      includeStackTrace: process.env.LOG_INCLUDE_STACK_TRACE !== 'false',
      includeMetadata: process.env.LOG_INCLUDE_METADATA !== 'false',
      includeCorrelationId: process.env.LOG_INCLUDE_CORRELATION_ID !== 'false',
      includeProvider: process.env.LOG_INCLUDE_PROVIDER !== 'false',
      includeOperation: process.env.LOG_INCLUDE_OPERATION !== 'false',
      includeTimestamp: process.env.LOG_INCLUDE_TIMESTAMP !== 'false',
    },
    providers: {
      enableProviderLogs: process.env.LOG_PROVIDER_LOGS !== 'false',
      logProviderRequests: process.env.LOG_PROVIDER_REQUESTS === 'true',
      logProviderResponses: process.env.LOG_PROVIDER_RESPONSES === 'true',
      logSensitiveData: process.env.LOG_SENSITIVE_DATA === 'true',
      maskSensitiveFields: process.env.LOG_MASK_FIELDS
        ? process.env.LOG_MASK_FIELDS.split(',')
        : ['apiKey', 'password', 'token', 'secret', 'authorization'],
    },
    performance: {
      logSlowOperations: process.env.LOG_SLOW_OPERATIONS !== 'false',
      slowOperationThreshold: parseInt(process.env.LOG_SLOW_THRESHOLD || '1000'),
      logCacheOperations: process.env.LOG_CACHE_OPERATIONS === 'true',
      logCircuitBreakerEvents: process.env.LOG_CIRCUIT_BREAKER_EVENTS !== 'false',
    },
    sampling: {
      enabled: process.env.LOG_SAMPLING_ENABLED === 'true',
      rate: parseFloat(process.env.LOG_SAMPLING_RATE || '0.1'),
      excludeHealthChecks: process.env.LOG_SAMPLING_EXCLUDE_HEALTH !== 'false',
      excludeCacheHits: process.env.LOG_SAMPLING_EXCLUDE_CACHE !== 'false',
    },
  };

  // Validate the configuration
  const validatedConfig = LoggingConfig.parse(config);
  loggingConfig = validatedConfig;
  return validatedConfig;
}

/**
 * Utility functions for logging configuration
 */
export const LoggingConfigUtils = {
  /**
   * Check if a log level should be logged
   */
  shouldLog(level: LogLevel, config: LoggingConfig = loggingConfig): boolean {
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    const configLevelIndex = levels.indexOf(config.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= configLevelIndex;
  },

  /**
   * Check if sampling should be applied
   */
  shouldSample(context?: LogContext, config: LoggingConfig = loggingConfig): boolean {
    if (!config.sampling.enabled) {
      return true;
    }

    if (context) {
      // Don't sample health checks if configured
      if (config.sampling.excludeHealthChecks && context.operation === 'healthCheck') {
        return false;
      }

      // Don't sample cache hits if configured
      if (config.sampling.excludeCacheHits && context.operation?.includes('cache')) {
        return false;
      }
    }

    return Math.random() < config.sampling.rate;
  },

  /**
   * Check if operation is slow based on threshold
   */
  isSlowOperation(duration: number, config: LoggingConfig = loggingConfig): boolean {
    return duration > config.performance.slowOperationThreshold;
  },

  /**
   * Mask sensitive data in log messages
   */
  maskSensitiveData(data: any, config: LoggingConfig = loggingConfig): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const masked = { ...data };
    const sensitiveFields = config.providers.maskSensitiveFields;

    for (const key of sensitiveFields) {
      if (key in masked) {
        masked[key] = '***MASKED***';
      }
    }

    return masked;
  },

  /**
   * Create a structured log entry
   */
  createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    metadata?: Record<string, any>
  ): any {
    const entry: any = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (loggingConfig.structured.includeCorrelationId && context?.correlationId) {
      entry.correlationId = context.correlationId;
    }

    if (loggingConfig.structured.includeProvider && context?.provider) {
      entry.provider = context.provider;
    }

    if (loggingConfig.structured.includeOperation && context?.operation) {
      entry.operation = context.operation;
    }

    if (loggingConfig.structured.includeMetadata && metadata) {
      entry.metadata = metadata;
    }

    if (loggingConfig.structured.includeStackTrace && context?.error) {
      entry.stack = context.error.stack;
    }

    return entry;
  }
};

// Load configuration from environment on module load
if (typeof process !== 'undefined' && process.env) {
  try {
    loadLoggingConfigFromEnv();
  } catch (error) {
    console.warn('Failed to load logging configuration from environment:', error);
  }
}