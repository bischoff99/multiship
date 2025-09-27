import { EventEmitter } from 'events';
import { providerFactory } from '../factory.js';
import { getMonitoringConfig } from '../config/monitoring-config.js';
import { providerHealthCheck, HealthCheckResponse, HealthCheckResult, HealthStatus } from './health-check.js';
import { getMetricsCollector, getMetricsHelper } from './metrics.js';
import { defaultLogger as logger } from '../utils/logger.js';

/**
 * Health check schedule configuration
 */
export interface HealthCheckSchedule {
  name: string;
  interval: number; // in milliseconds
  enabled: boolean;
  timeout: number;
  checks: string[]; // names of health checks to run
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  name: string;
  enabled: boolean;
  conditions: AlertCondition[];
  channels: AlertChannel[];
  cooldown: number; // minimum time between alerts in milliseconds
}

/**
 * Alert condition
 */
export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'ne';
  threshold: number;
  duration?: number; // how long condition must be true (in milliseconds)
}

/**
 * Alert channel configuration
 */
export interface AlertChannel {
  type: 'console' | 'webhook' | 'email';
  config: Record<string, any>;
}

/**
 * Alert event
 */
export interface AlertEvent {
  id: string;
  name: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: number;
  data?: Record<string, any>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
}

/**
 * Health service status
 */
export interface HealthServiceStatus {
  running: boolean;
  lastCheck: number;
  nextCheck: number;
  activeSchedules: string[];
  activeAlerts: number;
  uptime: number;
}

/**
 * Centralized health check service
 */
export class HealthCheckService extends EventEmitter {
  private config = getMonitoringConfig();
  private running: boolean = false;
  private startTime: number = Date.now();
  private schedules: Map<string, NodeJS.Timeout> = new Map();
  private lastCheckTimes: Map<string, number> = new Map();
  private alertCooldowns: Map<string, number> = new Map();
  private activeAlerts: Map<string, AlertEvent> = new Map();
  private checkHistory: HealthCheckResponse[] = [];
  private maxHistorySize: number = 100;

  constructor() {
    super();
    this.setupEventHandlers();
  }

  /**
   * Start the health check service
   */
  start(): void {
    if (this.running) {
      logger.warn('Health check service is already running');
      return;
    }

    this.running = true;
    this.startTime = Date.now();

    logger.info('Starting health check service');

    // Start default schedules
    this.startDefaultSchedules();

    // Emit started event
    this.emit('started');
  }

  /**
   * Stop the health check service
   */
  stop(): void {
    if (!this.running) {
      logger.warn('Health check service is not running');
      return;
    }

    this.running = false;

    logger.info('Stopping health check service');

    // Clear all schedules
    for (const [name, timeout] of this.schedules.entries()) {
      clearTimeout(timeout);
      logger.debug(`Cleared schedule: ${name}`);
    }
    this.schedules.clear();

    // Emit stopped event
    this.emit('stopped');
  }

