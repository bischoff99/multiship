# Provider System Testing Framework

This comprehensive testing framework provides extensive coverage for the enhanced provider system, including caching, circuit breakers, error handling, and provider abstractions.

## Test Structure

```
src/test/
├── config/
│   └── jest.config.js          # Jest configuration
├── setup/
│   ├── test-setup.ts           # Global test setup
│   └── test-db.ts              # Database utilities for testing
├── test-utils.ts               # Testing utilities and mocks
├── unit/                       # Unit tests
│   ├── cache/
│   │   └── memory-cache.test.ts
│   └── errors/
│       └── provider-errors.test.ts
├── integration/                # Integration tests
│   └── easypost-adapter.test.ts
└── performance/                # Performance tests
    ├── cache-performance.test.ts
    └── circuit-breaker-performance.test.ts
```

## Test Categories

### 1. Unit Tests (`unit/`)
- **Cache Implementation Tests**: Memory and Redis cache functionality
- **Error Handling Tests**: Provider error classification and handling
- **Configuration Tests**: Provider and cache configuration management
- **Logger Tests**: Logging utility functionality

### 2. Integration Tests (`integration/`)
- **Provider Adapter Tests**: EasyPost, Shippo, and Veeqo integration
- **Circuit Breaker Tests**: State transitions and failure handling
- **Cache Integration Tests**: End-to-end caching scenarios
- **Error Recovery Tests**: Retry logic and error recovery

### 3. Performance Tests (`performance/`)
- **Cache Performance Tests**: Throughput, latency, and memory usage
- **Circuit Breaker Performance Tests**: State transition timing
- **Concurrent Operation Tests**: Multi-threaded scenario handling
- **Memory Leak Detection**: Resource usage validation

## Test Utilities

### TestDataFactory
Provides factory methods for creating test data:

```typescript
import { TestDataFactory } from './test-utils.js';

// Create test addresses
const address = TestDataFactory.createAddress({
  city: 'New York',
  state: 'NY'
});

// Create test shipments
const shipment = TestDataFactory.createShipmentInput({
  to: TestDataFactory.createAddress(),
  from: TestDataFactory.createAddress(),
  parcel: TestDataFactory.createParcel()
});

// Create mock rate quotes
const rates = TestDataFactory.createMockRateQuotes(3);
```

### MockProviderAdapter
Mock implementation for testing provider interactions:

```typescript
import { MockProviderAdapter } from './test-utils.js';

const mockProvider = new MockProviderAdapter('test-provider');

// Configure failure scenarios
mockProvider.setFailureMode('network', true);
mockProvider.setDelay(100); // 100ms delay
mockProvider.setHealthCheck(false);

// Test different error types
mockProvider.setFailureMode('rateLimit', true);
mockProvider.setFailureMode('authentication', true);
mockProvider.setFailureMode('timeout', true);
```

### MockCache
In-memory cache implementation for testing:

```typescript
import { MockCache } from './test-utils.js';

const cache = new MockCache();

// Use like any cache implementation
await cache.set('key', 'value', { ttl: 3600000 });
const result = await cache.get('key');
```

### PerformanceTestUtils
Utilities for performance testing:

```typescript
import { PerformanceTestUtils } from './test-utils.js';

// Measure execution time
const { result, duration } = await PerformanceTestUtils.measureExecutionTime(
  async () => await someAsyncOperation()
);

// Benchmark concurrent operations
const results = await PerformanceTestUtils.benchmarkConcurrentOperations(
  async () => await operation(),
  10, // concurrency
  1000 // iterations
);
```

### TestDatabaseManager
In-memory database for testing:

```typescript
import { testDb } from './setup/test-db.js';

// Setup test database
await testDb.setup();

// Seed test data
const shipmentIds = await testDb.seedTestShipments(10);
const rateIds = await testDb.seedTestRates(shipmentIds);

// Query test data
const shipments = await testDb.findMany('shipments', { provider: 'easypost' });

// Cleanup
await testDb.teardown();
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Performance Tests Only
```bash
npm run test:performance
```

### Coverage Report
```bash
npm run test:coverage
```

### Watch Mode
```bash
npm run test:watch
```

## Test Configuration

The Jest configuration (`config/jest.config.js`) includes:

- **Coverage Thresholds**: 80% for branches, functions, lines, and statements
- **Test Environment**: Node.js with ES modules support
- **Setup Files**: Global test setup and database initialization
- **Mock Configurations**: External dependencies (EasyPost, Shippo, Redis)
- **Performance Settings**: Timeout and worker configuration

## Writing New Tests

### Unit Test Example
```typescript
import { MemoryCache } from '../../cache/memory-cache.js';

