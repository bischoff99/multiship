import { ProviderAdapter, ShipmentInput, RateQuote, PurchaseResult, CircuitBreakerState } from '../types.js';
import { Logger, LogLevel } from '../utils/logger.js';
import {
  ProviderError,
  NetworkError,
  ConfigurationError,
  TimeoutError,
  CircuitBreakerError,
  RateLimitError,
  classifyError,
  createErrorContext
} from '../errors/provider-errors.js';
import { getProviderConfig } from '../config/provider-config.js';

interface VeeqoAllocation {
  allocationId: number;
  serviceType: string;
  subCarrierId?: string | null;
}

export class VeeqoAdapter implements ProviderAdapter {
  readonly name = 'veeqo';
  readonly enabled: boolean;
  private baseUrl: string;
  private apiKey: string;
  private circuitBreaker: CircuitBreakerState;
  private logger: Logger;
  private config: any;

  constructor() {
    this.config = getProviderConfig('veeqo');
    this.apiKey = process.env.VEEQO_API_KEY || '';
    this.baseUrl = process.env.VEEQO_API_BASE || 'https://api.veeqo.com';
    this.enabled = Boolean(this.apiKey) && this.config.enabled;

    // Initialize logger with provider-specific configuration
    this.logger = new Logger(
      this.config.logLevel,
      [new (require('../utils/logger.js').ConsoleDestination)()],
      { provider: this.name }
    );

    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED'
    };

