// Admin module tests (error-logs, settings, audit) using Supertest
const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

describe('Admin API Tests', () => {
  let userToken;      // regular user
  let adminToken;     // admin user
  let createdUserIds = [];

  // ---------------- helpers ----------------
  let phoneCounter = Date.now() % 1000000000;
  const nextPhone = () => {
    phoneCounter += 1;
    return `+234${String(phoneCounter).padStart(10, '0').slice(-10)}`;
  };

  const registerAndLogin = async (role) => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const payload = {
      email: `admintest_${role}_${suffix}@example.com`,
      phone: nextPhone(),
      password: 'Test@123456',
      first_name: 'Admin',
      last_name: 'Test',
      role,
    };
    const res = await request(app).post('/auth/register').send(payload);
    if (res.status !== 201) throw new Error(`register failed for ${role}: ${res.status} ${JSON.stringify(res.body)}`);
    createdUserIds.push(res.body.data.user.user_id);
    return res.body.data.access_token;
  };

  beforeAll(async () => {
    userToken = await registerAndLogin('user');
    adminToken = await registerAndLogin('admin');
  });

  afterAll(async () => {
    await pool.query("DELETE FROM platform_settings WHERE key LIKE 'test_%'");
    await pool.query("DELETE FROM admin_audit_logs WHERE action = 'update_setting' AND resource_id LIKE 'test_%'");
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  // ---------------- error-logs ----------------
  describe('Error Logs', () => {
    it('GET /admin/error-logs requires auth', async () => {
      const res = await request(app).get('/admin/error-logs');
      expect(res.status).toBe(401);
    });

    it('GET /admin/error-logs rejects non-admin users', async () => {
      const res = await request(app)
        .get('/admin/error-logs')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('GET /admin/error-logs returns paginated entries for admin', async () => {
      const res = await request(app)
        .get('/admin/error-logs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('entries');
      expect(Array.isArray(res.body.data.entries)).toBe(true);
      expect(res.body.data).toHaveProperty('total');
    });

    it('GET /admin/error-logs supports the type filter', async () => {
      const res = await request(app)
        .get('/admin/error-logs?type=5xx')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it('GET /admin/error-logs/stats returns aggregate stats', async () => {
      const res = await request(app)
        .get('/admin/error-logs/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('total_errors');
      expect(res.body.data).toHaveProperty('total_requests');
    });

    it('GET /admin/error-logs/:id with unknown id returns 4xx', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/admin/error-logs/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect([400, 404]).toContain(res.status);
    });
  });

  // ---------------- settings ----------------
  describe('Platform Settings', () => {
    const testKey = `test_flag_${Date.now()}`;

    it('GET /admin/settings rejects non-admin', async () => {
      const res = await request(app)
        .get('/admin/settings')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('PUT /admin/settings upserts a setting', async () => {
      const res = await request(app)
        .put('/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ key: testKey, value: true, description: 'test flag' });
      expect(res.status).toBe(200);
      expect(res.body.data.key).toBe(testKey);
    });

    it('GET /admin/settings returns the upserted setting', async () => {
      const res = await request(app)
        .get('/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((s) => s.key === testKey);
      expect(found).toBeDefined();
    });

    it('PUT /admin/settings requires key', async () => {
      const res = await request(app)
        .put('/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: true });
      expect(res.status).toBe(400);
    });

    it('PUT /admin/settings requires value', async () => {
      const res = await request(app)
        .put('/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ key: 'test_no_value' });
      expect(res.status).toBe(400);
    });
  });

  // ---------------- audit ----------------
  describe('Audit Log', () => {
    it('GET /admin/audit rejects non-admin', async () => {
      const res = await request(app)
        .get('/admin/audit')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('GET /admin/audit returns paginated logs for admin', async () => {
      const res = await request(app)
        .get('/admin/audit')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
    });

    it('audit entry is recorded when a setting is updated', async () => {
      const key = `test_audit_${Date.now()}`;
      const put = await request(app)
        .put('/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ key, value: { flag: true } });
      expect(put.status).toBe(200);

      const audit = await request(app)
        .get(`/admin/audit?resource_type=platform_setting&action=update_setting`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(audit.status).toBe(200);
      const hit = audit.body.data.find((l) => l.resource_id === key);
      expect(hit).toBeDefined();
    });
  });
});