  /**
   * Get service status
   */
  getStatus(): HealthServiceStatus {
    return {
      running: this.running,
      lastCheck: Math.max(...Array.from(this.lastCheckTimes.values())),
      nextCheck: this.getNextScheduledCheck(),
      activeSchedules: Array.from(this.schedules.keys()),
      activeAlerts: this.activeAlerts.size,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Perform immediate health check
   */
  async performHealthCheck(checkNames?: string[]): Promise<HealthCheckResponse> {
    const startTime = Date.now();
    logger.info('Performing manual health check', { checkNames });

    try {
      let response: HealthCheckResponse;

      if (checkNames && checkNames.length > 0) {
        // Perform specific checks
        const checks: HealthCheckResult[] = [];

        for (const checkName of checkNames) {
          const result = await providerHealthCheck.performCheck(checkName);
          if (result) {
            checks.push(result);
          }
        }

        // Calculate summary
        const unhealthy = checks.filter(c => c.status === HealthStatus.UNHEALTHY).length;
        const degraded = checks.filter(c => c.status === HealthStatus.DEGRADED).length;
        const healthy = checks.filter(c => c.status === HealthStatus.HEALTHY).length;

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

        response = {
          status: overallStatus,
          timestamp: Date.now(),
          uptime: Date.now() - this.startTime,
          version: process.env.npm_package_version || '0.0.1',
          checks,
          summary: {
            total: checks.length,
            healthy,
            degraded,
            unhealthy,
            unknown: 0
          }
        };
      } else {
        // Perform all checks
        response = await providerHealthCheck.performAllChecks();
      }

      // Store in history
      this.addToHistory(response);

      // Update last check time
      this.lastCheckTimes.set('manual', Date.now());

      // Process alerts based on results
      await this.processAlerts(response);

      // Record metrics
      await this.recordHealthCheckMetrics(response);

      logger.info('Health check completed', {
        status: response.status,
        duration: Date.now() - startTime,
        checksCount: response.checks.length
      });

      this.emit('healthCheckCompleted', response);

      return response;
    } catch (error) {
      logger.error('Health check failed', {}, error as Error);

      const errorResponse: HealthCheckResponse = {
        status: HealthStatus.UNHEALTHY,
        timestamp: Date.now(),
        uptime: Date.now() - this.startTime,
        version: process.env.npm_package_version || '0.0.1',
        checks: [],
        summary: {
          total: 0,
          healthy: 0,
          degraded: 0,
          unhealthy: 1,
          unknown: 0
        }
      };

      this.emit('healthCheckFailed', errorResponse, error);
      throw error;
    }
  }

  /**
   * Schedule a recurring health check
   */
  scheduleHealthCheck(schedule: HealthCheckSchedule): void {
    if (!schedule.enabled) {
      logger.debug(`Schedule ${schedule.name} is disabled`);
      return;
    }

    // Clear existing schedule if any
    this.clearSchedule(schedule.name);

    logger.info(`Scheduling health check: ${schedule.name}`, {
      interval: schedule.interval,
      checks: schedule.checks
    });

    const timeout = setInterval(async () => {
      try {
        await this.performHealthCheck(schedule.checks);
      } catch (error) {
        logger.error(`Scheduled health check failed: ${schedule.name}`, {}, error as Error);
      }
    }, schedule.interval);

    this.schedules.set(schedule.name, timeout);
    this.emit('scheduleAdded', schedule);
  }

  /**
   * Clear a health check schedule
   */
  clearSchedule(scheduleName: string): void {
    const timeout = this.schedules.get(scheduleName);
    if (timeout) {
      clearInterval(timeout);
      this.schedules.delete(scheduleName);
      logger.debug(`Cleared schedule: ${scheduleName}`);
      this.emit('scheduleRemoved', scheduleName);
    }
  }

  /**
   * Add an alert configuration
   */
  addAlertConfig(alertConfig: AlertConfig): void {
    logger.info(`Adding alert configuration: ${alertConfig.name}`);
    this.emit('alertConfigAdded', alertConfig);
  }

  /**
   * Get recent health check history
   */
  getHistory(limit: number = 10): HealthCheckResponse[] {
    return this.checkHistory.slice(-limit);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): AlertEvent[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = Date.now();

      logger.info(`Alert acknowledged: ${alertId}`, { acknowledgedBy });
      this.emit('alertAcknowledged', alert);
      return true;
    }
    return false;
  }

  /**
   * Clear old history entries
   */
  clearHistory(olderThanHours: number = 24): number {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    const originalLength = this.checkHistory.length;

    this.checkHistory = this.checkHistory.filter(check => check.timestamp > cutoffTime);

    const removedCount = originalLength - this.checkHistory.length;
    logger.info(`Cleared ${removedCount} old health check history entries`);
    return removedCount;
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('started', () => {
      logger.info('Health check service started');
    });

    this.on('stopped', () => {
      logger.info('Health check service stopped');
    });

    this.on('healthCheckCompleted', (response: HealthCheckResponse) => {
      // Additional processing can be added here
    });

    this.on('alertTriggered', (alert: AlertEvent) => {
      logger.warn('Alert triggered', {
        alertId: alert.id,
        name: alert.name,
        severity: alert.severity
      });
    });
  }

  /**
   * Start default schedules based on configuration
   */
  private startDefaultSchedules(): void {
    if (!this.config.healthCheck.enabled) {
      logger.info('Health checks disabled in configuration');
      return;
    }

    // Schedule comprehensive health check
    this.scheduleHealthCheck({
      name: 'comprehensive',
      interval: this.config.healthCheck.interval,
      enabled: true,
      timeout: this.config.healthCheck.timeout,
      checks: ['providers', 'cache', 'database', 'external-services', 'system-resources']
    });

    // Schedule quick provider-only health check (more frequent)
    this.scheduleHealthCheck({
      name: 'providers-quick',
      interval: Math.min(this.config.healthCheck.interval / 3, 10000), // Max every 10 seconds
      enabled: true,
      timeout: this.config.healthCheck.timeout / 2,
      checks: ['providers']
    });

    // Schedule system resources check
    if (this.config.resources.enabled) {
      this.scheduleHealthCheck({
        name: 'system-resources',
        interval: this.config.resources.interval,
        enabled: true,
        timeout: this.config.healthCheck.timeout,
        checks: ['system-resources']
      });
    }
  }

  /**
   * Get next scheduled check time
   */
  private getNextScheduledCheck(): number {
    if (this.schedules.size === 0) {
      return 0;
    }

    // Return the earliest next execution time
    let nextCheck = Infinity;
    for (const timeout of this.schedules.values()) {
      // This is a simplified calculation - in practice, you'd track the exact next execution time
      nextCheck = Math.min(nextCheck, Date.now() + this.config.healthCheck.interval);
    }

    return nextCheck === Infinity ? 0 : nextCheck;
  }

  /**
   * Add result to history
   */
  private addToHistory(response: HealthCheckResponse): void {
    this.checkHistory.push(response);

    // Maintain history size limit
    if (this.checkHistory.length > this.maxHistorySize) {
      this.checkHistory = this.checkHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Process alerts based on health check results
   */
  private async processAlerts(response: HealthCheckResponse): Promise<void> {
    try {
      // Check for system-wide health issues
      if (response.status === HealthStatus.UNHEALTHY) {
        await this.triggerAlert({
          name: 'system_unhealthy',
          severity: 'critical',
          message: 'System health check failed',
          data: { status: response.status, summary: response.summary }
        });
      }

      // Check individual component health
      for (const check of response.checks) {
        if (check.status === HealthStatus.UNHEALTHY) {
          await this.triggerAlert({
            name: `${check.name}_unhealthy`,
            severity: 'error',
            message: `${check.name} health check failed: ${check.message}`,
            data: { check: check.name, status: check.status, message: check.message }
          });
        }
      }

      // Clear alerts for recovered components
      await this.clearRecoveredAlerts(response);

    } catch (error) {
      logger.error('Failed to process alerts', {}, error as Error);
    }
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(alertData: {
    name: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    data?: Record<string, any>;
  }): Promise<void> {
    const now = Date.now();
    const lastTrigger = this.alertCooldowns.get(alertData.name) || 0;
    const cooldown = 5 * 60 * 1000; // 5 minutes default cooldown

    // Check cooldown
    if (now - lastTrigger < cooldown) {
      return;
    }

    const alert: AlertEvent = {
      id: `${alertData.name}_${now}`,
      name: alertData.name,
      severity: alertData.severity,
      message: alertData.message,
      timestamp: now,
      data: alertData.data,
      acknowledged: false
    };

    this.activeAlerts.set(alert.id, alert);
    this.alertCooldowns.set(alertData.name, now);

    // Send alert via configured channels
    await this.sendAlert(alert);

    this.emit('alertTriggered', alert);
  }

  /**
   * Clear alerts for recovered components
   */
  private async clearRecoveredAlerts(response: HealthCheckResponse): Promise<void> {
    const recoveredComponents = new Set<string>();

    // Identify healthy components
    for (const check of response.checks) {
      if (check.status === HealthStatus.HEALTHY) {
        recoveredComponents.add(check.name);
      }
    }

    // Clear alerts for recovered components
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      const componentName = alert.name.replace('_unhealthy', '');
      if (recoveredComponents.has(componentName)) {
        this.activeAlerts.delete(alertId);
        this.emit('alertCleared', alert);
      }
    }
  }

  /**
   * Send alert via configured channels
   */
  private async sendAlert(alert: AlertEvent): Promise<void> {
    if (!this.config.alerts.enabled) {
      return;
    }

    for (const channel of this.config.alerts.channels) {
      try {
        switch (channel) {
          case 'console':
            await this.sendConsoleAlert(alert);
            break;
          case 'webhook':
            await this.sendWebhookAlert(alert);
            break;
          case 'email':
            await this.sendEmailAlert(alert);
            break;
        }
      } catch (error) {
        logger.error(`Failed to send alert via ${channel}`, { alertId: alert.id }, error as Error);
      }
    }
  }

  /**
   * Send alert to console
   */
  private async sendConsoleAlert(alert: AlertEvent): Promise<void> {
    const level = alert.severity === 'critical' || alert.severity === 'error' ? 'error' : 'warn';
    logger[level](`ALERT: ${alert.message}`, {
      alertId: alert.id,
      severity: alert.severity,
      data: alert.data
    });
  }

  /**
   * Send alert via webhook
   */
  private async sendWebhookAlert(alert: AlertEvent): Promise<void> {
    if (!this.config.alerts.webhook.url) {
      return;
    }

    // Implementation would depend on HTTP client available
    // This is a placeholder for webhook functionality
    logger.info('Webhook alert would be sent', {
      alertId: alert.id,
      webhookUrl: this.config.alerts.webhook.url
    });
  }

  /**
   * Send alert via email
   */
  private async sendEmailAlert(alert: AlertEvent): Promise<void> {
    // Implementation would depend on email library available
    // This is a placeholder for email functionality
    logger.info('Email alert would be sent', {
      alertId: alert.id,
      recipients: this.config.alerts.email.to
    });
  }

  /**
   * Record health check metrics
   */
  private async recordHealthCheckMetrics(response: HealthCheckResponse): Promise<void> {
    try {
      const metricsHelper = getMetricsHelper();

      // Record overall health status
      const statusValue = response.status === HealthStatus.HEALTHY ? 1 :
                         response.status === HealthStatus.DEGRADED ? 0.5 : 0;
      const metricsCollector = getMetricsCollector();
      await metricsCollector.setGauge('system_health_status', statusValue);

      // Record individual check results
      for (const check of response.checks) {
        const checkStatusValue = check.status === HealthStatus.HEALTHY ? 1 :
                               check.status === HealthStatus.DEGRADED ? 0.5 : 0;
        await metricsCollector.setGauge(`health_check_status`, checkStatusValue, {
          check_name: check.name
        });
      }

      // Record summary metrics
      await metricsCollector.setGauge('healthy_checks', response.summary.healthy);
      await metricsCollector.setGauge('degraded_checks', response.summary.degraded);
      await metricsCollector.setGauge('unhealthy_checks', response.summary.unhealthy);

    } catch (error) {
      logger.error('Failed to record health check metrics', {}, error as Error);
    }
  }
}

// Singleton instance
let healthService: HealthCheckService | null = null;

/**
 * Get the health check service instance
 */
export function getHealthService(): HealthCheckService {
  if (!healthService) {
    healthService = new HealthCheckService();
  }
  return healthService;
}

/**
 * Initialize the health check service
 */
export function initializeHealthService(): HealthCheckService {
  return getHealthService();
}

/**
 * Convenience function to perform health check
 */
export async function performHealthCheck(checkNames?: string[]): Promise<HealthCheckResponse> {
  return getHealthService().performHealthCheck(checkNames);
}

/**
 * Convenience function to get service status
 */
export function getHealthServiceStatus(): HealthServiceStatus {
  return getHealthService().getStatus();
}