describe('MyComponent', () => {
  let component: MyComponent;

  beforeEach(() => {
    component = new MyComponent();
  });

  it('should perform expected behavior', async () => {
    const result = await component.doSomething();
    expect(result).toBe(expectedValue);
  });
});
```

### Integration Test Example
```typescript
import { EasyPostAdapter } from '../../adapters/easypost-adapter.js';
import { TestDataFactory } from '../test-utils.js';

describe('ProviderIntegration', () => {
  let adapter: EasyPostAdapter;

  beforeEach(() => {
    process.env.EASYPOST_API_KEY = 'test-key';
    adapter = new EasyPostAdapter();
  });

  it('should handle real API interactions', async () => {
    const shipment = TestDataFactory.createShipmentInput();
    const quotes = await adapter.quote(shipment);

    expect(quotes).toHaveLength.greaterThan(0);
    quotes.forEach(quote => {
      expect(quote.provider).toBe('easypost');
      expect(quote.amount).toBeGreaterThan(0);
    });
  });
});
```

### Performance Test Example
```typescript
import { PerformanceTestUtils } from '../test-utils.js';

describe('Performance', () => {
  it('should meet performance requirements', async () => {
    const { duration } = await PerformanceTestUtils.measureExecutionTime(
      async () => {
        // Performance-critical code
        await performOperation();
      }
    );

    expect(duration).toBeLessThan(100); // Must complete in under 100ms
  });
});
```

## Test Data Management

### Seeding Test Data
```typescript
import { TestDataSeeder } from './setup/test-db.js';

const { shipmentIds, rateIds } = await TestDataSeeder.seedBasicTestData();
// Use the seeded data for testing
```

### Database Assertions
```typescript
import { TestDatabaseAssertions } from './setup/test-db.js';

await TestDatabaseAssertions.expectCollectionCount('shipments', 5);
await TestDatabaseAssertions.expectDocumentExists('rates', rateId);
```

## Mocking External Dependencies

### API Mocks
```typescript
// In test-setup.ts or individual test files
jest.mock('@easypost/api', () => ({
  API: jest.fn().mockImplementation(() => ({
    Shipment: {
      create: jest.fn(),
      buy: jest.fn()
    }
  }))
}));
```

### Cache Mocks
```typescript
jest.mock('../../cache/memory-cache.js');
jest.mock('../../cache/redis-cache.js');
```

## Error Testing

### Testing Error Conditions
```typescript
import { TestAssertions } from '../test-utils.js';

it('should handle errors correctly', async () => {
  mockProvider.setFailureMode('network', true);

  await TestAssertions.expectToThrow(
    () => adapter.quote(shipmentInput),
    NetworkError
  );
});

it('should classify errors correctly', async () => {
  try {
    await failingOperation();
  } catch (error) {
    TestAssertions.expectErrorToBeRetryable(error);
  }
});
```

## Performance Testing Guidelines

### Cache Performance
- Test with realistic data sizes
- Measure hit/miss ratios
- Test concurrent access patterns
- Monitor memory usage

### Circuit Breaker Performance
- Test state transition timing
- Measure failure detection speed
- Test recovery scenarios
- Monitor resource usage

### General Performance
- Use realistic operation volumes
- Test concurrent scenarios
- Measure memory and CPU usage
- Set meaningful performance thresholds

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always cleanup test data and mocks
3. **Realistic Data**: Use realistic test data that matches production scenarios
4. **Performance Thresholds**: Set meaningful performance expectations
5. **Error Coverage**: Test both success and failure scenarios
6. **Concurrent Testing**: Test concurrent operations when applicable
7. **Memory Monitoring**: Check for memory leaks in long-running tests

## Debugging Tests

### Common Issues
- **TypeScript Errors**: Ensure Jest types are installed and configured
- **Async Operations**: Use proper async/await patterns
- **Mock Setup**: Verify mocks are properly configured before tests
- **Database State**: Ensure test database is properly initialized

### Debug Mode
```bash
# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- easypost-adapter.test.ts

# Run with coverage
npm run test:coverage
```

## Continuous Integration

This test suite is designed to run in CI environments:

- Tests are isolated and don't require external services
- Performance tests have reasonable timeouts
- Coverage thresholds ensure quality standards
- Mock implementations allow offline testing

## Extending the Framework

To add new test utilities:

1. Add to `test-utils.ts` or create new utility files
2. Export from the main test utilities file
3. Include TypeScript definitions
4. Add documentation and examples
5. Ensure proper cleanup in tests

## Troubleshooting

### Common Issues
- **Module Not Found**: Check Jest configuration and module mappings
- **Type Errors**: Install missing type definitions (`@types/jest`, `@types/node`)
- **Timeout Errors**: Increase test timeout for slow operations
- **Memory Issues**: Reduce test data size or add garbage collection

### Getting Help
- Check existing test patterns in the codebase
- Review Jest documentation for configuration options
- Examine error messages for specific issues
- Use debug mode for detailed output