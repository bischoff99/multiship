/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  rootDir: '<rootDir>/../../..',
  testMatch: [
    '<rootDir>/packages/providers/src/**/*.test.ts',
    '<rootDir>/packages/providers/src/**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'packages/providers/src/**/*.ts',
    '!packages/providers/src/**/*.d.ts',
    '!packages/providers/src/**/*.test.ts',
    '!packages/providers/src/**/*.spec.ts',
    '!packages/providers/src/test/**',
    '!packages/providers/src/**/index.ts'
  ],
  coverageDirectory: 'packages/providers/coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/packages/providers/src/test/setup/test-setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/packages/providers/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  testTimeout: 30000,
  verbose: true,
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
  maxWorkers: '50%',
  cache: true,
  // Error handling
  bail: false,
  notify: false,
  // Test organization
  testPathIgnorePatterns: ['/node_modules/'],
  moduleFileExtensions: ['ts', 'js', 'json']
};

export default config;