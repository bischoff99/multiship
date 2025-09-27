// Jest globals are available in test environment
import { Address, Parcel, ShipmentInput, RateQuote, PurchaseResult, ProviderAdapter, CacheInterface } from '../types.js';
import {
  ProviderError,
  NetworkError,
  RateLimitError,
  AuthenticationError,
  TimeoutError,
  CircuitBreakerError,
  ValidationError
} from '../errors/provider-errors.js';

// Test data factories
export class TestDataFactory {
  static createAddress(overrides: Partial<Address> = {}): Address {
    return {
      name: 'Test User',
      company: 'Test Company',
      street1: '123 Test Street',
      street2: 'Apt 456',
      city: 'Test City',
      state: 'CA',
      zip: '12345',
      country: 'US',
      phone: '555-123-4567',
      email: 'test@example.com',
      ...overrides
    };
  }

  static createInternationalAddress(overrides: Partial<Address> = {}): Address {
    return {
      name: 'International User',
      company: 'International Company',
      street1: '456 International Blvd',
      city: 'Toronto',
      state: 'ON',
      zip: 'M5V 3L9',
      country: 'CA',
      phone: '+1-555-987-6543',
      email: 'international@example.com',
      ...overrides
    };
  }

  static createParcel(overrides: Partial<Parcel> = {}): Parcel {
    return {
      length: 12,
      width: 8,
      height: 6,
      weight: 2.5,
      distance_unit: 'in',
      mass_unit: 'lb',
      ...overrides
    };
  }

  static createLargeParcel(overrides: Partial<Parcel> = {}): Parcel {
    return {
      length: 48,
      width: 24,
      height: 18,
      weight: 25,
      distance_unit: 'in',
      mass_unit: 'lb',
      ...overrides
    };
  }

  static createShipmentInput(overrides: {
    to?: Partial<Address>;
    from?: Partial<Address>;
    parcel?: Partial<Parcel>;
    reference?: string;
    veeqo?: { allocationId: number };
  } = {}): ShipmentInput {
    return {
      to: TestDataFactory.createAddress(overrides.to),
      from: TestDataFactory.createAddress(overrides.from),
      parcel: TestDataFactory.createParcel(overrides.parcel),
      reference: overrides.reference || `TEST-${Date.now()}`,
      ...(overrides.veeqo && { veeqo: overrides.veeqo })
    };
  }

