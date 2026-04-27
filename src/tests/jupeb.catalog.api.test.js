const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const { nextJupebTestPrefix, nextJupebTestUniversityCode } = require('./jupeb-session-test-helpers');

/**
 * Integration tests for 001 JUPEB catalog (requires migrated DB + seed admin).
 * Run: npm run migrate (includes `002_jupeb_catalog.sql`) then npm run seed, then: npm run test:jupeb
 */
describe('JUPEB catalog API', () => {
  let catalogMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_universities LIMIT 1');
      catalogMigrated = true;
    } catch {
      catalogMigrated = false;
      // eslint-disable-next-line no-console
      console.warn(
        '[jupeb.catalog.api] Skipping DB-backed assertions: run migrations so `002_jupeb_catalog.sql` is applied.'
      );
    }
  });

  const adminCredentials = {
    identifier: 'admin@example.com',
    password: 'Admin@12',
  };

  async function getAdminAccessToken() {
    const res = await request(app).post('/auth/login').send(adminCredentials);
    if (res.status !== 200 || !res.body.data?.access_token) {
      return null;
    }
    return res.body.data.access_token;
  }

  describe('public read', () => {
    it('GET /catalog/universities/public returns 200 JSON', async () => {
      if (!catalogMigrated) return;
      const res = await request(app)
        .get('/catalog/universities/public')
        .expect('Content-Type', /json/);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /catalog/subject-combinations/public returns 200 JSON', async () => {
      if (!catalogMigrated) return;
      const res = await request(app)
        .get('/catalog/subject-combinations/public')
        .expect('Content-Type', /json/);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('write RBAC', () => {
    it('POST /catalog/universities without token returns 401', async () => {
      const res = await request(app).post('/catalog/universities').send({
        code: 'UI',
        name: 'University of Ibadan',
        jupeb_prefix: '001',
      });
      expect(res.status).toBe(401);
    });

    it('POST /catalog/universities with admin token creates university', async () => {
      if (!catalogMigrated) return;
      const token = await getAdminAccessToken();
      if (!token) {
        // eslint-disable-next-line no-console
        console.warn('Skipping admin catalog test: login failed (DB/seed?)');
        return;
      }
      const suffix = Date.now();
      const prefix = nextJupebTestPrefix();
      const res = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: nextJupebTestUniversityCode('TST'),
          name: `Test University ${suffix}`,
          jupeb_prefix: prefix,
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.jupeb_prefix).toMatch(/^\d{3}$/);
    });

    it('POST /catalog/universities rejects invalid jupeb_prefix', async () => {
      if (!catalogMigrated) return;
      const token = await getAdminAccessToken();
      if (!token) return;
      const res = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: nextJupebTestUniversityCode('INV'),
          name: 'Invalid prefix uni',
          jupeb_prefix: '01',
        });
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });
});
