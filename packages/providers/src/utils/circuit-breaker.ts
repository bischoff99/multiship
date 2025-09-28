import { CircuitBreakerState } from '../types.js';
import { Logger } from './logger.js';
import { CircuitBreakerError } from '../errors/provider-errors.js';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenMaxCalls: number;
  monitoringPeriodMs: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private config: CircuitBreakerConfig;
  private logger: Logger;
  private halfOpenCalls: number = 0;
  private lastStateChange: number = Date.now();

  constructor(
    config: CircuitBreakerConfig,
    logger: Logger,
    initialState: CircuitBreakerState = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED'
    }
  ) {
    this.config = config;
    this.logger = logger;
    this.state = initialState;
  }

  /**
   * Check if the circuit breaker allows execution
   */
  canExecute(): boolean {
    const now = Date.now();

    switch (this.state.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        if (now - this.state.lastFailureTime >= this.config.recoveryTimeoutMs) {
          this.transitionToHalfOpen();
          return true;
        }
        return false;

      case 'HALF_OPEN':
        if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
          return false;
        }
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful operation
   */
  onSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        this.transitionToClosed();
      }
    } else if (this.state.state === 'CLOSED') {
      // Reset failure count on success
      this.state.failures = 0;
    }
  }

  /**
   * Record a failed operation
   */
  onFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();

    if (this.state.state === 'HALF_OPEN') {
      this.transitionToOpen();
    } else if (this.state.state === 'CLOSED' && this.state.failures >= this.config.failureThreshold) {
      this.transitionToOpen();
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return {
      state: this.state.state,
      failures: this.state.failures,
      lastFailureTime: this.state.lastFailureTime,
      halfOpenCalls: this.halfOpenCalls,
      timeSinceLastStateChange: Date.now() - this.lastStateChange,
      canExecute: this.canExecute()
    };
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED'
    };
    this.halfOpenCalls = 0;
    this.lastStateChange = Date.now();
    this.logger.info('Circuit breaker reset', { provider: this.getProvider() });
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    const previousState = this.state.state;
    this.state.state = 'OPEN';
    this.lastStateChange = Date.now();
    
    this.logger.warn('Circuit breaker opened', {
      state: 'OPEN',
      message: `Failure threshold ${this.config.failureThreshold} reached`,
      failures: this.state.failures,
      previousState
    });
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state.state;
    this.state.state = 'HALF_OPEN';
    this.halfOpenCalls = 0;
    this.lastStateChange = Date.now();
    
    this.logger.info('Circuit breaker half-open', {
      state: 'HALF_OPEN',
      message: 'Recovery timeout reached, testing service',
      previousState,
      recoveryTimeoutMs: this.config.recoveryTimeoutMs
    });
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.state.state;
    this.state.state = 'CLOSED';
    this.state.failures = 0;
    this.halfOpenCalls = 0;
    this.lastStateChange = Date.now();
    
    this.logger.info('Circuit breaker closed', {
      state: 'CLOSED',
      message: 'Service recovered successfully',
      previousState,
      halfOpenCalls: this.halfOpenCalls
    });
  }

  /**
   * Get provider name from logger context
   */
  private getProvider(): string {
    try {
      return (this.logger as any).context?.provider || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    if (!this.canExecute()) {
      const error = new CircuitBreakerError(
        `Circuit breaker is ${this.state.state}`,
        this.getProvider(),
        operationName,
        this.state.state
      );
      this.logger.error('Circuit breaker blocked operation', {
        state: this.state.state,
        operation: operationName
      }, error);
      throw error;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}