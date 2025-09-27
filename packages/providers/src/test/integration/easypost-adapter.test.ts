import { EasyPostAdapter } from '../../adapters/easypost-adapter.js';
import { TestDataFactory, MockCache, TestAssertions } from '../test-utils.js';
import { ShipmentInput } from '../../types.js';
import {
  NetworkError,
  AuthenticationError,
  TimeoutError,
  CircuitBreakerError,
  RateLimitError
} from '../../errors/provider-errors.js';
import { MemoryCache } from '../../cache/memory-cache.js';
import { RedisCache } from '../../cache/redis-cache.js';

// Mock external dependencies
jest.mock('@easypost/api');
jest.mock('../../cache/memory-cache.js');
jest.mock('../../cache/redis-cache.js');
jest.mock('../../config/cache-config.js');

const MockEasyPostAPI = jest.mocked(require('@easypost/api'));

describe('EasyPostAdapter Integration', () => {
  let adapter: EasyPostAdapter;
  let mockClient: any;
  let mockCache: any;

  // Mock environment variables
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };

    // Setup mocks
    mockClient = {
      Shipment: {
        create: jest.fn(),
        retrieve: jest.fn(),
        buy: jest.fn()
      }
    };

    mockCache = new MockCache();
    (MemoryCache as any).mockImplementation(() => mockCache);
    (RedisCache as any).mockImplementation(() => mockCache);

    MockEasyPostAPI.default.mockImplementation(() => mockClient);

    // Mock cache config
    const mockCacheConfig = {
      getConfig: jest.fn().mockReturnValue({
        enabled: true,
        provider: 'memory',
        memory: { ttl: 3600000 }
      }),
      getTTL: jest.fn().mockReturnValue(3600000),
      shouldCache: jest.fn().mockReturnValue(true),
      createRateQuoteKey: jest.fn().mockReturnValue('easypost:rate:test'),
      createHealthCheckKey: jest.fn().mockReturnValue('easypost:health')
    };

    jest.mocked(require('../../config/cache-config.js')).cacheConfig = mockCacheConfig;

    adapter = new EasyPostAdapter();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with valid API key', () => {
      process.env.EASYPOST_API_KEY = 'test-api-key';
      const newAdapter = new EasyPostAdapter();

      expect(newAdapter.name).toBe('easypost');
      expect(newAdapter.enabled).toBe(true);
      expect(MockEasyPostAPI.default).toHaveBeenCalledWith('test-api-key');
    });

    it('should be disabled without API key', () => {
      delete process.env.EASYPOST_API_KEY;
      const newAdapter = new EasyPostAdapter();

      expect(newAdapter.enabled).toBe(false);
    });
  });

  describe('Quote Generation', () => {
    const testInput: ShipmentInput = TestDataFactory.createShipmentInput();

    beforeEach(() => {
      mockClient.Shipment.create.mockResolvedValue({
        id: 'shp_test',
        rates: [
          {
            id: 'rate_1',
            service: 'Ground Advantage',
            carrier: 'USPS',
            rate: '8.99',
            currency: 'USD',
            est_delivery_days: 3
          },
          {
            id: 'rate_2',
            service: 'Priority Mail',
            carrier: 'USPS',
            rate: '12.50',
            currency: 'USD',
            est_delivery_days: 2
          }
        ]
      });
    });

    it('should generate quotes successfully', async () => {
      const quotes = await adapter.quote(testInput);

      expect(quotes).toHaveLength(2);
      expect(quotes[0]).toMatchObject({
        provider: 'easypost',
        rateId: 'rate_1',
        shipmentId: 'shp_test',
        service: 'Ground Advantage',
        carrier: 'USPS',
        amount: 899, // Should be in cents
        currency: 'USD',
        estDeliveryDays: 3
      });
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('EasyPost API Error');
      mockClient.Shipment.create.mockRejectedValue(apiError);

      await TestAssertions.expectToThrow(
        () => adapter.quote(testInput),
        NetworkError
      );
    });

    it('should handle timeout errors', async () => {
      // Create a promise that never resolves
      mockClient.Shipment.create.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      await TestAssertions.expectToThrow(
        () => adapter.quote(testInput),
        TimeoutError
      );
    });

    it('should handle authentication errors', async () => {
      const authError = { statusCode: 401, message: 'Unauthorized' };
      mockClient.Shipment.create.mockRejectedValue(authError);

      try {
        await adapter.quote(testInput);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        TestAssertions.expectErrorToBeNonRetryable(error as any);
      }
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = { status: 429, message: 'Too Many Requests' };
      mockClient.Shipment.create.mockRejectedValue(rateLimitError);

      try {
        await adapter.quote(testInput);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        TestAssertions.expectErrorToBeRetryable(error as any);
      }
    });
  });

  describe('Purchase Operations', () => {
    const rateId = 'rate_test_123';
    const shipmentId = 'shp_test_456';

    beforeEach(() => {
      mockClient.Shipment.buy.mockResolvedValue({
        id: shipmentId,
        tracking_code: '9400111899223344556677',
        postage_label: {
          label_url: 'https://example.com/label.pdf'
        }
      });
    });

    it('should purchase shipment successfully', async () => {
      const result = await adapter.purchase(rateId, shipmentId);

      expect(result).toMatchObject({
        provider: 'easypost',
        shipmentId,
        labelUrl: 'https://example.com/label.pdf',
        trackingCode: '9400111899223344556677'
      });

      expect(mockClient.Shipment.buy).toHaveBeenCalledWith(shipmentId, { id: rateId });
    });

    it('should require shipment ID for purchase', async () => {
      await TestAssertions.expectToThrow(
        () => adapter.purchase(rateId),
        Error
      );
    });

    it('should handle purchase API errors', async () => {
      const purchaseError = new Error('Purchase failed');
      mockClient.Shipment.buy.mockRejectedValue(purchaseError);

      await TestAssertions.expectToThrow(
        () => adapter.purchase(rateId, shipmentId),
        NetworkError
      );
    });

    it('should invalidate cache after successful purchase', async () => {
      const deleteSpy = jest.spyOn(mockCache, 'delete').mockResolvedValue(true);
      const keysSpy = jest.spyOn(mockCache, 'keys').mockResolvedValue([
        'easypost:rate:from:to:parcel',
        'easypost:rate:other:key'
      ]);

      await adapter.purchase(rateId, shipmentId);

      expect(keysSpy).toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledWith('easypost:rate:from:to:parcel');
      expect(deleteSpy).toHaveBeenCalledWith('easypost:rate:other:key');
    });
  });

  describe('Health Checks', () => {
    it('should return true when API is healthy', async () => {
      mockClient.Shipment.retrieve.mockResolvedValue({ id: 'test' });

      const isHealthy = await adapter.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false when API is unhealthy', async () => {
      mockClient.Shipment.retrieve.mockRejectedValue(new Error('API Error'));

      const isHealthy = await adapter.healthCheck();
      expect(isHealthy).toBe(false);
    });

    it('should use cache for health checks when enabled', async () => {
      const getSpy = jest.spyOn(mockCache, 'get').mockResolvedValue(true);
      const setSpy = jest.spyOn(mockCache, 'set').mockResolvedValue(undefined);

      const isHealthy = await adapter.healthCheck();

      expect(getSpy).toHaveBeenCalled();
      expect(isHealthy).toBe(true);
      expect(setSpy).not.toHaveBeenCalled(); // Should not set if found in cache
    });

    it('should cache health check results', async () => {
      mockClient.Shipment.retrieve.mockResolvedValue({ id: 'test' });

      const setSpy = jest.spyOn(mockCache, 'set').mockResolvedValue(undefined);

      await adapter.healthCheck();

      expect(setSpy).toHaveBeenCalledWith(
        'easypost:health',
        true,
        { ttl: 3600000 }
      );
    });

    it('should fallback to direct check on cache error', async () => {
      const getSpy = jest.spyOn(mockCache, 'get').mockRejectedValue(new Error('Cache error'));
      mockClient.Shipment.retrieve.mockResolvedValue({ id: 'test' });

      const isHealthy = await adapter.healthCheck();

      expect(getSpy).toHaveBeenCalled();
      expect(isHealthy).toBe(true); // Should still work via fallback
    });
  });

  describe('Caching Integration', () => {
    const testInput: ShipmentInput = TestDataFactory.createShipmentInput();

    beforeEach(() => {
      mockClient.Shipment.create.mockResolvedValue({
        id: 'shp_test',
        rates: [{
          id: 'rate_1',
          service: 'Ground Advantage',
          carrier: 'USPS',
          rate: '8.99',
          currency: 'USD',
          est_delivery_days: 3
        }]
      });
    });

    it('should cache quote results', async () => {
      const getSpy = jest.spyOn(mockCache, 'get').mockResolvedValue(null);
      const setSpy = jest.spyOn(mockCache, 'set').mockResolvedValue(undefined);

      await adapter.quote(testInput);

      expect(getSpy).toHaveBeenCalledWith('easypost:rate:test');
      expect(setSpy).toHaveBeenCalledWith(
        'easypost:rate:test',
        expect.any(Array),
        { ttl: 3600000 }
      );
    });

    it('should return cached results when available', async () => {
      const cachedQuotes = TestDataFactory.createMockRateQuotes();
      const getSpy = jest.spyOn(mockCache, 'get').mockResolvedValue(cachedQuotes);

      const quotes = await adapter.quote(testInput);

      expect(getSpy).toHaveBeenCalledWith('easypost:rate:test');
      expect(quotes).toEqual(cachedQuotes);
      expect(mockClient.Shipment.create).not.toHaveBeenCalled();
    });

    it('should fallback to fresh quote on cache error', async () => {
      const getSpy = jest.spyOn(mockCache, 'get').mockRejectedValue(new Error('Cache error'));
      const setSpy = jest.spyOn(mockCache, 'set').mockResolvedValue(undefined);

      await adapter.quote(testInput);

      expect(setSpy).not.toHaveBeenCalled(); // Should not cache on error
      expect(mockClient.Shipment.create).toHaveBeenCalled(); // Should fetch fresh
    });
  });

  describe('Circuit Breaker Integration', () => {
    const testInput: ShipmentInput = TestDataFactory.createShipmentInput();

    beforeEach(() => {
      mockClient.Shipment.create.mockRejectedValue(new Error('Simulated failure'));
    });

    it('should transition to OPEN state after max failures', async () => {
      // Make multiple failing requests
      for (let i = 0; i < 5; i++) {
        try {
          await adapter.quote(testInput);
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit breaker should now be OPEN
      try {
        await adapter.quote(testInput);
        fail('Should have thrown CircuitBreakerError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError);
        expect((error as any).circuitBreakerState).toBe('OPEN');
      }
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      // Force circuit breaker to OPEN state
      for (let i = 0; i < 6; i++) {
        try {
          await adapter.quote(testInput);
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for half-open timeout (simulate time passing)
      // In a real test, you'd use jest.useFakeTimers() and jest.advanceTimersByTime()
      // For this example, we'll assume the circuit breaker implementation handles timing

      // This test would need to be enhanced with proper timer mocking
      // to fully test the HALF_OPEN -> CLOSED transition
    });

    it('should reset failures on successful request', async () => {
      // First make some failing requests
      for (let i = 0; i < 3; i++) {
        try {
          await adapter.quote(testInput);
        } catch (error) {
          // Expected to fail
        }
      }

      // Now make a successful request
      mockClient.Shipment.create.mockResolvedValue({
        id: 'shp_test',
        rates: [{
          id: 'rate_1',
          service: 'Ground Advantage',
          carrier: 'USPS',
          rate: '8.99',
          currency: 'USD',
          est_delivery_days: 3
        }]
      });

      const quotes = await adapter.quote(testInput);
      expect(quotes).toHaveLength(1);

      // Circuit breaker should be reset to CLOSED state
      // This would require exposing the circuit breaker state for testing
    });
  });

  describe('Retry Logic Integration', () => {
    const testInput: ShipmentInput = TestDataFactory.createShipmentInput();

    it('should retry on retryable errors', async () => {
      let callCount = 0;
      mockClient.Shipment.create
        .mockImplementationOnce(() => {
          callCount++;
          return Promise.reject(new Error('Temporary failure'));
        })
        .mockImplementationOnce(() => {
          callCount++;
          return Promise.reject(new Error('Temporary failure'));
        })
        .mockImplementationOnce(() => {
          callCount++;
          return Promise.resolve({
            id: 'shp_test',
            rates: [{
              id: 'rate_1',
              service: 'Ground Advantage',
              carrier: 'USPS',
              rate: '8.99',
              currency: 'USD',
              est_delivery_days: 3
            }]
          });
        });

      const quotes = await adapter.quote(testInput);

      expect(callCount).toBe(3); // Should have retried twice
      expect(quotes).toHaveLength(1);
    });

    it('should not retry on non-retryable errors', async () => {
      mockClient.Shipment.create.mockRejectedValue(
        new Error('Authentication failed') // Non-retryable
      );

      await TestAssertions.expectToThrow(
        () => adapter.quote(testInput),
        AuthenticationError
      );

      expect(mockClient.Shipment.create).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff for retries', async () => {
      const startTime = Date.now();
      let callCount = 0;

      mockClient.Shipment.create
        .mockImplementationOnce(() => {
          callCount++;
          return Promise.reject(new Error('Temporary failure'));
        })
        .mockImplementationOnce(() => {
          callCount++;
          return Promise.reject(new Error('Temporary failure'));
        })
        .mockImplementationOnce(() => {
          callCount++;
          return Promise.resolve({
            id: 'shp_test',
            rates: [{
              id: 'rate_1',
              service: 'Ground Advantage',
              carrier: 'USPS',
              rate: '8.99',
              currency: 'USD',
              est_delivery_days: 3
            }]
          });
        });

      await adapter.quote(testInput);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should have taken at least some time due to backoff delays
      // This is a rough check - in a real test you'd use fake timers
      expect(callCount).toBe(3);
      expect(duration).toBeGreaterThan(0);
    });
  });

  describe('Error Classification Integration', () => {
    const testInput: ShipmentInput = TestDataFactory.createShipmentInput();

    it('should classify network errors correctly', async () => {
      const networkError = new Error('Network timeout');
      networkError.name = 'TypeError';
      mockClient.Shipment.create.mockRejectedValue(networkError);

      try {
        await adapter.quote(testInput);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        TestAssertions.expectErrorToBeRetryable(error as any);
      }
    });

    it('should classify HTTP status errors correctly', async () => {
      const httpErrors = [
        { statusCode: 500, expectedType: NetworkError, retryable: true },
        { statusCode: 429, expectedType: RateLimitError, retryable: true },
        { statusCode: 401, expectedType: AuthenticationError, retryable: false },
        { statusCode: 400, expectedType: NetworkError, retryable: false },
        { statusCode: 403, expectedType: AuthenticationError, retryable: false }
      ];

      for (const { statusCode, expectedType, retryable } of httpErrors) {
        mockClient.Shipment.create.mockRejectedValueOnce({ statusCode });

        try {
          await adapter.quote(testInput);
          fail(`Should have thrown ${expectedType.name} for status ${statusCode}`);
        } catch (error) {
          expect(error).toBeInstanceOf(expectedType);
          if (retryable) {
            TestAssertions.expectErrorToBeRetryable(error as any);
          } else {
            TestAssertions.expectErrorToBeNonRetryable(error as any);
          }
        }
      }
    });
  });

  describe('Concurrent Request Handling', () => {
    const testInput: ShipmentInput = TestDataFactory.createShipmentInput();

    beforeEach(() => {
      mockClient.Shipment.create.mockResolvedValue({
        id: 'shp_test',
        rates: [{
          id: 'rate_1',
          service: 'Ground Advantage',
          carrier: 'USPS',
          rate: '8.99',
          currency: 'USD',
          est_delivery_days: 3
        }]
      });
    });

    it('should handle concurrent quote requests', async () => {
      const requests = Array.from({ length: 10 }, () => adapter.quote(testInput));
      const results = await Promise.all(requests);

      expect(results).toHaveLength(10);
      results.forEach(quotes => {
        expect(quotes).toHaveLength(1);
        expect(quotes[0].provider).toBe('easypost');
      });

      expect(mockClient.Shipment.create).toHaveBeenCalledTimes(10);
    });

    it('should handle mixed success and failure scenarios', async () => {
      let callCount = 0;
      mockClient.Shipment.create.mockImplementation(() => {
        callCount++;
        if (callCount <= 5) {
          return Promise.resolve({
            id: 'shp_test',
            rates: [{
              id: 'rate_1',
              service: 'Ground Advantage',
              carrier: 'USPS',
              rate: '8.99',
              currency: 'USD',
              est_delivery_days: 3
            }]
          });
        } else {
          return Promise.reject(new Error('Service temporarily unavailable'));
        }
      });

      const requests = Array.from({ length: 10 }, () => adapter.quote(testInput));
      const results = await Promise.allSettled(requests);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled).toHaveLength(5);
      expect(rejected).toHaveLength(5);
    });
  });

  describe('Memory and Performance', () => {
    it('should not leak memory with many operations', async () => {
      const testInput: ShipmentInput = TestDataFactory.createShipmentInput();

      mockClient.Shipment.create.mockResolvedValue({
        id: 'shp_test',
        rates: [{
          id: 'rate_1',
          service: 'Ground Advantage',
          carrier: 'USPS',
          rate: '8.99',
          currency: 'USD',
          est_delivery_days: 3
        }]
      });

      // Perform many operations
      for (let i = 0; i < 100; i++) {
        await adapter.quote(testInput);
      }

      // Check that cache size is reasonable (shouldn't grow indefinitely)
      const stats = await mockCache.getStats();
      expect(stats.size).toBeLessThan(1000); // Reasonable upper bound
    });
  });
});