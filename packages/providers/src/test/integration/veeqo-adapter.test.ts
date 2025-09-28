import { VeeqoAdapter } from '../../adapters/veeqo-adapter.js';
import { ShipmentInput } from '../../types.js';

// Mock fetch for integration tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('VeeqoAdapter Integration Tests', () => {
  let adapter: VeeqoAdapter;
  const originalApiKey = process.env.VEEQO_API_KEY;
  const originalBaseUrl = process.env.VEEQO_API_BASE;

  beforeAll(() => {
    // Set up test environment variables
    process.env.VEEQO_API_KEY = 'Vqt/test-api-key-for-integration-tests';
    process.env.VEEQO_API_BASE = 'https://api.veeqo.com';
  });

  beforeEach(() => {
    mockFetch.mockClear();
    adapter = new VeeqoAdapter();
  });

  afterAll(() => {
    // Restore original environment
    if (originalApiKey) {
      process.env.VEEQO_API_KEY = originalApiKey;
    } else {
      delete process.env.VEEQO_API_KEY;
    }

    if (originalBaseUrl) {
      process.env.VEEQO_API_BASE = originalBaseUrl;
    } else {
      delete process.env.VEEQO_API_BASE;
    }
  });

  describe('Real API Integration', () => {
    // These tests will only run if valid API credentials are provided
    const itIfCredentials = process.env.VEEQO_API_KEY?.includes('test') ? it.skip : it;

    itIfCredentials('should perform health check with real API', async () => {
      const isHealthy = await adapter.healthCheck();

      // If we get here without throwing, the API is accessible
      expect(typeof isHealthy).toBe('boolean');
    });

    itIfCredentials('should get rates with real allocation', async () => {
      const testInput: ShipmentInput = {
        to: {
          name: 'Integration Test Recipient',
          street1: '123 Test Street',
          city: 'Test City',
          state: 'CA',
          zip: '90210',
          country: 'US'
        },
        from: {
          name: 'Integration Test Sender',
          street1: '456 Sender Ave',
          city: 'Sender City',
          state: 'CA',
          zip: '90211',
          country: 'US'
        },
        parcel: {
          length: 12,
          width: 8,
          height: 6,
          weight: 2.5,
          distance_unit: 'in',
          mass_unit: 'lb'
        },
        veeqo: {
          allocationId: 12345 // This should be a real allocation ID for testing
        }
      };

      const quotes = await adapter.quote(testInput);
      expect(Array.isArray(quotes)).toBe(true);
    });
  });

  describe('API Request/Response Format Validation', () => {
    it('should send correctly formatted headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await adapter.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.veeqo.com/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer Vqt/test-api-key-for-integration-tests',
            'Content-Type': 'application/json',
            'User-Agent': 'multiship-providers/1.0'
          })
        })
      );
    });

    it('should handle allocation package request format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      // Mock a successful allocation package update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          available: [{
            carrier: 'UPS',
            service_carrier: 'UPS',
            service_id: 'ground',
            remote_shipment_id: 'rate_123',
            name: 'UPS Ground',
            base_rate: '12.50',
            currency: 'USD'
          }]
        })
      });

      const testInput: ShipmentInput = {
        to: { name: 'Test', street1: '123 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
        from: { name: 'Test', street1: '456 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
        parcel: { length: 10, width: 5, height: 5, weight: 1 },
        veeqo: { allocationId: 12345 }
      };

      await adapter.quote(testInput);

      // Verify allocation package was set with correct format
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.veeqo.com/allocations/12345/package',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            length: 10,
            width: 5,
            height: 5,
            weight: 1,
            length_units: 'in',
            weight_units: 'oz'
          })
        })
      );
    });

    it('should handle purchase request format', async () => {
      const mockResponse = {
        id: 'shipment_123',
        label_url: 'https://api.veeqo.com/labels/123.pdf',
        tracking_url: 'https://tracking.ups.com/123456'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await adapter.purchase('rate_123', 'shipment_456', 12345);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.veeqo.com/shipments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            allocation_id: 12345,
            remote_shipment_id: 'rate_123'
          })
        })
      );

      expect(result).toMatchObject({
        provider: 'veeqo',
        shipmentId: 'shipment_123',
        labelUrl: 'https://api.veeqo.com/labels/123.pdf',
        trackingUrl: 'https://tracking.ups.com/123456'
      });
    });
  });

  describe('Error Response Handling', () => {
    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      await expect(adapter.healthCheck())
        .rejects
        .toThrow('NetworkError');
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Map([['Retry-After', '30']])
      });

      await expect(adapter.healthCheck())
        .rejects
        .toThrow('RateLimitError');
    });

    it('should handle server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(adapter.healthCheck())
        .rejects
        .toThrow('NetworkError');
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      await expect(adapter.healthCheck())
        .rejects
        .toThrow('NetworkError');
    });
  });

  describe('Unit Conversions', () => {
    it('should convert centimeters to inches', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ available: [] }) });

      const testInput: ShipmentInput = {
        to: { name: 'Test', street1: '123 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
        from: { name: 'Test', street1: '456 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
        parcel: {
          length: 30,  // 30 cm
          width: 20,   // 20 cm
          height: 15,  // 15 cm
          weight: 2,   // 2 kg
          distance_unit: 'cm',
          mass_unit: 'kg'
        },
        veeqo: { allocationId: 12345 }
      };

      await adapter.quote(testInput);

      // Check that conversion was applied in the request
      const packageCall = mockFetch.mock.calls.find(
        call => call[0].includes('/allocations/12345/package')
      );

      expect(packageCall).toBeDefined();
      const requestBody = JSON.parse(packageCall[1].body);

      // Verify conversion: 30cm = 11.81in, 20cm = 7.87in, 15cm = 5.91in, 2kg = 70.55oz
      expect(requestBody.length).toBeCloseTo(11.81, 1);
      expect(requestBody.width).toBeCloseTo(7.87, 1);
      expect(requestBody.height).toBeCloseTo(5.91, 1);
      expect(requestBody.weight).toBeCloseTo(70.55, 1);
    });

    it('should convert pounds to ounces', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ available: [] }) });

      const testInput: ShipmentInput = {
        to: { name: 'Test', street1: '123 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
        from: { name: 'Test', street1: '456 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
        parcel: {
          length: 10,
          width: 5,
          height: 5,
          weight: 2,  // 2 pounds
          distance_unit: 'in',
          mass_unit: 'lb'
        },
        veeqo: { allocationId: 12345 }
      };

      await adapter.quote(testInput);

      const packageCall = mockFetch.mock.calls.find(
        call => call[0].includes('/allocations/12345/package')
      );

      const requestBody = JSON.parse(packageCall[1].body);
      expect(requestBody.weight).toBe(32); // 2 lb = 32 oz
    });
  });

  describe('Response Data Mapping', () => {
    it('should map rate response to RateQuote format', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const mockRates = [{
        carrier: 'FedEx',
        service_carrier: 'FedEx',
        service_id: '2day',
        remote_shipment_id: 'rate_456',
        name: 'FedEx 2Day',
        base_rate: '25.75',
        currency: 'USD',
        sub_carrier_id: 'fedex_express'
      }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ available: mockRates })
      });

      const testInput: ShipmentInput = {
        to: { name: 'Test', street1: '123 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
        from: { name: 'Test', street1: '456 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
        parcel: { length: 10, width: 5, height: 5, weight: 1 },
        veeqo: { allocationId: 12345 }
      };

      const quotes = await adapter.quote(testInput);
      const quote = quotes[0];

      expect(quote).toMatchObject({
        provider: 'veeqo',
        rateId: 'rate_456',
        service: '2day',
        carrier: 'FedEx',
        amount: 2575, // 25.75 * 100
        currency: 'USD',
        serviceType: 'FedEx 2Day',
        subCarrierId: 'fedex_express'
      });
    });

    it('should handle null sub_carrier_id', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const mockRates = [{
        carrier: 'UPS',
        service_carrier: 'UPS',
        service_id: 'ground',
        remote_shipment_id: 'rate_789',
        name: 'UPS Ground',
        base_rate: '10.00',
        currency: 'USD'
        // sub_carrier_id is missing
      }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ available: mockRates })
      });

      const testInput: ShipmentInput = {
        to: { name: 'Test', street1: '123 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
        from: { name: 'Test', street1: '456 St', city: 'City', state: 'ST', zip: '12345', country: 'US' },
        parcel: { length: 10, width: 5, height: 5, weight: 1 },
        veeqo: { allocationId: 12345 }
      };

      const quotes = await adapter.quote(testInput);
      expect(quotes[0].subCarrierId).toBeNull();
    });
  });

  describe('Network Resilience', () => {
    it('should retry on network failures', async () => {
      // First two calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({})
        });

      const result = await adapter.healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should respect retry configuration', async () => {
      // All calls fail
      mockFetch.mockRejectedValue(new Error('Persistent network error'));

      await expect(adapter.healthCheck())
        .rejects
        .toThrow();

      // Should have tried the configured number of times (default 3)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should implement exponential backoff', async () => {
      const startTime = Date.now();
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(adapter.healthCheck())
        .rejects
        .toThrow();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take some time due to backoff delays
      expect(duration).toBeGreaterThan(1000); // At least 1 second for retries
    });
  });
});