// Test environment setup and global configuration
// Jest globals are available in test environment

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Minimize logging during tests

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeAll(() => {
  // Suppress console output during tests unless explicitly needed
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  // Restore console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});

// Global test utilities
(globalThis as any).testUtils = {
  // Helper to create test timeouts
  createTimeout: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Helper to create unique test IDs
  createTestId: (prefix = 'test') => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

  // Helper to wait for async operations
  waitFor: async (condition: () => boolean | Promise<boolean>, timeout = 5000): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Timeout waiting for condition');
  }
};

// Clean up after each test
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();

  // Reset environment variables
  process.env = { ...process.env, NODE_ENV: 'test' };
});

// Global error handlers for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't fail the test suite for unhandled rejections in tests
  // Individual tests should handle their own promise rejections
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Let the test framework handle this
});

// Mock implementations for external dependencies
jest.mock('@easypost/api', () => ({
  API: jest.fn().mockImplementation(() => ({
    Address: {
      create: jest.fn(),
      retrieve: jest.fn()
    },
    Parcel: {
      create: jest.fn(),
      retrieve: jest.fn()
    },
    Shipment: {
      create: jest.fn(),
      retrieve: jest.fn(),
      buy: jest.fn()
    },
    Rate: {
      retrieve: jest.fn()
    }
  }))
}));

jest.mock('shippo', () => ({
  API: jest.fn().mockImplementation(() => ({
    address: {
      create: jest.fn(),
      retrieve: jest.fn()
    },
    parcel: {
      create: jest.fn(),
      retrieve: jest.fn()
    },
    shipment: {
      create: jest.fn(),
      retrieve: jest.fn(),
      rates: jest.fn()
    }
  }))
}));

jest.mock('ioredis', () => ({
  default: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    keys: jest.fn(),
    flushall: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Export types for test files
export type MockFunction<T extends (...args: any[]) => any> = jest.MockedFunction<T>;
export type Mocked<T> = jest.Mocked<T>;