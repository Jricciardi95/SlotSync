/**
 * Jest setup file - runs before all tests
 * 
 * Ensures NODE_ENV is set to 'test' before any tests execute.
 * This prevents the Vision self-test and other dev-only code from running during tests.
 */

// Set NODE_ENV to 'test' if not already set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
} else if (process.env.NODE_ENV !== 'test') {
  // Override any existing NODE_ENV to ensure tests run in test mode
  process.env.NODE_ENV = 'test';
}

