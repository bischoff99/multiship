// Test setup file to configure Jest environment
// Jest globals are available without imports

// Reduce console output during tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.EASYPOST_API_KEY = 'test_easypost_key';
process.env.SHIPPO_API_KEY = 'test_shippo_key';
process.env.VEEQO_API_KEY = 'test_veeqo_key';

// Global test timeout
jest.setTimeout(10000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global teardown
afterAll(() => {
  // Restore original console
  global.console = originalConsole;
});