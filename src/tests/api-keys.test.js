const bcrypt = require('bcryptjs');
const request = require('supertest');
const { getAppUnderTest } = require('./helpers/app-under-test');
const pool = require('../database/pool');

describe('API Keys API Tests', () => {
  let app;
  let token;
  let userId;
  let createdUserIds = [];
  let createdKeyIds = [];

  beforeAll(async () => {
    app = await getAppUnderTest();
    const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const email = `apikeys_${suffix}@example.com`;
    const phone = `+2348${String(Date.now()).slice(-9)}`;
    const rawPassword = 'Test@123456';
    const passwordHash = bcrypt.hashSync(rawPassword, 10);

    const userRes = await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active')
       RETURNING id`,
      [email, phone, passwordHash]
    );
    userId = userRes.rows[0].id;
    createdUserIds.push(userId);

    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name)
       VALUES ($1, 'Api', 'Keys', 'Api Keys')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ identifier: email, password: rawPassword });

    if (loginRes.status !== 200 || !loginRes.body.data?.access_token) {
      throw new Error(`login failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }

    token = loginRes.body.data.access_token;
  });

  afterAll(async () => {
    if (createdKeyIds.length) {
      await pool.query('DELETE FROM api_keys WHERE id = ANY($1::uuid[])', [createdKeyIds]);
    }
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  describe('Auth gate', () => {
    it('GET /api-keys requires auth', async () => {
      const res = await request(app).get('/api-keys');
      expect(res.status).toBe(401);
    });
    it('POST /api-keys requires auth', async () => {
      const res = await request(app).post('/api-keys').send({ name: 'x' });
      expect(res.status).toBe(401);
    });
  });

  describe('Validation', () => {
    it('POST /api-keys requires a name', async () => {
      const res = await request(app)
        .post('/api-keys')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([400, 422]).toContain(res.status);
    });

    it('DELETE /api-keys/:id rejects non-UUID id', async () => {
      const res = await request(app)
        .delete('/api-keys/not-a-uuid')
        .set('Authorization', `Bearer ${token}`);
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('Lifecycle', () => {
    let createdId;

    it('POST /api-keys generates a new key (returns raw key once)', async () => {
      const res = await request(app)
        .post('/api-keys')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test key' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('key');
      expect(res.body.data.key).toMatch(/^sk_live_[a-f0-9]+$/);
      expect(res.body.data).toHaveProperty('key_prefix');
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.status).toBe('active');
      createdId = res.body.data.id;
      createdKeyIds.push(createdId);
    });

    it('GET /api-keys lists the key without the hash or raw value', async () => {
      const res = await request(app)
        .get('/api-keys')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const found = res.body.data.find((k) => k.id === createdId);
      expect(found).toBeDefined();
      expect(found).not.toHaveProperty('key_hash');
      expect(found).not.toHaveProperty('key');
    });

    it('DELETE /api-keys/:id revokes the key', async () => {
      const res = await request(app)
        .delete(`/api-keys/${createdId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('revoked');
    });

    it('Revoked keys still appear in the list with revoked status', async () => {
      const res = await request(app)
        .get('/api-keys')
        .set('Authorization', `Bearer ${token}`);
      const found = res.body.data.find((k) => k.id === createdId);
      expect(found).toBeDefined();
      expect(found.status).toBe('revoked');
    });

    it('DELETE /api-keys/:id on unknown id returns 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .delete(`/api-keys/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });
});