  static createRateQuote(overrides: Partial<RateQuote> = {}): RateQuote {
    return {
      provider: 'easypost',
      rateId: `rate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      shipmentId: `shp_${Date.now()}`,
      service: 'Ground Advantage',
      carrier: 'USPS',
      amount: 8.99,
      currency: 'USD',
      estDeliveryDays: 3,
      serviceType: 'standard',
      subCarrierId: null,
      ...overrides
    };
  }

  static createPurchaseResult(overrides: Partial<PurchaseResult> = {}): PurchaseResult {
    return {
      provider: 'easypost',
      shipmentId: `shp_${Date.now()}`,
      labelUrl: 'https://example.com/label.pdf',
      trackingCode: '9400111899223344556677',
      trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223344556677',
      ...overrides
    };
  }

  static createMockRateQuotes(count = 3): RateQuote[] {
    const providers: Array<'easypost' | 'shippo' | 'veeqo'> = ['easypost', 'shippo', 'veeqo'];
    const services = ['Ground Advantage', 'Priority Mail', 'Express Mail', 'Standard Shipping', 'Express Shipping'];
    const carriers = ['USPS', 'FedEx', 'UPS', 'DHL'];

    return Array.from({ length: count }, (_, i) => ({
      provider: providers[i % providers.length],
      rateId: `rate_${Date.now()}_${i}`,
      shipmentId: `shp_${Date.now()}`,
      service: services[i % services.length],
      carrier: carriers[i % carriers.length],
      amount: Math.round((5 + Math.random() * 20) * 100) / 100,
      currency: 'USD',
      estDeliveryDays: Math.floor(1 + Math.random() * 7),
      serviceType: i === 0 ? 'standard' : 'express',
      subCarrierId: null
    }));
  }
}

// Mock provider implementations
export class MockProviderAdapter implements ProviderAdapter {
  public readonly name: string;
  public readonly enabled: boolean;
  private shouldFail = false;
  private failureType: 'network' | 'rateLimit' | 'auth' | 'timeout' | 'validation' = 'network';
  private delayMs = 0;
  private healthCheckResult = true;

  constructor(name: string, enabled = true) {
    this.name = name;
    this.enabled = enabled;
  }

  // Configuration methods for testing different scenarios
  setFailureMode(type: 'network' | 'rateLimit' | 'auth' | 'timeout' | 'validation', shouldFail = true) {
    this.failureType = type;
    this.shouldFail = shouldFail;
  }

  setDelay(ms: number) {
    this.delayMs = ms;
  }

  setHealthCheck(result: boolean) {
    this.healthCheckResult = result;
  }

  async quote(input: ShipmentInput): Promise<RateQuote[]> {
    await this.simulateDelay();

    if (this.shouldFail) {
      throw this.createError('quote');
    }

    return TestDataFactory.createMockRateQuotes();
  }

  async purchase(rateId: string, shipmentId?: string): Promise<PurchaseResult> {
    await this.simulateDelay();

    if (this.shouldFail) {
      throw this.createError('purchase');
    }

    return TestDataFactory.createPurchaseResult();
  }

  async healthCheck(): Promise<boolean> {
    await this.simulateDelay();
    return this.healthCheckResult;
  }

  private async simulateDelay(): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }
  }

  private createError(operation: string): ProviderError {
    const baseError = new Error(`${this.failureType} error in ${operation}`);

    switch (this.failureType) {
      case 'network':
        return new NetworkError(
          'Network request failed',
          this.name,
          operation,
          true,
          500,
          baseError
        );
      case 'rateLimit':
        return new RateLimitError(
          'Rate limit exceeded',
          this.name,
          operation,
          undefined,
          60
        );
      case 'auth':
        return new AuthenticationError(
          'Authentication failed',
          this.name,
          operation
        );
      case 'timeout':
        return new TimeoutError(
          'Request timeout',
          this.name,
          operation,
          30000
        );
      case 'validation':
        return new ValidationError(
          'Invalid input data',
          this.name,
          operation,
          'parcel.weight',
          -1
        );
      default:
        return new NetworkError(
          'Unknown error',
          this.name,
          operation,
          true,
          500,
          baseError
        );
    }
  }
}

// Mock cache implementation for testing
export class MockCache<T = any> implements CacheInterface<T> {
  private storage = new Map<string, { data: T; timestamp: number; ttl: number }>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0
  };

  async get(key: string): Promise<T | null> {
    const entry = this.storage.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    if (now > entry.timestamp + entry.ttl) {
      this.storage.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  async set(key: string, value: T, options?: { ttl?: number; namespace?: string }): Promise<void> {
    const ttl = options?.ttl || 3600000; // Default 1 hour
    const namespacedKey = options?.namespace ? `${options.namespace}:${key}` : key;

    this.storage.set(namespacedKey, {
      data: value,
      timestamp: Date.now(),
      ttl
    });

    this.stats.sets++;
  }

  async delete(key: string): Promise<boolean> {
    const deleted = this.storage.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  async has(key: string): Promise<boolean> {
    const entry = this.storage.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now > entry.timestamp + entry.ttl) {
      this.storage.delete(key);
      return false;
    }

    return true;
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  async getStats() {
    return {
      ...this.stats,
      size: this.storage.size,
      maxSize: undefined
    };
  }

  async keys(pattern?: string): Promise<string[]> {
    if (!pattern) {
      return Array.from(this.storage.keys());
    }

    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(this.storage.keys()).filter(key => regex.test(key));
  }

  async size(): Promise<number> {
    // Approximate size calculation
    return JSON.stringify(Array.from(this.storage.entries())).length;
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.storage.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        toDelete.push(key);
        this.stats.evictions++;
      }
    }

    toDelete.forEach(key => this.storage.delete(key));
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  // Test helper methods
  getStorageSize(): number {
    return this.storage.size;
  }

  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0
    };
  }
}

// Circuit breaker test utilities
export class CircuitBreakerTestUtils {
  static simulateFailures(count: number): Promise<void[]> {
    return Promise.all(
      Array.from({ length: count }, () => this.simulateFailure())
    );
  }

  static simulateFailure(): Promise<void> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Simulated failure')), Math.random() * 100);
    });
  }

  static async simulateIntermittentFailures(
    totalCalls: number,
    failureRate = 0.3
  ): Promise<{ results: boolean[]; failures: number }> {
    const results: boolean[] = [];
    let failures = 0;

    for (let i = 0; i < totalCalls; i++) {
      const shouldFail = Math.random() < failureRate;
      results.push(!shouldFail);
      if (shouldFail) {
        failures++;
      }

      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
    }

    return { results, failures };
  }
}

// Test database utilities
export class TestDatabaseUtils {
  private static dbState: Map<string, any> = new Map();

  static async setupInMemoryDb(): Promise<void> {
    this.dbState.clear();
  }

  static async teardownInMemoryDb(): Promise<void> {
    this.dbState.clear();
  }

  static async seedTestData(collection: string, data: any[]): Promise<void> {
    this.dbState.set(collection, data);
  }

  static async getCollectionData(collection: string): Promise<any[]> {
    return this.dbState.get(collection) || [];
  }

  static async clearCollection(collection: string): Promise<void> {
    this.dbState.delete(collection);
  }

  static async insertDocument(collection: string, document: any): Promise<string> {
    const data = this.dbState.get(collection) || [];
    const id = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    data.push({ ...document, id });
    this.dbState.set(collection, data);
    return id;
  }

  static async findDocument(collection: string, query: any): Promise<any | null> {
    const data = this.dbState.get(collection) || [];
    return data.find((doc: any) => {
      return Object.entries(query).every(([key, value]) => doc[key] === value);
    }) || null;
  }
}

// Time utilities for testing
export class TestTimeUtils {
  private static timeOffset = 0;
  private static originalNow = Date.now;

  static setTimeOffset(offsetMs: number): void {
    this.timeOffset = offsetMs;
  }

  static resetTime(): void {
    this.timeOffset = 0;
    Date.now = this.originalNow;
  }

  static mockDateNow(): void {
    Date.now = () => this.originalNow() + this.timeOffset;
  }

  static advanceTime(ms: number): void {
    this.timeOffset += ms;
  }

  static setFixedTime(timestamp: number): void {
    Date.now = () => timestamp;
  }

  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Performance testing utilities
export class PerformanceTestUtils {
  static async measureExecutionTime<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    return { result, duration };
  }

  static async benchmarkConcurrentOperations<T>(
    operation: () => Promise<T>,
    concurrency: number,
    iterations: number
  ): Promise<{
    results: T[];
    totalTime: number;
    avgTime: number;
    minTime: number;
    maxTime: number;
    errors: number;
  }> {
    const start = performance.now();
    const results: T[] = [];
    let errors = 0;

    const executeWithConcurrency = async () => {
      const promises = Array.from({ length: iterations }, async (_, i) => {
        try {
          const result = await operation();
          results.push(result);
          return result;
        } catch (error) {
          errors++;
          throw error;
        }
      });

      // Execute with controlled concurrency
      const chunks = [];
      for (let i = 0; i < promises.length; i += concurrency) {
        chunks.push(promises.slice(i, i + concurrency));
      }

      for (const chunk of chunks) {
        await Promise.all(chunk);
      }
    };

    await executeWithConcurrency();
    const totalTime = performance.now() - start;

    return {
      results,
      totalTime,
      avgTime: totalTime / iterations,
      minTime: 0, // Would need individual timing for this
      maxTime: 0, // Would need individual timing for this
      errors
    };
  }
}

// Assertion helpers
export class TestAssertions {
  static async expectToThrow(
    fn: () => Promise<any>,
    expectedError?: new (...args: any[]) => Error
  ): Promise<Error> {
    try {
      await fn();
      throw new Error('Expected function to throw, but it did not');
    } catch (error) {
      if (expectedError && !(error instanceof expectedError)) {
        const errorName = error instanceof Error ? error.constructor.name : 'Unknown';
        throw new Error(`Expected ${expectedError.name}, but got ${errorName}`);
      }
      return error as Error;
    }
  }

  static expectErrorToBeRetryable(error: ProviderError): void {
    if (!error.isRetryable) {
      throw new Error(`Expected error to be retryable, but it was not. Error: ${error.message}`);
    }
  }

  static expectErrorToBeNonRetryable(error: ProviderError): void {
    if (error.isRetryable) {
      throw new Error(`Expected error to be non-retryable, but it was. Error: ${error.message}`);
    }
  }
}