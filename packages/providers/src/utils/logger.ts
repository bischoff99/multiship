function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogContext {
  provider?: string;
  operation?: string;
  correlationId?: string;
  userId?: string;
  shipmentId?: string;
  rateId?: string;
  allocationId?: number;
  duration?: number;
  retryAttempt?: number;
  circuitBreakerState?: string;
  errorCode?: string;
  errorMessage?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error;
}

export interface LogDestination {
  log(entry: LogEntry): Promise<void> | void;
}

export class ConsoleDestination implements LogDestination {
  log(entry: LogEntry): void {
    const timestamp = entry.timestamp;
    const level = LogLevel[entry.level];
    const message = entry.message;
    const context = entry.context;

    const logData = {
      timestamp,
      level,
      message,
      ...(context && { context }),
      ...(entry.error && {
        error: {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack
        }
      })
    };

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(JSON.stringify(logData, null, 2));
        break;
      case LogLevel.WARN:
        console.warn(JSON.stringify(logData, null, 2));
        break;
      case LogLevel.INFO:
        console.info(JSON.stringify(logData, null, 2));
        break;
      case LogLevel.DEBUG:
        console.debug(JSON.stringify(logData, null, 2));
        break;
    }
  }
}

export class FileDestination implements LogDestination {
  private logFile: string;

  constructor(logFile: string) {
    this.logFile = logFile;
  }

  async log(entry: LogEntry): Promise<void> {
    // File logging can be implemented later if needed
    // For now, just log to console as fallback
    console.log(`FILE [${this.logFile}]:`, JSON.stringify(entry, null, 2));
  }
}

export class Logger {
  private minLevel: LogLevel;
  private destinations: LogDestination[];
  private context: LogContext;

  constructor(
    minLevel: LogLevel = LogLevel.INFO,
    destinations: LogDestination[] = [new ConsoleDestination()],
    context: LogContext = {}
  ) {
    this.minLevel = minLevel;
    this.destinations = destinations;
    this.context = context;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.minLevel;
  }

  private createLogEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
      error
    };
  }

  private async writeLog(entry: LogEntry): Promise<void> {
    const promises = this.destinations.map(dest => dest.log(entry));
    await Promise.all(promises);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const entry = this.createLogEntry(LogLevel.ERROR, message, context, error);
    this.writeLog(entry);
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const entry = this.createLogEntry(LogLevel.WARN, message, context, error);
    this.writeLog(entry);
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const entry = this.createLogEntry(LogLevel.INFO, message, context);
    this.writeLog(entry);
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const entry = this.createLogEntry(LogLevel.DEBUG, message, context);
    this.writeLog(entry);
  }

  // Context management
  withContext(context: LogContext): Logger {
    return new Logger(this.minLevel, this.destinations, { ...this.context, ...context });
  }

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  getContext(): LogContext {
    return { ...this.context };
  }

  // Correlation ID utilities
  generateCorrelationId(): string {
    return generateUUID();
  }

  withCorrelationId(correlationId?: string): Logger {
    const id = correlationId || this.generateCorrelationId();
    return this.withContext({ correlationId: id });
  }

  // Provider-specific logger
  forProvider(providerName: string): Logger {
    return this.withContext({ provider: providerName });
  }

  // Operation-specific logger
  forOperation(operation: string): Logger {
    return this.withContext({ operation });
  }

  // Timing utilities
  async timeOperation<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    const logger = this.forOperation(operation);

    try {
      logger.debug('Operation started');
      const result = await fn();
      const duration = Date.now() - startTime;

      logger.info('Operation completed successfully', { duration });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Operation failed', { duration }, error as Error);
      throw error;
    }
  }

  // Retry operation logging
  logRetry(attempt: number, maxRetries: number, error: Error): void {
    this.warn(`Retry attempt ${attempt}/${maxRetries}`, {
      retryAttempt: attempt,
      maxRetries,
      errorMessage: error.message
    }, error);
  }

  logCircuitBreaker(state: string, reason: string): void {
    this.warn(`Circuit breaker ${state}`, {
      circuitBreakerState: state,
      reason
    });
  }

  logRateLimit(provider: string, retryAfter?: number): void {
    this.warn('Rate limit exceeded', {
      provider,
      retryAfter
    });
  }

  logTimeout(provider: string, operation: string, timeoutMs: number): void {
    this.warn('Request timeout', {
      provider,
      operation,
      timeoutMs
    });
  }
}

// Global logger instance
export const createLogger = (
  minLevel: LogLevel = LogLevel.INFO,
  destinations?: LogDestination[],
  context?: LogContext
): Logger => {
  return new Logger(minLevel, destinations, context);
};

// Default logger instance
export const defaultLogger = createLogger();