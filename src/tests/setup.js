// Test setup and global configuration
const path = require('path');

// Load environment variables from .env file (not .env.test since it doesn't exist)
// Tests should use the same .env as development but can override via process.env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Override with test-specific values
process.env.NODE_ENV = 'test';
process.env.USE_MOCK_OTP = 'true';
process.env.MOCK_OTP_CODE = '123456';
process.env.SKIP_EMAIL_VERIFICATION = 'true';
process.env.SKIP_SMS_VERIFICATION = 'true';

// Set API_BASE_URL from environment or use default
if (!process.env.API_BASE_URL) {
  const port = process.env.PORT || '3000';
  process.env.API_BASE_URL = `http://localhost:${port}/api`;
}

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in test output (but keep important ones)
const originalConsole = { ...console };
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Keep error and warn for debugging
  error: originalConsole.error,
  warn: originalConsole.warn,
};

// Global beforeAll
beforeAll(async () => {
  originalConsole.info('🧪 Starting test suite...');
  originalConsole.info(`📡 API Base URL: ${process.env.API_BASE_URL}`);
  originalConsole.info(`🔧 Environment: ${process.env.NODE_ENV}`);
  originalConsole.info('');
});

// Global afterAll
afterAll(async () => {
  originalConsole.info('\n✅ Test suite completed.');
});

