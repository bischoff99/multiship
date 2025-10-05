// Global mocks setup for Jest test environment
import { jest } from '@jest/globals';

// Create global fetch mock
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Default fetch response mock
const createMockResponse = (data: any = {}, options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
} = {}) => ({
  ok: options.ok ?? true,
  status: options.status ?? 200,
  statusText: options.statusText ?? 'OK',
  headers: new Headers(options.headers || {}),
  json: async () => data,
  text: async () => JSON.stringify(data),
  blob: async () => new Blob([JSON.stringify(data)]),
  arrayBuffer: async () => new ArrayBuffer(8),
  clone: function() { return this; }
});

// Global setup for each test
beforeEach(() => {
  // Reset fetch mock
  mockFetch.mockReset();
  
  // Set default successful response
  mockFetch.mockResolvedValue(createMockResponse({
    success: true,
    data: []
  }));
  
  // Use fake timers
  jest.useFakeTimers({ now: Date.now() });
});

// Global cleanup after each test
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Restore real timers
  jest.useRealTimers();
});

// Export utilities for test customization
export { mockFetch, createMockResponse };

// Helper functions for common mock scenarios
export const MockResponses = {
  success: (data: any = {}) => createMockResponse(data),
  
  error: (status = 500, message = 'Internal Server Error') => createMockResponse(
    { error: message },
    { ok: false, status, statusText: message }
  ),
  
  rateLimited: (retryAfter = 60) => createMockResponse(
    { error: 'Rate limit exceeded' },
    { 
      ok: false, 
      status: 429, 
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': retryAfter.toString() }
    }
  ),
  
  unauthorized: () => createMockResponse(
    { error: 'Unauthorized' },
    { ok: false, status: 401, statusText: 'Unauthorized' }
  ),
  
  timeout: () => {
    return Promise.reject(new Error('Request timeout'));
  },
  
  networkError: () => {
    return Promise.reject(new Error('Network error'));
  }
};

// Mock Headers constructor if not available
if (typeof Headers === 'undefined') {
  global.Headers = class MockHeaders extends Map {
    constructor(init?: HeadersInit) {
      super();
      if (init) {
        if (Array.isArray(init)) {
          init.forEach(([key, value]) => this.set(key, value));
        } else if (init instanceof Headers) {
          init.forEach((value, key) => this.set(key, value));
        } else {
          Object.entries(init).forEach(([key, value]) => this.set(key, value));
        }
      }
    }
    
    append(name: string, value: string): void {
      const existing = this.get(name);
      if (existing) {
        this.set(name, `${existing}, ${value}`);
      } else {
        this.set(name, value);
      }
    }
  } as any;
}

// Mock console methods to reduce test output noise
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Restore console in afterAll
afterAll(() => {
  global.console = originalConsole;
});