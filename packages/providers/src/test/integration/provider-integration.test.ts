import { ProviderFactory } from '../../factory.js';
import { TestDataFactory, MockProviderAdapter, MockCache } from '../test-utils.js';
import { ShipmentInput, RateQuote, PurchaseResult } from '../../types.js';
import { ProviderError, NetworkError, RateLimitError } from '../../errors/provider-errors.js';

describe('Provider Integration Tests', () => {
  let providerFactory: ProviderFactory;
  let mockProviders: Map<string, MockProviderAdapter>;
  let mockCache: MockCache;

  beforeEach(() => {
    // Create mock providers
    mockProviders = new Map([
      ['easypost', new MockProviderAdapter('easypost')],
      ['shippo', new MockProviderAdapter('shippo')],
      ['veeqo', new MockProviderAdapter('veeqo')]
    ]);

    // Create mock cache
    mockCache = new MockCache();

    // Create provider factory with mock providers
    providerFactory = new ProviderFactory();
    
    // Replace real providers with mocks
    (providerFactory as any).providers = mockProviders;
    (providerFactory as any).cache = mockCache;
  });

  afterEach(() => {
    mockCache.clear();
  });

  describe('Provider Factory', () => {
    it('should return all enabled providers', () => {
      const providers = providerFactory.getAllProviders();
      expect(providers).toHaveLength(3);
      expect(providers.map(p => p.name)).toEqual(['easypost', 'shippo', 'veeqo']);
    });

    it('should return specific provider by name', () => {
      const easypost = providerFactory.getProvider('easypost');
      expect(easypost).toBeDefined();
      expect(easypost?.name).toBe('easypost');
    });

    it('should return null for non-existent provider', () => {
      const nonExistent = providerFactory.getProvider('non-existent');
      expect(nonExistent).toBeNull();
    });

    it('should return null for disabled provider', () => {
      const disabledProvider = new MockProviderAdapter('disabled', false);
      mockProviders.set('disabled', disabledProvider);
      
      const provider = providerFactory.getProvider('disabled');
      expect(provider).toBeNull();
    });
  });

  describe('Quote Operations', () => {
    let shipmentInput: ShipmentInput;

    beforeEach(() => {
      shipmentInput = TestDataFactory.createShipmentInput();
    });

    it('should get quotes from all providers', async () => {
      const quotes = await providerFactory.getAllQuotes(shipmentInput);
      
      expect(quotes).toHaveLength(9); // 3 providers × 3 quotes each
      expect(quotes.every(q => q.provider === 'easypost' || q.provider === 'shippo' || q.provider === 'veeqo')).toBe(true);
    });

    it('should handle provider failures gracefully', async () => {
      // Make one provider fail
      mockProviders.get('easypost')?.setFailureMode('network', true);
      
      const quotes = await providerFactory.getAllQuotes(shipmentInput);
      
      // Should still get quotes from working providers
      expect(quotes).toHaveLength(6); // 2 providers × 3 quotes each
      expect(quotes.every(q => q.provider !== 'easypost')).toBe(true);
    });

    it('should cache quotes correctly', async () => {
      // First call
      const quotes1 = await providerFactory.getAllQuotes(shipmentInput);
      expect(quotes1).toHaveLength(9);
      
      // Second call should use cache
      const quotes2 = await providerFactory.getAllQuotes(shipmentInput);
      expect(quotes2).toHaveLength(9);
      
      // Verify cache was used
      const cacheStats = await mockCache.getStats();
      expect(cacheStats.hits).toBeGreaterThan(0);
    });

    it('should handle rate limiting', async () => {
      // Make all providers rate limited
      mockProviders.forEach(provider => {
        provider.setFailureMode('rateLimit', true);
      });
      
      const quotes = await providerFactory.getAllQuotes(shipmentInput);
      expect(quotes).toHaveLength(0);
    });

    it('should handle authentication errors', async () => {
      // Make one provider fail with auth error
      mockProviders.get('shippo')?.setFailureMode('auth', true);
      
      const quotes = await providerFactory.getAllQuotes(shipmentInput);
      
      // Should still get quotes from other providers
      expect(quotes).toHaveLength(6); // 2 providers × 3 quotes each
      expect(quotes.every(q => q.provider !== 'shippo')).toBe(true);
    });

    it('should handle timeout errors', async () => {
      // Make one provider timeout
      mockProviders.get('veeqo')?.setFailureMode('timeout', true);
      
      const quotes = await providerFactory.getAllQuotes(shipmentInput);
      
      // Should still get quotes from other providers
      expect(quotes).toHaveLength(6); // 2 providers × 3 quotes each
      expect(quotes.every(q => q.provider !== 'veeqo')).toBe(true);
    });

    it('should handle validation errors', async () => {
      // Make one provider fail with validation error
      mockProviders.get('easypost')?.setFailureMode('validation', true);
      
      const quotes = await providerFactory.getAllQuotes(shipmentInput);
      
      // Should still get quotes from other providers
      expect(quotes).toHaveLength(6); // 2 providers × 3 quotes each
      expect(quotes.every(q => q.provider !== 'easypost')).toBe(true);
    });
  });

  describe('Purchase Operations', () => {
    let rateQuote: RateQuote;

    beforeEach(() => {
      rateQuote = TestDataFactory.createRateQuote();
    });

    it('should purchase from specific provider', async () => {
      const result = await providerFactory.purchaseShipment(rateQuote);
      
      expect(result).toBeDefined();
      expect(result.provider).toBe(rateQuote.provider);
      expect(result.shipmentId).toBeDefined();
      expect(result.labelUrl).toBeDefined();
      expect(result.trackingCode).toBeDefined();
    });

    it('should handle purchase failures', async () => {
      // Make the provider fail
      mockProviders.get(rateQuote.provider)?.setFailureMode('network', true);
      
      await expect(providerFactory.purchaseShipment(rateQuote))
        .rejects.toThrow();
    });

    it('should invalidate cache after purchase', async () => {
      // First, get quotes to populate cache
      const shipmentInput = TestDataFactory.createShipmentInput();
      await providerFactory.getAllQuotes(shipmentInput);
      
      const initialCacheStats = await mockCache.getStats();
      expect(initialCacheStats.sets).toBeGreaterThan(0);
      
      // Purchase a shipment
      await providerFactory.purchaseShipment(rateQuote);
      
      // Cache should be invalidated
      const finalCacheStats = await mockCache.getStats();
      expect(finalCacheStats.deletes).toBeGreaterThan(0);
    });
  });

  describe('Health Check Operations', () => {
    it('should check health of all providers', async () => {
      const healthStatus = await providerFactory.checkAllProviderHealth();
      
      expect(healthStatus).toHaveProperty('easypost');
      expect(healthStatus).toHaveProperty('shippo');
      expect(healthStatus).toHaveProperty('veeqo');
      expect(healthStatus.easypost).toBe(true);
      expect(healthStatus.shippo).toBe(true);
      expect(healthStatus.veeqo).toBe(true);
    });

    it('should handle unhealthy providers', async () => {
      // Make one provider unhealthy
      mockProviders.get('easypost')?.setHealthCheck(false);
      
      const healthStatus = await providerFactory.checkAllProviderHealth();
      
      expect(healthStatus.easypost).toBe(false);
      expect(healthStatus.shippo).toBe(true);
      expect(healthStatus.veeqo).toBe(true);
    });

    it('should handle provider health check failures', async () => {
      // Make one provider fail health check
      mockProviders.get('shippo')?.setFailureMode('network', true);
      
      const healthStatus = await providerFactory.checkAllProviderHealth();
      
      expect(healthStatus.easypost).toBe(true);
      expect(healthStatus.shippo).toBe(false);
      expect(healthStatus.veeqo).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should classify errors correctly', async () => {
      const shipmentInput = TestDataFactory.createShipmentInput();
      
      // Test different error types
      const errorTypes = ['network', 'rateLimit', 'auth', 'timeout', 'validation'];
      
      for (const errorType of errorTypes) {
        mockProviders.forEach(provider => {
          provider.setFailureMode(errorType as any, true);
        });
        
        const quotes = await providerFactory.getAllQuotes(shipmentInput);
        expect(quotes).toHaveLength(0);
        
        // Reset providers
        mockProviders.forEach(provider => {
          provider.setFailureMode('network', false);
        });
      }
    });

    it('should handle partial failures', async () => {
      const shipmentInput = TestDataFactory.createShipmentInput();
      
      // Make only one provider fail
      mockProviders.get('easypost')?.setFailureMode('network', true);
      
      const quotes = await providerFactory.getAllQuotes(shipmentInput);
      
      // Should still get quotes from working providers
      expect(quotes).toHaveLength(6); // 2 providers × 3 quotes each
      expect(quotes.every(q => q.provider !== 'easypost')).toBe(true);
    });

    it('should handle all providers failing', async () => {
      const shipmentInput = TestDataFactory.createShipmentInput();
      
      // Make all providers fail
      mockProviders.forEach(provider => {
        provider.setFailureMode('network', true);
      });
      
      const quotes = await providerFactory.getAllQuotes(shipmentInput);
      expect(quotes).toHaveLength(0);
    });
  });

  describe('Performance', () => {
    it('should handle concurrent quote requests', async () => {
      const shipmentInput = TestDataFactory.createShipmentInput();
      
      // Make multiple concurrent requests
      const promises = Array.from({ length: 10 }, () => 
        providerFactory.getAllQuotes(shipmentInput)
      );
      
      const results = await Promise.all(promises);
      
      // All requests should succeed
      expect(results).toHaveLength(10);
      results.forEach(quotes => {
        expect(quotes).toHaveLength(9);
      });
    });

    it('should handle concurrent purchase requests', async () => {
      const rateQuote = TestDataFactory.createRateQuote();
      
      // Make multiple concurrent purchases
      const promises = Array.from({ length: 5 }, () => 
        providerFactory.purchaseShipment(rateQuote)
      );
      
      const results = await Promise.all(promises);
      
      // All purchases should succeed
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.provider).toBe(rateQuote.provider);
      });
    });

    it('should handle mixed operations', async () => {
      const shipmentInput = TestDataFactory.createShipmentInput();
      const rateQuote = TestDataFactory.createRateQuote();
      
      // Mix of quote and purchase operations
      const operations = [
        providerFactory.getAllQuotes(shipmentInput),
        providerFactory.purchaseShipment(rateQuote),
        providerFactory.getAllQuotes(shipmentInput),
        providerFactory.checkAllProviderHealth(),
        providerFactory.purchaseShipment(rateQuote)
      ];
      
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(5);
      expect(results[0]).toHaveLength(9); // quotes
      expect(results[1]).toBeDefined(); // purchase
      expect(results[2]).toHaveLength(9); // quotes
      expect(results[3]).toHaveProperty('easypost'); // health
      expect(results[4]).toBeDefined(); // purchase
    });
  });

  describe('Cache Integration', () => {
    it('should use cache for repeated requests', async () => {
      const shipmentInput = TestDataFactory.createShipmentInput();
      
      // First request
      await providerFactory.getAllQuotes(shipmentInput);
      const stats1 = await mockCache.getStats();
      
      // Second request
      await providerFactory.getAllQuotes(shipmentInput);
      const stats2 = await mockCache.getStats();
      
      // Should have cache hits
      expect(stats2.hits).toBeGreaterThan(stats1.hits);
    });

    it('should invalidate cache after purchase', async () => {
      const shipmentInput = TestDataFactory.createShipmentInput();
      const rateQuote = TestDataFactory.createRateQuote();
      
      // Get quotes to populate cache
      await providerFactory.getAllQuotes(shipmentInput);
      const stats1 = await mockCache.getStats();
      
      // Purchase shipment
      await providerFactory.purchaseShipment(rateQuote);
      const stats2 = await mockCache.getStats();
      
      // Should have cache deletions
      expect(stats2.deletes).toBeGreaterThan(stats1.deletes);
    });

    it('should handle cache failures gracefully', async () => {
      // Mock cache to throw errors
      const originalGet = mockCache.get;
      mockCache.get = jest.fn().mockRejectedValue(new Error('Cache error'));
      
      const shipmentInput = TestDataFactory.createShipmentInput();
      
      // Should still work despite cache failure
      const quotes = await providerFactory.getAllQuotes(shipmentInput);
      expect(quotes).toHaveLength(9);
      
      // Restore original method
      mockCache.get = originalGet;
    });
  });
});