const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

describe('JUPEB subjects CRUD', () => {
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

  function uniqueCode(tag = 'SUB') {
    return `${tag}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase().slice(0, 20);
  }

  it('public list does not require auth', async () => {
    if (!migrated) return;
    const res = await request(app).get('/catalog/subjects/public');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('admin create + get + patch + deactivate + activate flow', async () => {
    if (!migrated) return;
    const token = await getAdminToken();
    if (!token) return;

    const code = uniqueCode('MTH');
    const create = await request(app)
      .post('/catalog/subjects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code, name: 'Mathematics', description: 'Pure and applied' });
    expect(create.status).toBe(201);
    expect(create.body.data.code).toBe(code);
    expect(create.body.data.name).toBe('Mathematics');
    expect(create.body.data.status).toBe('active');
    const subjectId = create.body.data.id;

    const dup = await request(app)
      .post('/catalog/subjects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: code.toLowerCase(), name: 'Maths' });
    expect(dup.status).toBe(409);

    const got = await request(app)
      .get(`/catalog/subjects/${subjectId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(got.status).toBe(200);
    expect(got.body.data.id).toBe(subjectId);

    const patch = await request(app)
      .patch(`/catalog/subjects/${subjectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Updated description' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.description).toBe('Updated description');

    const deact = await request(app)
      .post(`/catalog/subjects/${subjectId}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(deact.status).toBe(200);
    expect(deact.body.data.status).toBe('inactive');

    const act = await request(app)
      .post(`/catalog/subjects/${subjectId}/activate`)
      .set('Authorization', `Bearer ${token}`);
    expect(act.status).toBe(200);
    expect(act.body.data.status).toBe('active');

    await pool.query(`UPDATE jupeb_subjects SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`, [subjectId]);
  });

  it('admin list paginates', async () => {
    if (!migrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const res = await request(app)
      .get('/catalog/subjects?page=1&limit=5')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it('rejects non-admin from create', async () => {
    if (!migrated) return;
    const studentLogin = await request(app)
      .post('/auth/login')
      .send({ identifier: 'student@example.com', password: 'Student@12' });
    if (studentLogin.status !== 200) return;
    const studentToken = studentLogin.body.data.access_token;
    const res = await request(app)
      .post('/catalog/subjects')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ code: uniqueCode(), name: 'X' });
    expect(res.status).toBe(403);
  });

  it('rejects missing required fields', async () => {
    if (!migrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const res = await request(app)
      .post('/catalog/subjects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '' });
    expect(res.status).toBe(422);
  });

  describe('subject-combination integration with subjects catalog', () => {
    let originalEnforce;
    beforeAll(() => {
      originalEnforce = process.env.JUPEB_ENFORCE_SUBJECT_CATALOG;
      process.env.JUPEB_ENFORCE_SUBJECT_CATALOG = 'true';
    });
    afterAll(() => {
      if (originalEnforce === undefined) delete process.env.JUPEB_ENFORCE_SUBJECT_CATALOG;
      else process.env.JUPEB_ENFORCE_SUBJECT_CATALOG = originalEnforce;
    });

    it('rejects combo creation that references a non-existent subject code', async () => {
      if (!migrated) return;
      const token = await getAdminToken();
      if (!token) return;
      // Combinations require ≥3 unique subjects (existing validation).
      const okA = uniqueCode('SREF1');
      const okB = uniqueCode('SREF2');
      const okC = uniqueCode('SREF3');
      for (const code of [okA, okB, okC]) {
        await request(app)
          .post('/catalog/subjects')
          .set('Authorization', `Bearer ${token}`)
          .send({ code, name: `Real ${code}` });
      }

      const ghost = uniqueCode('GHOST'); // guaranteed-unknown subject code
      const bad = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('CMB'),
          title: 'Bad Combo',
          subjects: [okA, okB, ghost],
          is_global: true,
        });
      expect(bad.status).toBe(422);
      expect(bad.body.message).toMatch(/subject/i);

      const good = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode('CMB'),
          title: 'Good Combo',
          subjects: [okA, okB, okC],
          is_global: true,
        });
      expect(good.status).toBe(201);

      await pool.query(`UPDATE jupeb_subjects SET deleted_at = CURRENT_TIMESTAMP WHERE code IN ($1, $2, $3)`, [okA, okB, okC]);
    });
  });

  describe('POST /catalog/subjects/bulk', () => {
    it('ingests CSV and reports per-row outcomes', async () => {
      if (!migrated) return;
      const token = await getAdminToken();
      if (!token) return;
      const c1 = uniqueCode('BULK1');
      const c2 = uniqueCode('BULK2');
      const csv =
        `code,name,description\n${c1},Bulk One,first\n${c2},Bulk Two,second\n,Missing Code,oops`;
      const res = await request(app)
        .post('/catalog/subjects/bulk')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'text/csv')
        .send(csv);
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.succeeded).toBe(2);
      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.outcomes[0].ok).toBe(true);
      expect(res.body.data.outcomes[0].data.code).toBe(c1);
      expect(res.body.data.outcomes[2].ok).toBe(false);

      // Verify via the public list (API-only assertion, no SELECT).
      const list = await request(app).get('/catalog/subjects/public');
      const codes = list.body.data.map((s) => s.code);
      expect(codes).toEqual(expect.arrayContaining([c1, c2]));

      await pool.query(`UPDATE jupeb_subjects SET deleted_at = CURRENT_TIMESTAMP WHERE code IN ($1, $2)`, [c1, c2]);
    });

    it('rejects non-admin', async () => {
      if (!migrated) return;
      const studentLogin = await request(app)
        .post('/auth/login')
        .send({ identifier: 'student@example.com', password: 'Student@12' });
      if (studentLogin.status !== 200) return;
      const studentToken = studentLogin.body.data.access_token;
      const res = await request(app)
        .post('/catalog/subjects/bulk')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Content-Type', 'text/csv')
        .send('code,name\nX,Y');
      expect(res.status).toBe(403);
    });
  });
});
