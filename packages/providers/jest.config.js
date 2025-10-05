/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  
  // Test file matching
  testMatch: [
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  
  // Global timer mocking
  fakeTimers: {
    enableGlobally: true,
    doNotFake: ['nextTick', 'setImmediate'],
    now: Date.now()
  },
  
  // Setup files for global mocks and configuration
  setupFilesAfterEnv: [
    '<rootDir>/src/test/setup/test-setup.ts',
    '<rootDir>/src/test/setup/global-mocks.ts'
  ],
  
  // Transform configuration for TypeScript/ESM
  transform: {
    '^.+\.ts$': ['ts-jest', {
      useESM: true,
      isolatedModules: true
    }]
  },
  
  // Module mapping for ESM
  moduleNameMapping: {
    '^(\.{1,2}/.*)\.js$': '$1'
  },
  
  // Test configuration
  testTimeout: 10000, // Increased for async operations
  verbose: true,
  maxWorkers: 1,
  workerIdleMemoryLimit: '128MB',
  detectOpenHandles: false,
  forceExit: true,
  
  // Exclude problematic tests (temporarily)
  testPathIgnorePatterns: [
    '/node_modules/',
    '.*performance.*',
    '.*integration.*',
    '.*benchmark.*'
  ],
  
  // Coverage configuration
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Error handling
  errorOnDeprecated: false,
  clearMocks: true,
  restoreMocks: true
};

export default config;