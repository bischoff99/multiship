export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogContext {
  correlationId?: string;
  provider?: string;
  operation?: string;
  [key: string]: any;
}

export class Logger {
  private context: LogContext = {};
  private level: LogLevel = LogLevel.INFO;
  private destinations: any[] = [];

  constructor(level?: LogLevel, destinations?: any[], context?: LogContext) {
    this.level = level || LogLevel.INFO;
    this.destinations = destinations || [];
    this.context = context || {};
  }

  withCorrelationId(correlationId: string): Logger {
    return new Logger(this.level, this.destinations, { ...this.context, correlationId });
  }

  forOperation(operation: string): Logger {
    return new Logger(this.level, this.destinations, { ...this.context, operation });
  }

  withContext(context: LogContext): Logger {
    return new Logger(this.level, this.destinations, { ...this.context, ...context });
  }

  generateCorrelationId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getCorrelationId(): string | undefined {
    return this.context.correlationId;
  }

  debug(message: string, data?: any): void {
    console.log(`[DEBUG] ${message}`, data || '');
  }

  info(message: string, data?: any): void {
    console.log(`[INFO] ${message}`, data || '');
  }

  warn(message: string, data?: any, error?: Error): void {
    console.warn(`[WARN] ${message}`, data || '', error || '');
  }

  error(message: string, data?: any, error?: Error): void {
    console.error(`[ERROR] ${message}`, data || '', error || '');
  }

  log(level: LogLevel, message: string, data?: any): void {
    switch (level) {
      case LogLevel.DEBUG:
        this.debug(message, data);
        break;
      case LogLevel.INFO:
        this.info(message, data);
        break;
      case LogLevel.WARN:
        this.warn(message, data);
        break;
      case LogLevel.ERROR:
        this.error(message, data);
        break;
    }
  }

  logTimeout(provider: string, operation: string, timeoutMs: number): void {
    this.warn(`Operation timeout: ${operation}`, { provider, timeoutMs });
  }

  logCircuitBreaker(state: string, message: string, provider?: string, data?: any): void {
    this.warn(`Circuit breaker ${state}: ${message}`, { provider, ...data });
  }

  logRateLimit(provider: string, retryAfter?: number, data?: any): void {
    this.warn(`Rate limit exceeded for ${provider}`, { retryAfter, ...data });
  }
}

// Console destination for logging
export class ConsoleDestination {
  write(level: LogLevel, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    switch (level) {
      case LogLevel.DEBUG:
        console.log(logMessage, data || '');
        break;
      case LogLevel.INFO:
        console.log(logMessage, data || '');
        break;
      case LogLevel.WARN:
        console.warn(logMessage, data || '');
        break;
      case LogLevel.ERROR:
        console.error(logMessage, data || '');
        break;
    }
  }
}

// Default logger instance
export const defaultLogger = new Logger();