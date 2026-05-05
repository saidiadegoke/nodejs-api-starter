const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

describe('Subject combination UX (auto-derive + bulk)', () => {
  let migrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_subjects LIMIT 1');
      migrated = true;
    } catch {
      migrated = false;
    }
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  function uniqueCode(tag = 'X') {
    return `${tag}${Date.now().toString(36)}${Math.floor(Math.random() * 9999)}`.toUpperCase().slice(0, 20);
  }

  async function seedSubjects(token, n = 3) {
    const codes = [];
    for (let i = 0; i < n; i += 1) {
      const code = uniqueCode(`AUT${i}`);
      const res = await request(app)
        .post('/catalog/subjects')
        .set('Authorization', `Bearer ${token}`)
        .send({ code, name: `Subject ${code}` });
      expect(res.status).toBe(201);
      codes.push(code);
    }
    return codes;
  }

  describe('M.1 auto-derive code & title', () => {
    it('creates a combo when only subjects are provided (auto code + title)', async () => {
      if (!migrated) return;
      const token = await getAdminToken();
      if (!token) return;
      const codes = await seedSubjects(token, 3);

      const res = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${token}`)
        .send({ subjects: codes, is_global: true });
      expect(res.status).toBe(201);
      expect(res.body.data.code).toBeDefined();
      expect(res.body.data.title).toBeDefined();
      expect(res.body.data.code.length).toBeGreaterThan(0);
      // Title concatenates the subject names in deterministic (sorted) order.
      const sortedNames = [...codes].sort().map((c) => `Subject ${c}`);
      expect(res.body.data.title).toContain(sortedNames[0]);

      await pool.query(`UPDATE jupeb_subjects SET deleted_at = CURRENT_TIMESTAMP WHERE code = ANY($1::text[])`, [codes]);
    });

    it('M.2 bulk uploads combinations from CSV', async () => {
      if (!migrated) return;
      const token = await getAdminToken();
      if (!token) return;
      const codes = await seedSubjects(token, 3);
      const csv = `subjects\n"${codes.join(',')}"\n"${codes.join(',')}"`;
      const res = await request(app)
        .post('/catalog/subject-combinations/bulk')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'text/csv')
        .send(csv);
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      // Surface outcome detail in the assertion message if anything failed.
      expect({ outcomes: res.body.data.outcomes, failed: res.body.data.failed }).toEqual(
        expect.objectContaining({ failed: 0 })
      );
      expect(res.body.data.succeeded).toBe(2);

      await pool.query(`UPDATE jupeb_subjects SET deleted_at = CURRENT_TIMESTAMP WHERE code = ANY($1::text[])`, [codes]);
    });

    describe('L.4-B dual-write into subject_combination_items', () => {
      let originalEnforce;
      beforeAll(() => {
        originalEnforce = process.env.JUPEB_ENFORCE_SUBJECT_CATALOG;
        process.env.JUPEB_ENFORCE_SUBJECT_CATALOG = 'true';
      });
      afterAll(() => {
        if (originalEnforce === undefined) delete process.env.JUPEB_ENFORCE_SUBJECT_CATALOG;
        else process.env.JUPEB_ENFORCE_SUBJECT_CATALOG = originalEnforce;
      });

      it('GET /catalog/subject-combinations/:id returns subject_items keyed by position', async () => {
        if (!migrated) return;
        const token = await getAdminToken();
        if (!token) return;
        const codes = await seedSubjects(token, 3);
        const create = await request(app)
          .post('/catalog/subject-combinations')
          .set('Authorization', `Bearer ${token}`)
          .send({ subjects: codes, is_global: true });
        expect(create.status).toBe(201);
        const id = create.body.data.id;

        const got = await request(app)
          .get(`/catalog/subject-combinations/${id}`)
          .set('Authorization', `Bearer ${token}`);
        expect(got.status).toBe(200);
        expect(Array.isArray(got.body.data.subject_items)).toBe(true);
        expect(got.body.data.subject_items.length).toBe(3);
        const positions = got.body.data.subject_items.map((s) => s.position);
        expect(positions).toEqual([0, 1, 2]);
        for (const item of got.body.data.subject_items) {
          expect(item.subject_id).toBeDefined();
          expect(item.code).toBeDefined();
          expect(item.name).toBeDefined();
        }
        // Legacy JSONB column has been dropped — subject_items is the single source of truth.
        expect(got.body.data.subjects).toBeUndefined();

        await pool.query(`UPDATE jupeb_subjects SET deleted_at = CURRENT_TIMESTAMP WHERE code = ANY($1::text[])`, [codes]);
      });

      it('PATCH replacing subjects replaces join rows in lockstep', async () => {
        if (!migrated) return;
        const token = await getAdminToken();
        if (!token) return;
        const initial = await seedSubjects(token, 3);
        const create = await request(app)
          .post('/catalog/subject-combinations')
          .set('Authorization', `Bearer ${token}`)
          .send({ subjects: initial, is_global: true });
        expect(create.status).toBe(201);
        const id = create.body.data.id;

        const replacement = await seedSubjects(token, 3);
        const patch = await request(app)
          .patch(`/catalog/subject-combinations/${id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ subjects: replacement });
        expect(patch.status).toBe(200);

        const got = await request(app)
          .get(`/catalog/subject-combinations/${id}`)
          .set('Authorization', `Bearer ${token}`);
        const codes = got.body.data.subject_items.map((s) => s.code);
        expect(codes.sort()).toEqual([...replacement].sort());

        await pool.query(`UPDATE jupeb_subjects SET deleted_at = CURRENT_TIMESTAMP WHERE code = ANY($1::text[])`, [
          [...initial, ...replacement],
        ]);
      });
    });

    it('still accepts explicit code/title when provided', async () => {
      if (!migrated) return;
      const token = await getAdminToken();
      if (!token) return;
      const codes = await seedSubjects(token, 3);
      const explicitCode = uniqueCode('CMB');
      const res = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: explicitCode, title: 'My Combo', subjects: codes, is_global: true });
      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe(explicitCode);
      expect(res.body.data.title).toBe('My Combo');

      await pool.query(`UPDATE jupeb_subjects SET deleted_at = CURRENT_TIMESTAMP WHERE code = ANY($1::text[])`, [codes]);
    });
  });
});
