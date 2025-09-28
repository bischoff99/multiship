/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  testMatch: [
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
    }]
  },
  testTimeout: 5000,
  verbose: false,
  maxWorkers: 1,
  workerIdleMemoryLimit: '128MB',
  detectOpenHandles: false,
  forceExit: true,
  // Exclude problematic tests
  testPathIgnorePatterns: [
    '/node_modules/',
    '.*performance.*',
    '.*integration.*',
    '.*benchmark.*'
  ],
  // Disable coverage for now
  collectCoverage: false,
  // Simple module mapping
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
};

export default config;