import { VeeqoAdapter } from '../../adapters/veeqo-adapter.js';
import { ShipmentInput } from '../../types.js';
import { ConfigurationError } from '../../errors/provider-errors.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('VeeqoAdapter', () => {
  let adapter: VeeqoAdapter;
  const mockApiKey = 'Vqt/test-api-key-for-testing';
  const mockBaseUrl = 'https://api.veeqo.com';

  beforeEach(() => {
    // Set up test environment variables
    process.env.VEEQO_API_KEY = mockApiKey;
    process.env.VEEQO_API_BASE = mockBaseUrl;

    // Clear all mocks
    mockFetch.mockClear();

    // Set up fetch mock for successful requests
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    // Create fresh adapter instance
    adapter = new VeeqoAdapter();
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.VEEQO_API_KEY;
    delete process.env.VEEQO_API_BASE;
    mockFetch.mockClear();
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

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
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const isHealthy = await adapter.healthCheck();
      expect(isHealthy).toBe(false);
    });

    it('should return false when API returns error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      // Mock the rates response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          available: [{
            carrier: 'UPS',
            service_carrier: 'UPS',
            service_id: 'express',
            remote_shipment_id: 'rate_123',
            name: 'UPS Express',
            base_rate: '15.99',
            currency: 'USD'
          }]
        })
      });

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
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      await expect(adapter.quote(mockShipmentInput))
        .rejects
        .toThrow();
    });
  });

  describe('Purchase Flow', () => {
    it('should purchase shipment successfully', async () => {
      const mockPurchaseResponse = {
        id: 'shipment_123',
        label_url: 'https://api.veeqo.com/labels/123',
        tracking_url: 'https://tracking.ups.com/123'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPurchaseResponse
      });

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
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      });

      await expect(adapter.purchase('rate_123', 'shipment_456', 12345))
        .rejects
        .toThrow();
    });
  });

  describe('Circuit Breaker', () => {
    it('should handle circuit breaker state transitions', async () => {
      // Simulate multiple failures
      mockFetch.mockRejectedValue(new Error('Network error'));

      // First few calls should fail but not open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await adapter.healthCheck();
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should still be closed
      expect(adapter['circuitBreaker'].state).toBe('CLOSED');
    });

    it('should open circuit after threshold failures', async () => {
      // Mock consistent failures
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Exceed failure threshold (default is 5)
      for (let i = 0; i < 6; i++) {
        try {
          await adapter.healthCheck();
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should be open
      expect(adapter['circuitBreaker'].state).toBe('OPEN');
    });
  });

  describe('Error Classification', () => {
    it('should handle rate limiting errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '60']])
      });

      await expect(adapter.healthCheck())
        .rejects
        .toThrow('RateLimitError');
    });

    it('should handle server errors as retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await expect(adapter.healthCheck())
        .rejects
        .toThrow('NetworkError');
    });

    it('should handle client errors as non-retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400
      });

      await expect(adapter.healthCheck())
        .rejects
        .toThrow('NetworkError');
    });
  });
});