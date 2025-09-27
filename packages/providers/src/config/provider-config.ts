import { LogLevel } from '../utils/logger.js';
import { ConfigurationError } from '../errors/provider-errors.js';

export interface ProviderTimeouts {
  readonly requestTimeout: number;
  readonly connectionTimeout: number;
}

export interface ProviderRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}

export interface ProviderCircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  monitoringPeriodMs: number;
}

export interface ProviderRateLimitConfig {
  requestsPerSecond: number;
  burstLimit: number;
  windowMs: number;
}

export interface ProviderConfig {
  timeouts: ProviderTimeouts;
  retry: ProviderRetryConfig;
  circuitBreaker: ProviderCircuitBreakerConfig;
  rateLimit: ProviderRateLimitConfig;
  logLevel: LogLevel;
  enabled: boolean;
}

export interface ProviderConfigs {
  veeqo: ProviderConfig;
  easypost: ProviderConfig;
  shippo: ProviderConfig;
  // Add other providers as needed
}

export class ProviderConfigManager {
  private static instance: ProviderConfigManager;
  private configs: ProviderConfigs;
  private environment: string;

  private constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.configs = this.loadConfigs();
    this.validateConfigs();
  }

  static getInstance(): ProviderConfigManager {
    if (!ProviderConfigManager.instance) {
      ProviderConfigManager.instance = new ProviderConfigManager();
    }
    return ProviderConfigManager.instance;
  }

  private loadConfigs(): ProviderConfigs {
    const defaultTimeouts: ProviderTimeouts = {
      requestTimeout: parseInt(process.env.PROVIDER_REQUEST_TIMEOUT || '30000'),
      connectionTimeout: parseInt(process.env.PROVIDER_CONNECTION_TIMEOUT || '10000')
    };

    const defaultRetry: ProviderRetryConfig = {
      maxRetries: parseInt(process.env.PROVIDER_MAX_RETRIES || '3'),
      baseDelayMs: parseInt(process.env.PROVIDER_BASE_DELAY_MS || '1000'),
      maxDelayMs: parseInt(process.env.PROVIDER_MAX_DELAY_MS || '30000'),
      backoffFactor: parseFloat(process.env.PROVIDER_BACKOFF_FACTOR || '2')
    };

    const defaultCircuitBreaker: ProviderCircuitBreakerConfig = {
      failureThreshold: parseInt(process.env.PROVIDER_FAILURE_THRESHOLD || '5'),
      recoveryTimeoutMs: parseInt(process.env.PROVIDER_RECOVERY_TIMEOUT_MS || '60000'),
      monitoringPeriodMs: parseInt(process.env.PROVIDER_MONITORING_PERIOD_MS || '300000')
    };

    const defaultRateLimit: ProviderRateLimitConfig = {
      requestsPerSecond: parseInt(process.env.PROVIDER_RPS_LIMIT || '10'),
      burstLimit: parseInt(process.env.PROVIDER_BURST_LIMIT || '20'),
      windowMs: parseInt(process.env.PROVIDER_WINDOW_MS || '60000')
    };

    const defaultLogLevel = this.parseLogLevel(process.env.PROVIDER_LOG_LEVEL || 'info');

    const baseConfig: ProviderConfig = {
      timeouts: defaultTimeouts,
      retry: defaultRetry,
      circuitBreaker: defaultCircuitBreaker,
      rateLimit: defaultRateLimit,
      logLevel: defaultLogLevel,
      enabled: true
    };

    return {
      veeqo: {
        ...baseConfig,
        timeouts: {
          ...defaultTimeouts,
          requestTimeout: parseInt(process.env.VEEQO_REQUEST_TIMEOUT || defaultTimeouts.requestTimeout.toString())
        },
        enabled: Boolean(process.env.VEEQO_API_KEY)
      },
      easypost: {
        ...baseConfig,
        timeouts: {
          ...defaultTimeouts,
          requestTimeout: parseInt(process.env.EASYPOST_REQUEST_TIMEOUT || defaultTimeouts.requestTimeout.toString())
        },
        enabled: Boolean(process.env.EASYPOST_API_KEY)
      },
      shippo: {
        ...baseConfig,
        timeouts: {
          ...defaultTimeouts,
          requestTimeout: parseInt(process.env.SHIPPO_REQUEST_TIMEOUT || defaultTimeouts.requestTimeout.toString())
        },
        enabled: Boolean(process.env.SHIPPO_API_KEY)
      }
    };
  }

  private parseLogLevel(level: string): LogLevel {
    const normalizedLevel = level.toLowerCase().trim();

    switch (normalizedLevel) {
      case 'error':
      case '0':
        return LogLevel.ERROR;
      case 'warn':
      case 'warning':
      case '1':
        return LogLevel.WARN;
      case 'info':
      case '2':
        return LogLevel.INFO;
      case 'debug':
      case '3':
        return LogLevel.DEBUG;
      default:
        console.warn(`Unknown log level: ${level}, defaulting to INFO`);
        return LogLevel.INFO;
    }
  }

  private validateConfigs(): void {
    const errors: string[] = [];

    // Validate timeouts
    Object.entries(this.configs).forEach(([provider, config]) => {
      if (config.timeouts.requestTimeout <= 0) {
        errors.push(`${provider}: requestTimeout must be positive`);
      }
      if (config.timeouts.connectionTimeout <= 0) {
        errors.push(`${provider}: connectionTimeout must be positive`);
      }
      if (config.timeouts.requestTimeout < config.timeouts.connectionTimeout) {
        errors.push(`${provider}: requestTimeout should be >= connectionTimeout`);
      }

      // Validate retry config
      if (config.retry.maxRetries < 0) {
        errors.push(`${provider}: maxRetries must be non-negative`);
      }
      if (config.retry.baseDelayMs <= 0) {
        errors.push(`${provider}: baseDelayMs must be positive`);
      }
      if (config.retry.maxDelayMs < config.retry.baseDelayMs) {
        errors.push(`${provider}: maxDelayMs should be >= baseDelayMs`);
      }
      if (config.retry.backoffFactor <= 1) {
        errors.push(`${provider}: backoffFactor should be > 1`);
      }

      // Validate circuit breaker
      if (config.circuitBreaker.failureThreshold <= 0) {
        errors.push(`${provider}: failureThreshold must be positive`);
      }
      if (config.circuitBreaker.recoveryTimeoutMs <= 0) {
        errors.push(`${provider}: recoveryTimeoutMs must be positive`);
      }

      // Validate rate limiting
      if (config.rateLimit.requestsPerSecond <= 0) {
        errors.push(`${provider}: requestsPerSecond must be positive`);
      }
      if (config.rateLimit.burstLimit < config.rateLimit.requestsPerSecond) {
        errors.push(`${provider}: burstLimit should be >= requestsPerSecond`);
      }
    });

    if (errors.length > 0) {
      throw new ConfigurationError(
        `Invalid provider configuration:\n${errors.join('\n')}`,
        'config-manager'
      );
    }
  }

  getConfig(provider: keyof ProviderConfigs): ProviderConfig {
    return { ...this.configs[provider] };
  }

  getAllConfigs(): ProviderConfigs {
    return JSON.parse(JSON.stringify(this.configs));
  }

  updateConfig(provider: keyof ProviderConfigs, updates: Partial<ProviderConfig>): void {
    this.configs[provider] = { ...this.configs[provider], ...updates };
    this.validateConfigs();
  }

  getEnabledProviders(): string[] {
    return Object.entries(this.configs)
      .filter(([_, config]) => config.enabled)
      .map(([provider, _]) => provider);
  }

  isProviderEnabled(provider: keyof ProviderConfigs): boolean {
    return this.configs[provider].enabled;
  }

  getEnvironment(): string {
    return this.environment;
  }

  // Environment-specific configurations
  isProduction(): boolean {
    return this.environment === 'production';
  }

  isDevelopment(): boolean {
    return this.environment === 'development';
  }

  isTest(): boolean {
    return this.environment === 'test';
  }

  // Get environment variables with validation
  getRequiredEnvVar(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new ConfigurationError(
        `Required environment variable ${name} is not set`,
        'config-manager'
      );
    }
    return value;
  }

  getEnvVar(name: string, defaultValue?: string): string {
    return process.env[name] || defaultValue || '';
  }

  getEnvVarAsNumber(name: string, defaultValue?: number): number {
    const value = process.env[name];
    if (!value) {
      if (defaultValue === undefined) {
        throw new ConfigurationError(
          `Required environment variable ${name} is not set`,
          'config-manager'
        );
      }
      return defaultValue;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new ConfigurationError(
        `Environment variable ${name} must be a valid number`,
        'config-manager'
      );
    }

    return parsed;
  }

  getEnvVarAsBoolean(name: string, defaultValue: boolean = false): boolean {
    const value = process.env[name];
    if (!value) {
      return defaultValue;
    }

    const normalized = value.toLowerCase().trim();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
}

// Export singleton instance
export const providerConfig = ProviderConfigManager.getInstance();

// Convenience functions
export function getProviderConfig(provider: keyof ProviderConfigs): ProviderConfig {
  return providerConfig.getConfig(provider);
}

export function isProviderEnabled(provider: keyof ProviderConfigs): boolean {
  return providerConfig.isProviderEnabled(provider);
}

export function getEnabledProviders(): string[] {
  return providerConfig.getEnabledProviders();
}