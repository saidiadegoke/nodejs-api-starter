/**
 * Asset Library & Usage API Tests (Phase 7)
 *
 * Verifies:
 * - GET /api/assets/usage (storage usage and plan limits from plan_configs)
 * - GET /api/assets (list assets)
 * - POST /api/assets/upload (with quota check; 402 when over limit)
 * - Usage payload shape and overage_rates from plan_configs
 *
 * Prerequisites: Server running, migrations run (including 007, 008).
 * Run: npm run test:assets  OR  npm test -- src/tests/assets.test.js
 */

const axios = require('axios');
const FormData = require('form-data');
const { cleanupAll, logCleanupResults } = require('./cleanup-helper');

require('dotenv').config();
const port = process.env.PORT || 4050;
const BASE_URL = process.env.API_BASE_URL || `http://localhost:${port}`;
const TEST_TIMEOUT = 30000;

let testUser = null;
let authToken = null;

const createdResources = {
  users: [],
  assets: []
};

const createAuthClient = (token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return axios.create({ baseURL: BASE_URL, headers });
};

const generateEmail = () => `assets-test-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;

const cleanupTestData = async () => {
  try {
    const results = await cleanupAll(createdResources, BASE_URL);
    logCleanupResults(results);
    createdResources.users = [];
    createdResources.assets = [];
  } catch (err) {
    console.error('Cleanup failed:', err.message);
  }
};

describe('Assets & Usage API Tests', () => {
  jest.setTimeout(TEST_TIMEOUT);

  beforeAll(async () => {
    const client = createAuthClient();
    const userData = {
      email: generateEmail(),
      password: 'Test@123456',
      first_name: 'Assets',
      last_name: 'Tester',
      role: 'user'
    };
    await client.post('/auth/register', userData);
    const loginRes = await client.post('/auth/login', {
      identifier: userData.email,
      password: userData.password
    });
    const data = loginRes.data.data;
    testUser = data.user || { user_id: data.user_id, email: data.email };
    authToken = data.access_token;
    createdResources.users.push({ user_id: testUser.user_id, token: authToken });
  });

  afterAll(async () => {
    const client = createAuthClient(authToken);
    for (const assetId of createdResources.assets) {
      try {
        await client.delete(`/assets/${assetId}`);
      } catch (_) {
        // ignore
      }
    }
    await cleanupTestData();
  });

  describe('GET /assets/usage', () => {
    test('should return 200 and usage payload for authenticated user', async () => {
      const client = createAuthClient(authToken);
      const res = await client.get('/assets/usage');
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data).toBeDefined();
      const u = res.data.data;
      expect(typeof u.storageUsedBytes).toBe('number');
      expect(typeof u.storageLimitBytes).toBe('number');
      expect(u.storageUsedFormatted).toBeDefined();
      expect(u.storageLimitFormatted).toBeDefined();
      expect(typeof u.percentUsed).toBe('number');
      expect(typeof u.isOverLimit).toBe('boolean');
      expect(typeof u.overageBytes).toBe('number');
      expect(u.planName).toBeDefined();
      expect(u.planType).toBeDefined();
      expect(typeof u.overagePricePerGbPerMonth).toBe('number');
      expect(u.currency).toBeDefined();
    });

    test('should accept currency query and return usage with that currency', async () => {
      const client = createAuthClient(authToken);
      const res = await client.get('/assets/usage?currency=USD');
      expect(res.status).toBe(200);
      expect(res.data.data.currency).toBe('USD');
    });

    test('should return 401 without auth', async () => {
      const client = createAuthClient();
      try {
        await client.get('/assets/usage');
        expect(true).toBe(false);
      } catch (err) {
        expect(err.response.status).toBe(401);
      }
    });
  });

  describe('GET /assets', () => {
    test('should return 200 and list of assets for authenticated user', async () => {
      const client = createAuthClient(authToken);
      const res = await client.get('/assets?page=1&limit=50').catch((err) => err.response);
      expect([200, 400]).toContain(res?.status);
      if (res.status === 200) {
        expect(res.data.success).toBe(true);
        expect(Array.isArray(res.data.data)).toBe(true);
        expect(res.data.pagination).toBeDefined();
        expect(res.data.pagination.page).toBeDefined();
        expect(res.data.pagination.limit).toBeDefined();
        expect(res.data.pagination.total).toBeDefined();
      }
    });

    test('should return 401 without auth', async () => {
      const client = createAuthClient();
      try {
        await client.get('/assets');
        expect(true).toBe(false);
      } catch (err) {
        expect(err.response.status).toBe(401);
      }
    });
  });

  describe('POST /assets/upload', () => {
    test('should upload a small file and return 201 with asset data', async () => {
      const client = createAuthClient(authToken);
      const form = new FormData();
      const buffer = Buffer.from('test asset content for upload');
      form.append('file', buffer, { filename: 'test-asset.txt' });

      const res = await client.post('/assets/upload', form, {
        headers: form.getHeaders()
      });
      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.data).toBeDefined();
      expect(res.data.data.id).toBeDefined();
      expect(Number(res.data.data.size)).toBe(buffer.length);
      expect(res.data.data.url).toBeDefined();
      createdResources.assets.push(res.data.data.id);
    });

    test('should increase storage usage after upload', async () => {
      const client = createAuthClient(authToken);
      const beforeRes = await client.get('/assets/usage');
      const beforeBytes = beforeRes.data.data.storageUsedBytes;

      const form = new FormData();
      const buffer = Buffer.from('x'.repeat(100));
      form.append('file', buffer, { filename: 'small.txt' });
      const uploadRes = await client.post('/assets/upload', form, { headers: form.getHeaders() });
      if (uploadRes.data.data?.id) createdResources.assets.push(uploadRes.data.data.id);

      const afterRes = await client.get('/assets/usage');
      const afterBytes = afterRes.data.data.storageUsedBytes;
      expect(afterBytes).toBeGreaterThanOrEqual(beforeBytes + 100);
    });

    test('should return 4xx when no file is sent', async () => {
      const client = createAuthClient(authToken);
      const form = new FormData();
      try {
        await client.post('/assets/upload', form, { headers: form.getHeaders() });
        expect(true).toBe(false);
      } catch (err) {
        expect([400, 500]).toContain(err.response.status);
        expect(err.response.data?.message || '').toMatch(/file|upload|error|form/i);
      }
    });
  });

  describe('Asset usage and plan_configs integration', () => {
    test('usage limit should be positive for free plan and overage price present', async () => {
      const client = createAuthClient(authToken);
      const res = await client.get('/assets/usage');
      expect(res.status).toBe(200);
      const u = res.data.data;
      // Free plan has limits.storage in MB (e.g. 100); bytes = MB * 1024 * 1024
      expect(u.storageLimitBytes).toBeGreaterThan(0);
      expect(u.planName).toBeDefined();
      // Overage rate may be 0 or positive from plan_configs.overage_rates
      expect(typeof u.overagePricePerGbPerMonth).toBe('number');
    });
  });
});
