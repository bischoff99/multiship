// Test setup file to configure Jest environment
// Jest globals are available without imports

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.EASYPOST_API_KEY = 'test_easypost_key';
process.env.SHIPPO_API_KEY = 'test_shippo_key';
process.env.VEEQO_API_KEY = 'test_veeqo_key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/multiship_test';
process.env.REDIS_URL = 'redis://localhost:6379';

// Global test timeout
jest.setTimeout(10000);

// Global error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Global cleanup after each test
afterEach(() => {
  // Clear all timers
  jest.clearAllTimers();
  
  // Clear all mocks
  jest.clearAllMocks();
});

// Global teardown
afterAll(() => {
  // Final cleanup
  jest.clearAllTimers();
  jest.clearAllMocks();
});