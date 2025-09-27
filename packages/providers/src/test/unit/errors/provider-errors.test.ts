import {
  ProviderError,
  ConfigurationError,
  NetworkError,
  RateLimitError,
  AuthenticationError,
  TimeoutError,
  CircuitBreakerError,
  ValidationError,
  classifyError,
  createErrorContext
} from '../../../errors/provider-errors.js';
import { LogContext } from '../../../utils/logger.js';

describe('Provider Errors', () => {
  const testContext: LogContext = {
    timestamp: '2024-01-01T00:00:00.000Z',
    correlationId: 'test-correlation-id',
    userId: 'test-user'
  };

  describe('Base ProviderError', () => {
    it('should create error with correct properties', () => {
      const error = new NetworkError(
        'Test network error',
        'test-provider',
        'quote',
        true,
        500,
        undefined,
        testContext
      );

      expect(error.message).toBe('Test network error');
      expect(error.provider).toBe('test-provider');
      expect(error.operation).toBe('quote');
      expect(error.isRetryable).toBe(true);
      expect(error.metadata.statusCode).toBe(500);
      expect(error.metadata.context).toEqual(testContext);
    });

    it('should serialize to JSON correctly', () => {
      const error = new NetworkError(
        'Test error',
        'test-provider',
        'quote',
        false,
        400
      );

      const json = error.toJSON();
      expect(json).toMatchObject({
        name: 'NetworkError',
        message: 'Test error',
        provider: 'test-provider',
        operation: 'quote',
        isRetryable: false,
        metadata: expect.objectContaining({
          provider: 'test-provider',
          operation: 'quote',
          statusCode: 400
        })
      });
    });

    it('should handle original error in serialization', () => {
      const originalError = new Error('Original error');
      const error = new NetworkError(
        'Wrapper error',
        'test-provider',
        'quote',
        true,
        500,
        originalError
      );

      const json = error.toJSON();
      expect(json.originalError).toMatchObject({
        name: 'Error',
        message: 'Original error'
      });
    });
  });

  describe('ConfigurationError', () => {
    it('should create non-retryable configuration error', () => {
      const error = new ConfigurationError(
        'Invalid API key',
        'test-provider',
        testContext
      );

      expect(error.message).toBe('Invalid API key');
      expect(error.provider).toBe('test-provider');
      expect(error.operation).toBe('configuration');
      expect(error.isRetryable).toBe(false);
      expect(error.metadata.statusCode).toBeUndefined();
    });
  });

  describe('NetworkError', () => {
    it('should create retryable network error by default', () => {
      const error = new NetworkError(
        'Connection failed',
        'test-provider',
        'quote'
      );

      expect(error.isRetryable).toBe(true);
    });

    it('should allow custom retryable setting', () => {
      const error = new NetworkError(
        'Connection failed',
        'test-provider',
        'quote',
        false
      );

      expect(error.isRetryable).toBe(false);
    });
  });

  describe('RateLimitError', () => {
    it('should create retryable rate limit error', () => {
      const error = new RateLimitError(
        'Too many requests',
        'test-provider',
        'quote',
        testContext,
        60
      );

      expect(error.message).toBe('Too many requests');
      expect(error.provider).toBe('test-provider');
      expect(error.operation).toBe('quote');
      expect(error.isRetryable).toBe(true);
      expect(error.retryAfter).toBe(60);
      expect(error.metadata.statusCode).toBe(429);
    });

    it('should serialize retryAfter in JSON', () => {
      const error = new RateLimitError(
        'Rate limited',
        'test-provider',
        'quote',
        undefined,
        120
      );

      const json = error.toJSON();
      expect(json.retryAfter).toBe(120);
    });
  });

  describe('AuthenticationError', () => {
    it('should create non-retryable authentication error', () => {
      const error = new AuthenticationError(
        'Invalid credentials',
        'test-provider',
        'quote',
        testContext
      );

      expect(error.isRetryable).toBe(false);
      expect(error.metadata.statusCode).toBeUndefined();
    });
  });

  describe('TimeoutError', () => {
    it('should create retryable timeout error', () => {
      const error = new TimeoutError(
        'Request timeout',
        'test-provider',
        'quote',
        30000,
        testContext
      );

      expect(error.isRetryable).toBe(true);
      expect(error.timeoutMs).toBe(30000);
    });

    it('should serialize timeoutMs in JSON', () => {
      const error = new TimeoutError(
        'Timeout',
        'test-provider',
        'quote',
        5000
      );

      const json = error.toJSON();
      expect(json.timeoutMs).toBe(5000);
    });
  });

  describe('CircuitBreakerError', () => {
    it('should create non-retryable circuit breaker error', () => {
      const error = new CircuitBreakerError(
        'Circuit breaker is OPEN',
        'test-provider',
        'quote',
        'OPEN',
        testContext
      );

      expect(error.isRetryable).toBe(false);
      expect(error.circuitBreakerState).toBe('OPEN');
    });

    it('should serialize circuit breaker state in JSON', () => {
      const error = new CircuitBreakerError(
        'Circuit breaker error',
        'test-provider',
        'quote',
        'HALF_OPEN'
      );

      const json = error.toJSON();
      expect(json.circuitBreakerState).toBe('HALF_OPEN');
    });
  });

  describe('ValidationError', () => {
    it('should create non-retryable validation error', () => {
      const error = new ValidationError(
        'Invalid weight',
        'test-provider',
        'quote',
        'parcel.weight',
        -1,
        testContext
      );

      expect(error.isRetryable).toBe(false);
      expect(error.field).toBe('parcel.weight');
      expect(error.value).toBe(-1);
      expect(error.metadata.statusCode).toBe(400);
    });

    it('should serialize field and value in JSON', () => {
      const error = new ValidationError(
        'Invalid field',
        'test-provider',
        'quote',
        'address.zip',
        'invalid-zip'
      );

      const json = error.toJSON();
      expect(json.field).toBe('address.zip');
      expect(json.value).toBe('invalid-zip');
    });
  });

  describe('classifyError', () => {
    it('should return ProviderError as-is', () => {
      const originalError = new NetworkError(
        'Test error',
        'test-provider',
        'quote'
      );

      const result = classifyError(originalError, 'test-provider', 'quote', testContext);
      expect(result).toBe(originalError);
    });

    it('should classify TypeError as NetworkError', () => {
      const fetchError = new TypeError('fetch failed');
      const result = classifyError(fetchError, 'test-provider', 'quote', testContext);

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.message).toBe('Network request failed');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify timeout errors', () => {
      const timeoutError = new Error('Request timeout occurred');
      const result = classifyError(timeoutError, 'test-provider', 'quote', testContext);

      expect(result).toBeInstanceOf(TimeoutError);
      expect(result.timeoutMs).toBe(30000);
    });

    it('should classify HTTP errors by status code', () => {
      // 500 error (retryable)
      const serverError = { statusCode: 500, message: 'Internal server error' };
      const result500 = classifyError(serverError, 'test-provider', 'quote', testContext);

      expect(result500).toBeInstanceOf(NetworkError);
      expect(result500.isRetryable).toBe(true);
      expect(result500.metadata.statusCode).toBe(500);

      // 429 error (rate limit)
      const rateLimitError = { status: 429, message: 'Too many requests' };
      const result429 = classifyError(rateLimitError, 'test-provider', 'quote', testContext);

      expect(result429).toBeInstanceOf(RateLimitError);
      expect(result429.isRetryable).toBe(true);

      // 401 error (authentication)
      const authError = { statusCode: 401, message: 'Unauthorized' };
      const result401 = classifyError(authError, 'test-provider', 'quote', testContext);

      expect(result401).toBeInstanceOf(AuthenticationError);
      expect(result401.isRetryable).toBe(false);

      // 400 error (client error, non-retryable)
      const clientError = { status: 400, message: 'Bad request' };
      const result400 = classifyError(clientError, 'test-provider', 'quote', testContext);

      expect(result400).toBeInstanceOf(NetworkError);
      expect(result400.isRetryable).toBe(false);
      expect(result400.metadata.statusCode).toBe(400);
    });

    it('should default to generic NetworkError', () => {
      const genericError = new Error('Generic error');
      const result = classifyError(genericError, 'test-provider', 'quote', testContext);

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.isRetryable).toBe(true);
    });
  });

  describe('createErrorContext', () => {
    it('should create context with timestamp', () => {
      const context = createErrorContext();
      expect(context.timestamp).toBeDefined();
      expect(typeof context.timestamp).toBe('string');
    });

    it('should merge base context', () => {
      const baseContext = {
        correlationId: 'test-id',
        userId: 'user-123'
      };

      const context = createErrorContext(baseContext);
      expect(context.correlationId).toBe('test-id');
      expect(context.userId).toBe('user-123');
      expect(context.timestamp).toBeDefined();
    });
  });

  describe('Error Context Builders', () => {
    it('should build context for different scenarios', () => {
      const context1 = createErrorContext({
        correlationId: 'req-123',
        userId: 'user-456'
      });

      expect(context1.correlationId).toBe('req-123');
      expect(context1.userId).toBe('user-456');
      expect(context1.timestamp).toBeDefined();

      const context2 = createErrorContext({
        provider: 'easypost',
        operation: 'quote'
      });

      expect(context2.provider).toBe('easypost');
      expect(context2.operation).toBe('quote');
    });
  });

  describe('HTTP Error Classification', () => {
    it('should classify server errors as retryable', () => {
      const error = ProviderError.fromHttpError(
        500,
        { message: 'Internal Server Error' },
        'test-provider',
        'quote',
        testContext
      );

      expect(error).toBeInstanceOf(NetworkError);
      expect(error.isRetryable).toBe(true);
    });

    it('should classify rate limit errors', () => {
      const error = ProviderError.fromHttpError(
        429,
        { message: 'Too Many Requests' },
        'test-provider',
        'quote',
        testContext
      );

      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.isRetryable).toBe(true);
    });

    it('should classify authentication errors', () => {
      const error = ProviderError.fromHttpError(
        401,
        { message: 'Unauthorized' },
        'test-provider',
        'quote',
        testContext
      );

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.isRetryable).toBe(false);
    });

    it('should classify client errors as non-retryable', () => {
      const error = ProviderError.fromHttpError(
        400,
        { message: 'Bad Request' },
        'test-provider',
        'quote',
        testContext
      );

      expect(error).toBeInstanceOf(NetworkError);
      expect(error.isRetryable).toBe(false);
    });

    it('should handle missing error message', () => {
      const error = ProviderError.fromHttpError(
        500,
        null,
        'test-provider',
        'quote'
      );

      expect(error.message).toBe('HTTP 500 error');
    });
  });

  describe('Error Metadata', () => {
    it('should include all required metadata fields', () => {
      const error = new NetworkError(
        'Test error',
        'test-provider',
        'quote',
        true,
        500,
        undefined,
        testContext
      );

      expect(error.metadata).toMatchObject({
        provider: 'test-provider',
        operation: 'quote',
        timestamp: expect.any(String),
        statusCode: 500,
        context: testContext
      });
    });

    it('should handle missing optional metadata', () => {
      const error = new ConfigurationError(
        'Config error',
        'test-provider'
      );

      expect(error.metadata.provider).toBe('test-provider');
      expect(error.metadata.operation).toBe('configuration');
      expect(error.metadata.timestamp).toBeDefined();
      expect(error.metadata.statusCode).toBeUndefined();
      // Context should always be defined with at least correlationId
      expect(error.metadata.context).toBeDefined();
      expect(error.metadata.context?.correlationId).toBeDefined();
    });
  });
});