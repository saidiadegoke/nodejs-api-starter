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

  describe('public read filtered by university_type', () => {
    it('GET /catalog/universities/public?type=federal returns only federal universities', async () => {
      if (!catalogMigrated) return;
      const token = await getAdminAccessToken();
      if (!token) return;
      let fed;
      for (let i = 0; i < 5; i += 1) {
        fed = await request(app)
          .post('/catalog/universities')
          .set('Authorization', `Bearer ${token}`)
          .send({
            code: nextJupebTestUniversityCode('FED'),
            name: `Federal Type Uni ${Date.now()}-${i}`,
            jupeb_prefix: nextJupebTestPrefix(),
            university_type: 'federal',
          });
        if (fed.status === 201) break;
      }
      expect(fed.status).toBe(201);
      let stt;
      for (let i = 0; i < 5; i += 1) {
        stt = await request(app)
          .post('/catalog/universities')
          .set('Authorization', `Bearer ${token}`)
          .send({
            code: nextJupebTestUniversityCode('STT'),
            name: `State Type Uni ${Date.now()}-${i}`,
            jupeb_prefix: nextJupebTestPrefix(),
            university_type: 'state',
          });
        if (stt.status === 201) break;
      }
      expect(stt.status).toBe(201);

      const res = await request(app).get('/catalog/universities/public?type=federal');
      expect(res.status).toBe(200);
      const ids = res.body.data.map((u) => u.id);
      expect(ids).toContain(fed.body.data.id);
      expect(ids).not.toContain(stt.body.data.id);
      for (const u of res.body.data) {
        expect(u.university_type).toBe('federal');
      }
    });

    it('rejects invalid type', async () => {
      const res = await request(app).get('/catalog/universities/public?type=bogus');
      expect(res.status).toBe(422);
    });
  });

  describe('institution contact fields', () => {
    it('persists and returns email, address, phone, expected_candidate_count, description', async () => {
      if (!catalogMigrated) return;
      const token = await getAdminAccessToken();
      if (!token) return;
      let create;
      for (let i = 0; i < 5; i += 1) {
        create = await request(app)
          .post('/catalog/universities')
          .set('Authorization', `Bearer ${token}`)
          .send({
            code: nextJupebTestUniversityCode('CT'),
            name: 'Contact Uni',
            jupeb_prefix: nextJupebTestPrefix(),
            email: 'registry@contact.edu.ng',
            address: '123 Lecture Way, Lagos',
            phone: '+2348012345678',
            expected_candidate_count: 1500,
            description: 'A flagship institution',
          });
        if (create.status === 201) break;
      }
      expect(create.status).toBe(201);
      expect(create.body.data.email).toBe('registry@contact.edu.ng');
      expect(create.body.data.address).toBe('123 Lecture Way, Lagos');
      expect(create.body.data.phone).toBe('+2348012345678');
      expect(create.body.data.expected_candidate_count).toBe(1500);
      expect(create.body.data.description).toBe('A flagship institution');

      const patch = await request(app)
        .patch(`/catalog/universities/${create.body.data.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '+2349000000000', expected_candidate_count: 2000 });
      expect(patch.status).toBe(200);
      expect(patch.body.data.phone).toBe('+2349000000000');
      expect(patch.body.data.expected_candidate_count).toBe(2000);
    });

    it('bulk uploads institutions from CSV', async () => {
      if (!catalogMigrated) return;
      const token = await getAdminAccessToken();
      if (!token) return;
      const c1 = nextJupebTestUniversityCode('BLK1');
      const c2 = nextJupebTestUniversityCode('BLK2');
      const p1 = nextJupebTestPrefix();
      const p2 = nextJupebTestPrefix();
      const csv =
        `code,name,jupeb_prefix,university_type,email,address,phone,expected_candidate_count,description\n` +
        `${c1},Bulk One,${p1},federal,one@bulk.edu,Addr 1,+2348111111111,500,first\n` +
        `${c2},Bulk Two,${p2},state,two@bulk.edu,Addr 2,+2348222222222,750,second\n` +
        `,Missing Code,${nextJupebTestPrefix()},federal,oops@bulk.edu,Addr,,0,no code`;
      const res = await request(app)
        .post('/catalog/universities/bulk')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'text/csv')
        .send(csv);
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.succeeded).toBe(2);
      expect(res.body.data.failed).toBe(1);
    });

    it('rejects negative expected_candidate_count and malformed email', async () => {
      if (!catalogMigrated) return;
      const token = await getAdminAccessToken();
      if (!token) return;
      const bad = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: nextJupebTestUniversityCode('BAD'),
          name: 'Bad Contact Uni',
          jupeb_prefix: nextJupebTestPrefix(),
          expected_candidate_count: -5,
        });
      expect(bad.status).toBe(422);

      const badEmail = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: nextJupebTestUniversityCode('BD2'),
          name: 'Bad Email Uni',
          jupeb_prefix: nextJupebTestPrefix(),
          email: 'not-an-email',
        });
      expect(badEmail.status).toBe(422);
    });
  });
});
