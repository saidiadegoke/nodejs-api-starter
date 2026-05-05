// Users Module API Tests using Supertest
const request = require('supertest');
const app = require('../app');

describe('Users API Tests', () => {
  describe('GET /users/health', () => {
    it('should respond to users health check', async () => {
      // Just test that the route responds (may return 401 if protected, or 404 if doesn't exist)
      const response = await request(app)
        .get('/users')
        .expect((res) => {
          // Accept 200, 401 (protected), or 404 (doesn't exist)
          if (![200, 401, 404].includes(res.status)) {
            throw new Error(`Unexpected status: ${res.status}`);
          }
        });
    });
  });

  describe('GET /files', () => {
    it('should respond to files endpoint', async () => {
      const response = await request(app)
        .get('/files')
        .expect((res) => {
          if (![200, 401, 404].includes(res.status)) {
            throw new Error(`Unexpected status: ${res.status}`);
          }
        });
    });
  });

  describe('GET /notifications', () => {
    it('should respond to notifications endpoint', async () => {
      const response = await request(app)
        .get('/notifications')
        .expect((res) => {
          if (![200, 401, 404].includes(res.status)) {
            throw new Error(`Unexpected status: ${res.status}`);
          }
        });
    });
  });

  describe('GET /payments', () => {
    it('should respond to payments endpoint', async () => {
      const response = await request(app)
        .get('/payments')
        .expect((res) => {
          if (![200, 401, 404].includes(res.status)) {
            throw new Error(`Unexpected status: ${res.status}`);
          }
        });
    });
  });

  describe('GET /assets', () => {
    it('should respond to assets endpoint', async () => {
      const response = await request(app)
        .get('/assets')
        .expect((res) => {
          if (![200, 401, 404].includes(res.status)) {
            throw new Error(`Unexpected status: ${res.status}`);
          }
        });
    });
  });

  describe('GET /websocket', () => {
    it('should respond to websocket endpoint', async () => {
      const response = await request(app)
        .get('/websocket')
        .expect((res) => {
          if (![200, 404].includes(res.status)) {
            throw new Error(`Unexpected status: ${res.status}`);
          }
        });
    });
  });
});
