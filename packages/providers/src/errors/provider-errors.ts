import { LogContext } from '../utils/logger.js';

// Correlation ID management using AsyncLocalStorage (Node.js 14+) or fallback
let globalCorrelationId = 0;

export function generateCorrelationId(): string {
  return `corr-${Date.now()}-${++globalCorrelationId}`;
}

export function getCurrentCorrelationId(): string | undefined {
  // Simple approach: use a global variable for now
  // In a production system, you'd use AsyncLocalStorage for proper context management
  if (typeof globalThis !== 'undefined' && (globalThis as any).__correlationId) {
    return (globalThis as any).__correlationId;
  }
  return undefined;
}

export function withCorrelationId<T>(correlationId: string, fn: () => T): T {
  const previousId = getCurrentCorrelationId();

  try {
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__correlationId = correlationId;
    }
    return fn();
  } finally {
    // Restore previous correlation ID
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__correlationId = previousId;
    }
  }
}

export interface ErrorMetadata {
  provider?: string;
  operation?: string;
  correlationId?: string;
  statusCode?: number;
  retryAttempt?: number;
  timestamp: string;
  context?: LogContext;
}

export abstract class ProviderError extends Error {
  public readonly name: string;
  public readonly provider: string;
  public readonly operation: string;
  public readonly isRetryable: boolean;
  public readonly metadata: ErrorMetadata;
  public readonly originalError?: Error;
  public readonly timeoutMs?: number;

  constructor(
    message: string,
    provider: string,
    operation: string,
    isRetryable: boolean = false,
    statusCode?: number,
    originalError?: Error,
    context?: LogContext
  ) {
    super(message);
    this.name = this.constructor.name;
    this.provider = provider;
    this.operation = operation;
    this.isRetryable = isRetryable;
    this.originalError = originalError;

    // Generate correlation ID if not provided in context
    const correlationId = context?.correlationId || generateCorrelationId();

    this.metadata = {
      provider,
      operation,
      timestamp: new Date().toISOString(),
      statusCode,
      correlationId,
      context: {
        ...context,
        correlationId
      }
    };

    // Stack trace is maintained automatically by Error constructor
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      provider: this.provider,
      operation: this.operation,
      isRetryable: this.isRetryable,
      correlationId: this.metadata.correlationId,
      metadata: this.metadata,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    };
  }

  static fromHttpError(
    statusCode: number,
    responseBody: any,
    provider: string,
    operation: string,
    context?: LogContext
  ): ProviderError {
    const message = responseBody?.message || responseBody?.error || `HTTP ${statusCode} error`;

    if (statusCode >= 500) {
      // Server errors are typically retryable
      return new NetworkError(message, provider, operation, true, statusCode, undefined, context);
    } else if (statusCode === 429) {
      // Rate limiting
      return new RateLimitError(message, provider, operation, context);
    } else if (statusCode === 401 || statusCode === 403) {
      // Authentication errors
      return new AuthenticationError(message, provider, operation, context);
    } else if (statusCode >= 400 && statusCode < 500) {
      // Client errors are typically not retryable
      return new NetworkError(message, provider, operation, false, statusCode, undefined, context);
    } else {
      return new NetworkError(message, provider, operation, true, statusCode, undefined, context);
    }
  }
}

export class ConfigurationError extends ProviderError {
  constructor(message: string, provider: string, context?: LogContext) {
    super(message, provider, 'configuration', false, undefined, undefined, context);
  }
}

export class NetworkError extends ProviderError {
  constructor(
    message: string,
    provider: string,
    operation: string,
    isRetryable: boolean = true,
    statusCode?: number,
    originalError?: Error,
    context?: LogContext
  ) {
    super(message, provider, operation, isRetryable, statusCode, originalError, context);
  }
}

export class RateLimitError extends ProviderError {
  public readonly retryAfter?: number;

  constructor(
    message: string,
    provider: string,
    operation: string,
    context?: LogContext,
    retryAfter?: number
  ) {
    super(message, provider, operation, true, 429, undefined, context);
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter
    };
  }
}

export class AuthenticationError extends ProviderError {
  constructor(
    message: string,
    provider: string,
    operation: string,
    context?: LogContext
  ) {
    super(message, provider, operation, false, undefined, undefined, context);
  }
}

export class TimeoutError extends ProviderError {
  public readonly timeoutMs: number;

  constructor(
    message: string,
    provider: string,
    operation: string,
    timeoutMs: number,
    context?: LogContext
  ) {
    super(message, provider, operation, true, undefined, undefined, context);
    this.timeoutMs = timeoutMs;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      timeoutMs: this.timeoutMs
    };
  }
}

export class CircuitBreakerError extends ProviderError {
  public readonly circuitBreakerState: string;

