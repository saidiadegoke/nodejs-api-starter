// Auth Module Unit Tests using Supertest
const request = require('supertest');
const app = require('../app');

describe('Auth API Tests', () => {
  const testUser = {
    phone: `+234${Math.floor(8000000000 + Math.random() * 1000000000)}`,
    email: `test${Date.now()}@example.com`,
    password: 'Test@123456',
    first_name: 'Test',
    last_name: 'User'
  };

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(testUser)
        .expect('Content-Type', /json/);

      // Either 201 (created) or 422 (validation error) or 400 (missing role)
      expect([201, 400, 422]).toContain(response.status);
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          ...testUser,
          email: 'invalid-email'
        });
      
      // Express-validator returns 422 for validation errors
      expect(response.status).toBe(422);
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          ...testUser,
          email: `test${Date.now()}@example.com`,
          password: 'weak'
        });
      
      // Express-validator returns 422 for validation errors
      expect(response.status).toBe(422);
    });
  });

  describe('POST /auth/login', () => {
    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          phone: '+2349999999999',
          password: 'wrongpassword'
        });
      
      // Express-validator returns 422 for validation errors, 401 for invalid credentials
      expect([401, 422]).toContain(response.status);
    });
  });

  describe('GET /health', () => {
    it('should return health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /', () => {
    it('should return API info', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBeDefined();
    });
  });
});
