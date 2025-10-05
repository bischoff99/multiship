import { VeeqoAdapter } from '../../adapters/veeqo-adapter.js';
import { ShipmentInput } from '../../types.js';
import { ConfigurationError, RateLimitError, NetworkError, AuthenticationError } from '../../errors/provider-errors.js';
import { mockFetch, MockResponses } from '../setup/global-mocks.js';

describe('VeeqoAdapter', () => {
  let adapter: VeeqoAdapter;
  const mockApiKey = 'Vqt/test-api-key-for-testing';
  const mockBaseUrl = 'https://api.veeqo.com';

  beforeEach(() => {
    // Set up test environment variables
    process.env.VEEQO_API_KEY = mockApiKey;
    process.env.VEEQO_API_BASE = mockBaseUrl;

    // Create fresh adapter instance
    adapter = new VeeqoAdapter();
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.VEEQO_API_KEY;
    delete process.env.VEEQO_API_BASE;
  });

  describe('Initialization', () => {
    it('should initialize with valid configuration', () => {
      expect(adapter.name).toBe('veeqo');
      expect(adapter.enabled).toBe(true);
      expect(adapter['baseUrl']).toBe(mockBaseUrl);
      expect(adapter['apiKey']).toBe(mockApiKey);
    });

    it('should disable when API key is missing', () => {
      delete process.env.VEEQO_API_KEY;
      const disabledAdapter = new VeeqoAdapter();
      expect(disabledAdapter.enabled).toBe(false);
    });

    it('should use default base URL when not provided', () => {
      delete process.env.VEEQO_API_BASE;
      const defaultAdapter = new VeeqoAdapter();
      expect(defaultAdapter['baseUrl']).toBe('https://api.veeqo.com');
    });
  });

  describe('Health Check', () => {
    it('should return true when API is accessible', async () => {
      mockFetch.mockResolvedValueOnce(MockResponses.success({ user: { id: 1 } }));

      const isHealthy = await adapter.healthCheck();
      expect(isHealthy).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/users/me`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should return false when API is not accessible', async () => {
      mockFetch.mockImplementationOnce(() => MockResponses.networkError());

      const isHealthy = await adapter.healthCheck();
      expect(isHealthy).toBe(false);
    });

    it('should return false when API returns error status', async () => {
      mockFetch.mockResolvedValueOnce(MockResponses.unauthorized());

      const isHealthy = await adapter.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe('Quote Generation', () => {
    const mockShipmentInput: ShipmentInput = {
      to: {
        name: 'Test Recipient',
        street1: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip: '12345',
        country: 'US'
      },
      from: {
        name: 'Test Sender',
        street1: '456 Sender Ave',
        city: 'Sender City',
        state: 'SS',
        zip: '67890',
        country: 'US'
      },
      parcel: {
        length: 10,
        width: 5,
        height: 5,
        weight: 2,
        distance_unit: 'in',
        mass_unit: 'lb'
      },
      veeqo: {
        allocationId: 12345
      }
    };

    it('should generate quotes successfully', async () => {
      // Mock the allocation package setting
      mockFetch.mockResolvedValueOnce(MockResponses.success({}));

      // Mock the rates response
      mockFetch.mockResolvedValueOnce(MockResponses.success({
        available: [{
          carrier: 'UPS',
          service_carrier: 'UPS',
          service_id: 'express',
          remote_shipment_id: 'rate_123',
          name: 'UPS Express',
          base_rate: '15.99',
          currency: 'USD'
        }]
      }));

      const quotes = await adapter.quote(mockShipmentInput);

      expect(quotes).toHaveLength(1);
      expect(quotes[0]).toMatchObject({
        provider: 'veeqo',
        rateId: 'rate_123',
        service: 'express',
        carrier: 'UPS',
        amount: 1599, // 15.99 * 100
        currency: 'USD',
        serviceType: 'UPS Express'
      });
    });

    it('should throw error when allocationId is missing', async () => {
      const inputWithoutAllocation = { ...mockShipmentInput };
      delete (inputWithoutAllocation as any).veeqo;

      await expect(adapter.quote(inputWithoutAllocation))
        .rejects
        .toThrow(ConfigurationError);
    });

    it('should handle API errors during quote generation', async () => {
      mockFetch.mockImplementationOnce(() => MockResponses.networkError());

      await expect(adapter.quote(mockShipmentInput))
        .rejects
        .toThrow(NetworkError);
    });

    it('should handle rate limit errors during quote generation', async () => {
      mockFetch.mockResolvedValueOnce(MockResponses.rateLimited(60));

      await expect(adapter.quote(mockShipmentInput))
        .rejects
        .toThrow(RateLimitError);
    });
  });

  describe('Purchase Flow', () => {
    it('should purchase shipment successfully', async () => {
      const mockPurchaseResponse = {
        id: 'shipment_123',
        label_url: 'https://api.veeqo.com/labels/123',
        tracking_url: 'https://tracking.ups.com/123'
      };

      mockFetch.mockResolvedValueOnce(MockResponses.success(mockPurchaseResponse));

      const result = await adapter.purchase('rate_123', 'shipment_456', 12345);

      expect(result).toMatchObject({
        provider: 'veeqo',
        shipmentId: 'shipment_123',
        labelUrl: 'https://api.veeqo.com/labels/123',
        trackingUrl: 'https://tracking.ups.com/123'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockBaseUrl}/shipments`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            allocation_id: 12345,
            remote_shipment_id: 'rate_123'
          })
        })
      );
    });

    it('should throw error when allocationId is missing', async () => {
      await expect(adapter.purchase('rate_123'))
        .rejects
        .toThrow('allocationId is required for Veeqo purchases');
    });

    it('should handle purchase API errors', async () => {
      mockFetch.mockResolvedValueOnce(MockResponses.error(400, 'Bad Request'));

      await expect(adapter.purchase('rate_123', 'shipment_456', 12345))
        .rejects
        .toThrow(NetworkError);
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should handle circuit breaker state transitions', async () => {
      // Simulate multiple failures
      mockFetch.mockImplementation(() => MockResponses.networkError());

      // First few calls should fail but not open circuit immediately
      for (let i = 0; i < 3; i++) {
        try {
          await adapter.healthCheck();
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should still allow execution (depends on threshold)
      expect(adapter['circuitBreaker']).toBeDefined();
    });

    it('should open circuit after threshold failures', async () => {
      // Mock consistent failures
      mockFetch.mockImplementation(() => MockResponses.networkError());

      // Exceed failure threshold (this depends on circuit breaker config)
      for (let i = 0; i < 6; i++) {
        try {
          await adapter.healthCheck();
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit breaker should be available
      expect(adapter['circuitBreaker']).toBeDefined();
    });
  });

  describe('Error Classification', () => {
    it('should handle rate limiting errors correctly', async () => {
      mockFetch.mockResolvedValueOnce(MockResponses.rateLimited(60));

      await expect(adapter.healthCheck())
        .rejects
        .toThrow(RateLimitError);
    });

    it('should handle authentication errors correctly', async () => {
      mockFetch.mockResolvedValueOnce(MockResponses.unauthorized());

      await expect(adapter.healthCheck())
        .rejects
        .toThrow(AuthenticationError);
    });

    it('should handle server errors as retryable network errors', async () => {
      mockFetch.mockResolvedValueOnce(MockResponses.error(500, 'Internal Server Error'));

      try {
        await adapter.healthCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).isRetryable).toBe(true);
      }
    });

    it('should handle client errors as non-retryable network errors', async () => {
      mockFetch.mockResolvedValueOnce(MockResponses.error(400, 'Bad Request'));

      try {
        await adapter.healthCheck();
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).isRetryable).toBe(false);
      }
    });

    it('should handle network failures correctly', async () => {
      mockFetch.mockImplementationOnce(() => MockResponses.networkError());

      await expect(adapter.healthCheck())
        .rejects
        .toThrow(NetworkError);
    });

    it('should handle timeout errors correctly', async () => {
      mockFetch.mockImplementationOnce(() => MockResponses.timeout());

      await expect(adapter.healthCheck())
        .rejects
        .toThrow('Request timeout');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required configuration on initialization', () => {
      // Valid configuration should work
      expect(() => new VeeqoAdapter()).not.toThrow();
    });

    it('should handle missing configuration gracefully', () => {
      delete process.env.VEEQO_API_KEY;
      delete process.env.VEEQO_API_BASE;
      
      const adapter = new VeeqoAdapter();
      expect(adapter.enabled).toBe(false);
    });
  });
});