/**
 * Jest configuration for SlotSync backend tests
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'utils/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**',
    '!**/__tests__/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  // Increase timeout for integration tests (they may take longer)
  testTimeout: 30000,
  // Setup files run before tests
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};

