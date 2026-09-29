const request = require('supertest');
const { getAppUnderTest } = require('./helpers/app-under-test');

describe('Health & Info Endpoints (Dual Runtime Parity)', () => {
  let app;

  beforeAll(async () => {
    app = await getAppUnderTest();
  });

  describe('GET /health', () => {
    it('should return the standard health check response envelope', async () => {
      const res = await request(app).get('/health').expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message', 'API is running');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('environment');
    });

    it('should return identical health response on /api/v1/health (triple mount)', async () => {
      const res = await request(app).get('/api/v1/health').expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message', 'API is running');
    });

    it('should return identical health response on /api/health (triple mount)', async () => {
      const res = await request(app).get('/api/health').expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message', 'API is running');
    });
  });

  describe('GET /', () => {
    it('should return API information and documentation structure', async () => {
      const res = await request(app).get('/').expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message', 'API v1.0');
      expect(res.body).toHaveProperty('version', '1.0.0');
      expect(res.body).toHaveProperty('documentation');
      expect(res.body).toHaveProperty('endpoints');
      expect(res.body).toHaveProperty('features');
    });
  });
});