  constructor(
    message: string,
    provider: string,
    operation: string,
    circuitBreakerState: string,
    context?: LogContext
  ) {
    super(message, provider, operation, false, undefined, undefined, context);
    this.circuitBreakerState = circuitBreakerState;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      circuitBreakerState: this.circuitBreakerState
    };
  }
}

export class ValidationError extends ProviderError {
  public readonly field?: string;
  public readonly value?: any;

  constructor(
    message: string,
    provider: string,
    operation: string,
    field?: string,
    value?: any,
    context?: LogContext
  ) {
    super(message, provider, operation, false, 400, undefined, context);
    this.field = field;
    this.value = value;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      field: this.field,
      value: this.value
    };
  }
}

export class CacheError extends ProviderError {
  public readonly cacheKey?: string;
  public readonly cacheOperation?: string;

  constructor(
    message: string,
    provider: string,
    operation: string,
    cacheKey?: string,
    cacheOperation?: string,
    context?: LogContext
  ) {
    super(message, provider, operation, true, undefined, undefined, context);
    this.cacheKey = cacheKey;
    this.cacheOperation = cacheOperation;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      cacheKey: this.cacheKey,
      cacheOperation: this.cacheOperation
    };
  }
}

export class QuotaExceededError extends ProviderError {
  public readonly quotaType?: string;
  public readonly limit?: number;
  public readonly current?: number;

  constructor(
    message: string,
    provider: string,
    operation: string,
    quotaType?: string,
    limit?: number,
    current?: number,
    context?: LogContext
  ) {
    super(message, provider, operation, false, 429, undefined, context);
    this.quotaType = quotaType;
    this.limit = limit;
    this.current = current;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      quotaType: this.quotaType,
      limit: this.limit,
      current: this.current
    };
  }
}

export class ServiceUnavailableError extends ProviderError {
  public readonly retryAfter?: number;
  public readonly serviceStatus?: string;

  constructor(
    message: string,
    provider: string,
    operation: string,
    retryAfter?: number,
    serviceStatus?: string,
    context?: LogContext
  ) {
    super(message, provider, operation, true, 503, undefined, context);
    this.retryAfter = retryAfter;
    this.serviceStatus = serviceStatus;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
      serviceStatus: this.serviceStatus
    };
  }
}

// Error classification utilities
export function classifyError(error: any, provider: string, operation: string, context?: LogContext): ProviderError {
  // If it's already a ProviderError, return as-is
  if (error instanceof ProviderError) {
    return error;
  }

  // Handle fetch/network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new NetworkError(
      'Network request failed',
      provider,
      operation,
      true,
      undefined,
      error,
      context
    );
  }

  // Handle timeout errors
  if (error.message && error.message.includes('timeout')) {
    const timeoutMatch = error.message.match(/(\d+)/);
    const timeoutMs = timeoutMatch ? parseInt(timeoutMatch[1]) : 30000;
    return new TimeoutError(
      'Request timeout',
      provider,
      operation,
      timeoutMs,
      context
    );
  }

  // Handle cache-related errors
  if (error.message && (error.message.includes('cache') || error.message.includes('Cache'))) {
    return new CacheError(
      error.message,
      provider,
      operation,
      context?.cacheKey,
      context?.cacheOperation,
      context
    );
  }

  // Handle quota exceeded errors
  if (error.message && (error.message.includes('quota') || error.message.includes('limit exceeded'))) {
    return new QuotaExceededError(
      error.message,
      provider,
      operation,
      context?.quotaType,
      context?.limit,
      context?.current,
      context
    );
  }

  // Handle service unavailable errors
  if (error.message && (error.message.includes('service unavailable') || error.message.includes('maintenance'))) {
    return new ServiceUnavailableError(
      error.message,
      provider,
      operation,
      context?.retryAfter,
      context?.serviceStatus,
      context
    );
  }

  // Handle HTTP errors with status codes
  if (error.statusCode || error.status) {
    const statusCode = error.statusCode || error.status;
    return ProviderError.fromHttpError(
      statusCode,
      error,
      provider,
      operation,
      context
    );
  }

  // Handle validation errors
  if (error.message && (error.message.includes('validation') || error.message.includes('invalid'))) {
    return new ValidationError(
      error.message,
      provider,
      operation,
      context?.field,
      context?.value,
      context
    );
  }

  // Default to generic network error
  return new NetworkError(
    error.message || 'Unknown error occurred',
    provider,
    operation,
    true,
    undefined,
    error,
    context
  );
}

// Error context builders
export function createErrorContext(
  baseContext: Partial<LogContext> = {}
): LogContext {
  return {
    timestamp: new Date().toISOString(),
    ...baseContext
  };
}