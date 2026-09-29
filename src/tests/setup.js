// Test setup and global configuration
require('reflect-metadata');
const path = require('path');
const fs = require('fs');

// Load environment variables: start with base .env then overlay with .env.test
const defaultEnvPath = path.resolve(__dirname, '../../.env');
const testEnvPath = path.resolve(__dirname, '../../.env.test');

if (fs.existsSync(defaultEnvPath)) {
  require('dotenv').config({ path: defaultEnvPath });
}
if (fs.existsSync(testEnvPath)) {
  require('dotenv').config({ path: testEnvPath, override: true });
}

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

  // Pre-seed the JUPEB test-prefix helper with prefixes already occupied
  // in the DB so cross-run collisions on the 100..999 prefix space don't
  // 409 tests with bounded retry loops. Best-effort: silently no-ops on a
  // fresh DB or when the table hasn't been migrated yet.
  try {
    const pool = require('../db/pool');
    const { warmJupebPrefixCache } = require('./jupeb-session-test-helpers');
    await warmJupebPrefixCache(pool);
  } catch { /* ignore */ }
});

// Global afterAll
afterAll(async () => {
  try {
    const pool = require('../db/pool');
    const { cleanupTestCatalogArtifacts } = require('./jupeb-session-test-helpers');
    await cleanupTestCatalogArtifacts(pool);
  } catch { /* ignore */ }
  originalConsole.info('\n✅ Test suite completed.');
});

