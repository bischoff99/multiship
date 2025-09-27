import { getMonitoringConfig } from "../config/monitoring-config.js";
import { providerFactory } from "../factory.js";
import { defaultLogger as logger } from "../utils/logger.js";

/**
 * Health status enumeration
 */
export enum HealthStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNHEALTHY = "unhealthy",
  UNKNOWN = "unknown",
}

/**
 * Individual health check result
 */
export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  timestamp: number;
  responseTime?: number;
  message?: string;
  details?: Record<string, any>;
  error?: Error;
}

/**
 * Overall health check response
 */
export interface HealthCheckResponse {
  status: HealthStatus;
  timestamp: number;
  uptime: number;
  version: string;
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  };
}

/**
 * Provider health check implementation
 */
export class ProviderHealthCheck {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Check health of all providers
   */
  async checkProviders(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const healthResults = await providerFactory.healthCheckAll();
      const responseTime = Date.now() - startTime;

      const allHealthy = Object.values(healthResults).every(
        (healthy) => healthy
      );
      const hasFailures = Object.values(healthResults).some(
        (healthy) => !healthy
      );

      let status: HealthStatus;
      let message: string;

      if (allHealthy) {
        status = HealthStatus.HEALTHY;
        message = "All providers are healthy";
      } else if (hasFailures) {
        status = HealthStatus.UNHEALTHY;
        message = `Some providers are unhealthy: ${Object.entries(healthResults)
          .filter(([, healthy]) => !healthy)
          .map(([provider]) => provider)
          .join(", ")}`;
      } else {
        status = HealthStatus.UNKNOWN;
        message = "Unable to determine provider health status";
      }

      return {
        name: "providers",
        status,
        timestamp: Date.now(),
        responseTime,
        message,
        details: healthResults,
      };
    } catch (error) {
      logger.error("Provider health check failed", {}, error as Error);

      return {
        name: "providers",
        status: HealthStatus.UNHEALTHY,
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
        message: "Provider health check failed",
        error: error as Error,
      };
    }
  }

  /**
   * Check circuit breaker states
   */
  async checkCircuitBreakers(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // This would need to be implemented based on how circuit breakers are managed
      // For now, we'll return a placeholder
      const responseTime = Date.now() - startTime;

      return {
        name: "circuit-breakers",
        status: HealthStatus.HEALTHY,
        timestamp: Date.now(),
        responseTime,
        message: "Circuit breaker monitoring not yet implemented",
        details: {
          note: "Circuit breaker integration pending",
        },
      };
    } catch (error) {
      logger.error("Circuit breaker health check failed", {}, error as Error);

      return {
        name: "circuit-breakers",
        status: HealthStatus.UNHEALTHY,
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
        message: "Circuit breaker health check failed",
        error: error as Error,
      };
    }
  }

  /**
   * Check cache performance and connectivity
   */
  async checkCache(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // This would need to be implemented based on the cache implementation
      // For now, we'll return a placeholder
      const responseTime = Date.now() - startTime;

      return {
        name: "cache",
        status: HealthStatus.HEALTHY,
        timestamp: Date.now(),
        responseTime,
        message: "Cache monitoring not yet implemented",
        details: {
          note: "Cache integration pending",
        },
      };
    } catch (error) {
      logger.error("Cache health check failed", {}, error as Error);

      return {
        name: "cache",
        status: HealthStatus.UNHEALTHY,
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
        message: "Cache health check failed",
        error: error as Error,
      };
    }
  }

  /**
   * Check database connectivity
   */
  async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const config = getMonitoringConfig();

    if (!config.database.enabled) {
      return {
        name: "database",
        status: HealthStatus.UNKNOWN,
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
        message: "Database checks disabled",
        details: { enabled: false },
      };
    }

    try {
      // This would need to be implemented based on the database connection
      // For now, we'll return a placeholder
      const responseTime = Date.now() - startTime;

      return {
        name: "database",
        status: HealthStatus.HEALTHY,
        timestamp: Date.now(),
        responseTime,
        message: "Database monitoring not yet implemented",
        details: {
          note: "Database integration pending",
          timeout: config.database.timeout,
        },
      };
    } catch (error) {
      logger.error("Database health check failed", {}, error as Error);

      return {
        name: "database",
        status: HealthStatus.UNHEALTHY,
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
        message: "Database health check failed",
        error: error as Error,
      };
    }
  }

  /**
   * Check external service dependencies
   */
  async checkExternalServices(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const checks: Promise<any>[] = [
        // Add specific external service checks here
        // e.g., EasyPost API, Shippo API, Veeqo API connectivity
      ];

      const results = await Promise.allSettled(checks);
      const responseTime = Date.now() - startTime;

      const failedChecks = results.filter(
        (result) => result.status === "rejected"
      );
      const successfulChecks = results.filter(
        (result) => result.status === "fulfilled"
      );

      let status: HealthStatus;
      let message: string;

      if (failedChecks.length === 0) {
        status = HealthStatus.HEALTHY;
        message = `All ${successfulChecks.length} external services are accessible`;
      } else if (successfulChecks.length > 0) {
        status = HealthStatus.DEGRADED;
        message = `${failedChecks.length} of ${results.length} external services failed`;
      } else {
        status = HealthStatus.UNHEALTHY;
        message = "All external services are inaccessible";
      }

      return {
        name: "external-services",
        status,
        timestamp: Date.now(),
        responseTime,
        message,
        details: {
          total: results.length,
          successful: successfulChecks.length,
          failed: failedChecks.length,
          failures: failedChecks.map(
            (f) =>
              (f as PromiseRejectedResult).reason?.message || "Unknown error"
          ),
        },
      };
    } catch (error) {
      logger.error("External services health check failed", {}, error as Error);

      return {
        name: "external-services",
        status: HealthStatus.UNHEALTHY,
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
        message: "External services health check failed",
        error: error as Error,
      };
    }
  }

  /**
   * Check system resource usage
   */
  async checkSystemResources(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const config = getMonitoringConfig();

    if (!config.resources.enabled) {
      return {
        name: "system-resources",
        status: HealthStatus.UNKNOWN,
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
        message: "System resource monitoring disabled",
        details: { enabled: false },
      };
    }

    try {
      const responseTime = Date.now() - startTime;

      // Basic resource information (would need actual implementation)
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      const memoryUsagePercent =
        (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      let status: HealthStatus = HealthStatus.HEALTHY;
      let message = "System resources are within normal ranges";

      if (memoryUsagePercent > config.resources.memory.criticalThreshold) {
        status = HealthStatus.UNHEALTHY;
        message = `Memory usage is critical: ${memoryUsagePercent.toFixed(1)}%`;
      } else if (
        memoryUsagePercent > config.resources.memory.warningThreshold
      ) {
        status = HealthStatus.DEGRADED;
        message = `Memory usage is high: ${memoryUsagePercent.toFixed(1)}%`;
      }

      return {
        name: "system-resources",
        status,
        timestamp: Date.now(),
        responseTime,
        message,
        details: {
          memory: {
            used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            usagePercent: Math.round(memoryUsagePercent * 100) / 100,
          },
          uptime: Math.round(uptime),
          cpu: {
            note: "CPU monitoring not yet implemented",
          },
        },
      };
    } catch (error) {
      logger.error("System resources health check failed", {}, error as Error);

      return {
        name: "system-resources",
        status: HealthStatus.UNHEALTHY,
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
        message: "System resources health check failed",
        error: error as Error,
      };
    }
  }

  /**
   * Perform all health checks
   */
  async performAllChecks(): Promise<HealthCheckResponse> {
    const config = getMonitoringConfig();

    if (!config.healthCheck.enabled) {
      return {
        status: HealthStatus.UNKNOWN,
        timestamp: Date.now(),
        uptime: Date.now() - this.startTime,
        version: process.env.npm_package_version || "0.0.1",
        checks: [],
        summary: {
          total: 0,
          healthy: 0,
          degraded: 0,
          unhealthy: 0,
          unknown: 1,
        },
      };
    }

    const checkPromises = [
      this.checkProviders(),
      this.checkCircuitBreakers(),
      this.checkCache(),
      this.checkDatabase(),
      this.checkExternalServices(),
      this.checkSystemResources(),
    ];

    const results = await Promise.all(checkPromises);

    // Determine overall status
    const unhealthy = results.filter(
      (r) => r.status === HealthStatus.UNHEALTHY
    ).length;
    const degraded = results.filter(
      (r) => r.status === HealthStatus.DEGRADED
    ).length;
    const healthy = results.filter(
      (r) => r.status === HealthStatus.HEALTHY
    ).length;
    const unknown = results.filter(
      (r) => r.status === HealthStatus.UNKNOWN
    ).length;

    let overallStatus: HealthStatus;
    if (unhealthy > 0) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (degraded > 0) {
      overallStatus = HealthStatus.DEGRADED;
    } else if (healthy > 0) {
      overallStatus = HealthStatus.HEALTHY;
    } else {
      overallStatus = HealthStatus.UNKNOWN;
    }

    return {
      status: overallStatus,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || "0.0.1",
      checks: results,
      summary: {
        total: results.length,
        healthy,
        degraded,
        unhealthy,
        unknown,
      },
    };
  }

  /**
   * Get individual health check by name
   */
  async performCheck(checkName: string): Promise<HealthCheckResult | null> {
    switch (checkName) {
      case "providers":
        return this.checkProviders();
      case "circuit-breakers":
        return this.checkCircuitBreakers();
      case "cache":
        return this.checkCache();
      case "database":
        return this.checkDatabase();
      case "external-services":
        return this.checkExternalServices();
      case "system-resources":
        return this.checkSystemResources();
      default:
        return null;
    }
  }
}

// Export singleton instance
export const providerHealthCheck = new ProviderHealthCheck();

/**
 * Convenience function to get overall health
 */
export async function getOverallHealth(): Promise<HealthCheckResponse> {
  return providerHealthCheck.performAllChecks();
}

/**
 * Convenience function to get specific health check
 */
export async function getHealthCheck(
  checkName: string
): Promise<HealthCheckResult | null> {
  return providerHealthCheck.performCheck(checkName);
}
