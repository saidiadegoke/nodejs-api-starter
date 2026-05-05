// Assets Module Unit Tests using Supertest
const request = require('supertest');
const app = require('../app');

describe('Assets API Tests', () => {
  describe('GET /assets (unauthenticated)', () => {
    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/assets')
        .expect(401);
    });
  });

  describe('GET /assets/usage (unauthenticated)', () => {
    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/assets/usage')
        .expect(401);
    });
  });

  describe('POST /assets/upload (unauthenticated)', () => {
    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .post('/assets/upload')
        .expect(401);
    });
  });

  describe('GET /assets/groups (unauthenticated)', () => {
    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/assets/groups')
        .expect(401);
    });
  });

  describe('GET /assets/:id (unauthenticated)', () => {
    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/assets/123')
        .expect(401);
    });
  });

  describe('DELETE /assets/:id (unauthenticated)', () => {
    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .delete('/assets/123')
        .expect(401);
    });
  });
});
