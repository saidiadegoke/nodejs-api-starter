const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('PATCH /registration/me/academic-intake', () => {
  let intakeMigrated = false;

  beforeAll(async () => {
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'jupeb_registrations' AND column_name = 'sittings_count'`
      );
      intakeMigrated = r.rowCount > 0;
    } catch {
      intakeMigrated = false;
    }
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  async function makeRegistration(token, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} Intake Uni`,
          jupeb_prefix: nextJupebTestPrefix(),
        });
      if (uniRes.status === 201) break;
    }
    let scRes;
    for (let i = 0; i < 5; i += 1) {
      scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: nextJupebTestUniversityCode(`${tag}SC`),
          title: `${tag} Combo`,
          subjects: ['A', 'B', 'C'],
          is_global: true,
        });
      if (scRes.status === 201) break;
    }
    let sessRes;
    for (let i = 0; i < 5; i += 1) {
      const { y1, academicYear, yearShort } = nextJupebAcademicSession();
      sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          academic_year: academicYear,
          year_short: yearShort,
          opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
          closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        });
      if (sessRes.status === 201) break;
    }
    await closeAllOpenJupebSessions(token);
    await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${token}`);
    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessRes.body.data.id,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: createReg.body.data.institution_issued_code });
    return createReg.body.data.id;
  }

  it('persists sittings_count and result_types and surfaces them on /me/current', async () => {
    if (!intakeMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    await makeRegistration(token, 'AI');

    const patchRes = await request(app)
      .patch('/registration/me/academic-intake')
      .set('Authorization', `Bearer ${token}`)
      .send({ sittings_count: 2, result_types: ['waec', 'neco'] });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.sittings_count).toBe(2);
    expect(patchRes.body.data.result_types).toEqual(['waec', 'neco']);

    const cur = await request(app)
      .get('/registration/me/current')
      .set('Authorization', `Bearer ${token}`);
    expect(cur.body.data.sittings_count).toBe(2);
    expect(cur.body.data.result_types).toEqual(['waec', 'neco']);
  });

  it('rejects invalid sittings_count', async () => {
    if (!intakeMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    await makeRegistration(token, 'AIB');
    const res = await request(app)
      .patch('/registration/me/academic-intake')
      .set('Authorization', `Bearer ${token}`)
      .send({ sittings_count: 5, result_types: ['waec'] });
    expect(res.status).toBe(422);
  });
});