    this.logger.info('VeeqoAdapter initialized', {
      enabled: this.enabled,
      baseUrl: this.baseUrl,
      circuitBreakerState: this.circuitBreaker.state
    });
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, maxRetries?: number): Promise<T> {
    const config = this.config.retry;
    const retryCount = maxRetries ?? config.maxRetries;
    let lastError: ProviderError;

    const logger = this.logger.withContext({ operation: 'executeWithRetry' });

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        // Check circuit breaker
        if (!this.canExecute()) {
          const circuitError = new CircuitBreakerError(
            `Veeqo circuit breaker is ${this.circuitBreaker.state}`,
            this.name,
            'executeWithRetry',
            this.circuitBreaker.state
          );
          logger.error('Circuit breaker open', { circuitBreakerState: this.circuitBreaker.state }, circuitError);
          throw circuitError;
        }

        const result = await Promise.race([
          operation(),
          this.timeoutPromise()
        ]);

        // Success - reset circuit breaker
        this.onSuccess();
        logger.debug('Operation succeeded', { attempt, totalAttempts: retryCount });
        return result;
      } catch (error) {
        const providerError = classifyError(error, this.name, 'executeWithRetry', {
          attempt,
          maxRetries: retryCount
        });

        lastError = providerError;
        logger.warn('Operation attempt failed', {
          attempt,
          maxRetries: retryCount,
          errorMessage: providerError.message,
          isRetryable: providerError.isRetryable
        }, providerError);

        if (attempt === retryCount) {
          this.onFailure();
          logger.error('All retry attempts exhausted', {
            attempt,
            maxRetries: retryCount,
            finalError: providerError.message
          }, providerError);
          throw providerError;
        }

        // Wait before retry with exponential backoff
        const delay = Math.min(
          config.baseDelayMs * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelayMs
        );

        logger.info('Retrying after delay', { delay, attempt, maxRetries: retryCount });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  private canExecute(): boolean {
    const now = Date.now();
    const recoveryTimeout = this.config.circuitBreaker.recoveryTimeoutMs;

    switch (this.circuitBreaker.state) {
      case 'CLOSED':
        return true;
      case 'OPEN':
        if (now - this.circuitBreaker.lastFailureTime > recoveryTimeout) {
          this.circuitBreaker.state = 'HALF_OPEN';
          this.logger.logCircuitBreaker('HALF_OPEN', 'Recovery timeout reached');
          return true;
        }
        return false;
      case 'HALF_OPEN':
        return true;
      default:
        return false;
    }
  }

  private onSuccess(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.state = 'CLOSED';
    this.logger.debug('Circuit breaker reset to CLOSED');
  }

  private onFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failures >= this.config.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      this.logger.logCircuitBreaker('OPEN', `Failure threshold ${this.config.circuitBreaker.failureThreshold} reached`);
    } else {
      this.logger.warn('Circuit breaker failure recorded', {
        failures: this.circuitBreaker.failures,
        threshold: this.config.circuitBreaker.failureThreshold,
        circuitBreakerState: this.circuitBreaker.state
      });
    }
  }

  private timeoutPromise(): Promise<never> {
    const timeoutMs = this.config.timeouts.requestTimeout;
    return new Promise((_, reject) => {
      setTimeout(() => {
        const timeoutError = new TimeoutError(
          'Veeqo request timeout',
          this.name,
          'request',
          timeoutMs
        );
        this.logger.logTimeout(this.name, 'request', timeoutMs);
        reject(timeoutError);
      }, timeoutMs);
    });
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const operation = `makeRequest:${endpoint}`;
    const logger = this.logger.forOperation(operation);

    try {
      logger.debug('Making API request', { endpoint, method: options.method || 'GET' });

      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'multiship-providers/1.0',
          ...options.headers
        }
      });

      if (!response.ok) {
        const errorContext = createErrorContext({
          provider: this.name,
          operation,
          statusCode: response.status
        });

        if (response.status === 429) {
          // Rate limiting
          const retryAfter = response.headers.get('Retry-After');
          const rateLimitError = new RateLimitError(
            `Veeqo API rate limit exceeded: ${response.status} ${response.statusText}`,
            this.name,
            operation,
            errorContext,
            retryAfter ? parseInt(retryAfter) * 1000 : undefined
          );
          logger.logRateLimit(this.name, retryAfter ? parseInt(retryAfter) * 1000 : undefined);
          throw rateLimitError;
        } else if (response.status >= 500) {
          // Server error
          const serverError = new NetworkError(
            `Veeqo API server error: ${response.status} ${response.statusText}`,
            this.name,
            operation,
            true,
            response.status,
            undefined,
            errorContext
          );
          logger.error('Server error response', { statusCode: response.status }, serverError);
          throw serverError;
        } else {
          // Client error
          const clientError = new NetworkError(
            `Veeqo API client error: ${response.status} ${response.statusText}`,
            this.name,
            operation,
            false,
            response.status,
            undefined,
            errorContext
          );
          logger.error('Client error response', { statusCode: response.status }, clientError);
          throw clientError;
        }
      }

      const result = await response.json();
      logger.debug('API request successful', {
        endpoint,
        statusCode: response.status,
        contentType: response.headers.get('content-type')
      });

      return result;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      // Handle network errors
      const networkError = new NetworkError(
        `Veeqo API request failed: ${error instanceof Error ? error.message : String(error)}`,
        this.name,
        operation,
        true,
        undefined,
        error instanceof Error ? error : undefined,
        createErrorContext({ provider: this.name, operation })
      );

      logger.error('Network request failed', { endpoint }, networkError);
      throw networkError;
    }
  }

  async quote(input: ShipmentInput): Promise<RateQuote[]> {
    const correlationId = this.logger.generateCorrelationId();
    const logger = this.logger.withCorrelationId(correlationId).forOperation('quote');

    return this.executeWithRetry(async () => {
      try {
        if (!input.veeqo?.allocationId) {
          const validationError = new ConfigurationError(
            'Veeqo requires allocationId in shipment input',
            this.name,
            createErrorContext({
              provider: this.name,
              operation: 'quote',
              correlationId
            })
          );
          logger.error('Missing allocationId', { correlationId }, validationError);
          throw validationError;
        }

        logger.info('Getting rates for allocation', {
          allocationId: input.veeqo.allocationId,
          correlationId,
          parcel: input.parcel
        });

        // Set allocation package
        await this.setAllocationPackage(input.veeqo.allocationId, input.parcel);

        // Get rates
        const rates = await this.getRates(input.veeqo.allocationId);

        const rateQuotes = rates.map((r: any) => ({
          provider: 'veeqo' as const,
          rateId: r.remote_shipment_id,
          shipmentId: String(input.veeqo!.allocationId),
          service: r.service_id,
          carrier: r.service_carrier,
          amount: Math.round(Number(r.base_rate) * 100),
          currency: r.currency,
          serviceType: r.name,
          subCarrierId: r.sub_carrier_id ?? null
        }));

        logger.info('Rate quote completed', {
          allocationId: input.veeqo.allocationId,
          correlationId,
          ratesReturned: rateQuotes.length
        });

        return rateQuotes;
      } catch (error) {
        logger.error('Rate quote failed', {
          correlationId,
          allocationId: input.veeqo?.allocationId
        }, error instanceof Error ? error : undefined);
        throw error;
      }
    });
  }

  async purchase(rateId: string, shipmentId?: string, allocationId?: number): Promise<PurchaseResult> {
    if (!allocationId) {
      throw new Error('allocationId is required for Veeqo purchases');
    }

    return this.executeWithRetry(async () => {
      const response = await this.makeRequest('/shipments', {
        method: 'POST',
        body: JSON.stringify({
          allocation_id: allocationId,
          remote_shipment_id: rateId
        })
      });

      return {
        provider: 'veeqo' as const,
        shipmentId: response.id,
        labelUrl: response.label_url,
        trackingUrl: response.tracking_url ?? null,
        trackingCode: null
      };
    });
  }

  private async setAllocationPackage(allocationId: number, parcel: any): Promise<void> {
    await this.makeRequest(`/allocations/${allocationId}/package`, {
      method: 'PUT',
      body: JSON.stringify({
        length: parcel.length,
        width: parcel.width,
        height: parcel.height,
        weight: parcel.weight,
        length_units: parcel.distance_unit ?? 'in',
        weight_units: parcel.mass_unit ?? 'oz'
      })
    });
  }

  private async getRates(allocationId: number): Promise<any[]> {
    const response = await this.makeRequest(`/allocations/${allocationId}/shipping_rates`);
    return response.shipping_rates || [];
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple API call to check if service is responsive
      await this.makeRequest('/users/me');
      return true;
    } catch (error) {
      return false;
    }
  }
}