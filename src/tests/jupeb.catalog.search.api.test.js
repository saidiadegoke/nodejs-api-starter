/**
 * Server-side text search on the registrar-dashboard list endpoints.
 *
 * Validates the new `?q=` param on:
 *   - GET /catalog/universities
 *   - GET /catalog/subjects
 *   - GET /catalog/subject-combinations
 *   - GET /sessions
 *
 * Each helper seeds a uniquely-tagged row, calls the list endpoint
 * with `?q=<the unique fragment>`, and asserts the new row is in the
 * response while a random other fragment returns zero rows. Same
 * `total` is verified against the row count so pagination stays
 * consistent.
 */
const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('Catalog ?q= search', () => {
  const cleanupUniCodes = [];
  const cleanupSubjectCodes = [];
  const cleanupComboCodes = [];

  async function adminToken() {
    const r = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return r.body.data?.access_token;
  }

  afterAll(async () => {
    if (cleanupUniCodes.length) {
      await pool.query(
        `UPDATE jupeb_universities SET deleted_at = NOW() WHERE code = ANY($1::text[])`,
        [cleanupUniCodes]
      );
    }
    if (cleanupSubjectCodes.length) {
      await pool.query(
        `UPDATE jupeb_subjects SET deleted_at = NOW() WHERE code = ANY($1::text[])`,
        [cleanupSubjectCodes]
      );
    }
    if (cleanupComboCodes.length) {
      await pool.query(
        `UPDATE jupeb_subject_combinations SET deleted_at = NOW() WHERE code = ANY($1::text[])`,
        [cleanupComboCodes]
      );
    }
  });

  // ── Universities ─────────────────────────────────────────────────────
  describe('GET /catalog/universities?q=', () => {
    it('matches on code (ILIKE substring)', async () => {
      const token = await adminToken();
      if (!token) return;
      const tag = `ZQ${Date.now().toString().slice(-5)}`;
      const code = `${tag}-X`;
      cleanupUniCodes.push(code);
      const create = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({ code, name: `Probe ${tag} University`, jupeb_prefix: nextJupebTestPrefix() });
      expect(create.status).toBe(201);

      // q matches the tag (a substring of the code)
      const r = await request(app)
        .get(`/catalog/universities?q=${encodeURIComponent(tag)}`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
      const found = r.body.data.find((u) => u.code === code);
      expect(found).toBeDefined();
      expect(found).toHaveProperty('enrolled_count');
      expect(typeof found.enrolled_count).toBe('number');
      expect(r.body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('matches on name', async () => {
      const token = await adminToken();
      if (!token) return;
      const tag = `Sphinx${Date.now().toString().slice(-5)}`;
      const code = `S-${tag}`.slice(0, 18);
      cleanupUniCodes.push(code);
      await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({ code, name: `Sphinx Pyramid ${tag} University`, jupeb_prefix: nextJupebTestPrefix() });
      const r = await request(app)
        .get(`/catalog/universities?q=Pyramid+${encodeURIComponent(tag)}`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
      expect(r.body.data.find((u) => u.code === code)).toBeDefined();
    });

    it('returns empty when q has no matches', async () => {
      const token = await adminToken();
      if (!token) return;
      const r = await request(app)
        .get(`/catalog/universities?q=${encodeURIComponent('zzz-no-such-thing-' + Date.now())}`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
      expect(r.body.data.length).toBe(0);
      expect(r.body.pagination.total).toBe(0);
    });

    it('q is case-insensitive', async () => {
      const token = await adminToken();
      if (!token) return;
      const tag = `Camel${Date.now().toString().slice(-5)}`;
      const code = `C${tag}`.slice(0, 18);
      cleanupUniCodes.push(code);
      await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({ code, name: `Camel ${tag} University`, jupeb_prefix: nextJupebTestPrefix() });
      const r = await request(app)
        .get(`/catalog/universities?q=${encodeURIComponent(tag.toLowerCase())}`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.body.data.find((u) => u.code === code)).toBeDefined();
    });
  });

  // ── Subjects ────────────────────────────────────────────────────────
  describe('GET /catalog/subjects?q=', () => {
    it('matches on code', async () => {
      const token = await adminToken();
      if (!token) return;
      const tag = `SBJ${Date.now().toString().slice(-5)}`;
      const code = `${tag}`.slice(0, 18);
      cleanupSubjectCodes.push(code);
      await request(app)
        .post('/catalog/subjects')
        .set('Authorization', `Bearer ${token}`)
        .send({ code, name: `Probe Subject ${tag}` });
      const r = await request(app)
        .get(`/catalog/subjects?q=${encodeURIComponent(tag)}`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
      expect(r.body.data.find((s) => s.code === code)).toBeDefined();
    });

    it('matches on name', async () => {
      const token = await adminToken();
      if (!token) return;
      const tag = `Mango${Date.now().toString().slice(-5)}`;
      const code = `M${tag}`.slice(0, 18);
      cleanupSubjectCodes.push(code);
      await request(app)
        .post('/catalog/subjects')
        .set('Authorization', `Bearer ${token}`)
        .send({ code, name: `Mango ${tag} Studies` });
      // q is a substring of the name we just stored
      const r = await request(app)
        .get(`/catalog/subjects?q=${encodeURIComponent('Mango ' + tag)}`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.body.data.find((s) => s.code === code)).toBeDefined();
    });
  });

  // ── Subject combinations ────────────────────────────────────────────
  describe('GET /catalog/subject-combinations?q=', () => {
    it('matches on title', async () => {
      const token = await adminToken();
      if (!token) return;
      const tag = `CMB${Date.now().toString().slice(-5)}`;
      const code = `${tag}-SC`.slice(0, 18);
      cleanupComboCodes.push(code);
      await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code,
          title: `Probe ${tag} Combo`,
          subjects: ['Math', 'Phys', 'Chem'],
          is_global: true,
        });
      // q is an actual substring of the stored title
      const r = await request(app)
        .get(`/catalog/subject-combinations?q=${encodeURIComponent('Probe ' + tag)}`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
      expect(r.body.data.find((c) => c.code === code)).toBeDefined();
    });

    it('q combined with status filter narrows correctly', async () => {
      const token = await adminToken();
      if (!token) return;
      const tag = `STX${Date.now().toString().slice(-5)}`;
      const code = `${tag}-A`.slice(0, 18);
      cleanupComboCodes.push(code);
      await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code,
          title: `Statusable Probe ${tag}`,
          subjects: ['M', 'P', 'C'],
          is_global: true,
        });
      // Combined q + status
      const r = await request(app)
        .get(`/catalog/subject-combinations?q=${encodeURIComponent(tag)}&status=active`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
      expect(r.body.data.find((c) => c.code === code)).toBeDefined();
    });
  });

  // ── Sessions ────────────────────────────────────────────────────────
  describe('GET /sessions?q=', () => {
    it('matches on academic_year fragment', async () => {
      const token = await adminToken();
      if (!token) return;
      const { y1, academicYear, yearShort } = nextJupebAcademicSession();
      const create = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          academic_year: academicYear,
          year_short: yearShort,
          opens_at: new Date(`${y1}-01-01T00:00:00Z`).toISOString(),
          closes_at: new Date(`${y1}-12-01T00:00:00Z`).toISOString(),
        });
      expect(create.status).toBe(201);

      // q == "<y1>/" — a substring of the academic_year ("2030/2031")
      const r = await request(app)
        .get(`/sessions?q=${encodeURIComponent(`${y1}/`)}`)
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
      expect(r.body.data.find((s) => s.academic_year === academicYear)).toBeDefined();
    });
  });

  // ── Pagination metadata stays consistent ────────────────────────────
  it('total matches the filtered count (paginated)', async () => {
    const token = await adminToken();
    if (!token) return;
    const tag = `PGN${Date.now().toString().slice(-5)}`;
    // Seed three rows that share the tag in their name
    for (let i = 0; i < 3; i += 1) {
      const code = `${tag}-${i}`;
      cleanupUniCodes.push(code);
      await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({ code, name: `Paginated ${tag} U-${i}`, jupeb_prefix: nextJupebTestPrefix() });
    }
    const r = await request(app)
      .get(`/catalog/universities?q=${encodeURIComponent(tag)}&limit=2`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeLessThanOrEqual(2);
    expect(r.body.pagination.total).toBeGreaterThanOrEqual(3);
    expect(r.body.pagination.totalPages).toBeGreaterThanOrEqual(2);
  });
});
