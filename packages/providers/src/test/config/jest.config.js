/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  rootDir: '<rootDir>/../..',
  testMatch: [
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/test/**',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup/test-setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  testTimeout: 10000, // Reduced timeout
  verbose: false, // Reduce verbosity to prevent memory issues
  clearMocks: true,
  restoreMocks: true,
  // TypeScript and ESM configuration
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: {
        module: 'esnext',
        target: 'es2022',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true
      }
    }
  },
  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'esnext',
        target: 'es2022',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true
      }
    }]
  },
  // Mock configurations for external dependencies
  modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))'
  ],
  // Performance and memory settings
  maxWorkers: 1,
  cache: true,
  // Increase memory limit for Node.js
  testEnvironmentOptions: {
    NODE_OPTIONS: '--max-old-space-size=2048'
  },
  // Memory optimization
  workerIdleMemoryLimit: '256MB',
  detectOpenHandles: false,
  forceExit: true,
  // Error handling
  bail: false,
  notify: false,
  // Test organization
  testPathIgnorePatterns: [
    '/node_modules/',
    '.*performance.*',
    '.*integration.*',
    '.*benchmark.*'
  ],
  moduleFileExtensions: ['ts', 'js', 'json']
};

export default config;