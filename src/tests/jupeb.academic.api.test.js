const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('JUPEB academic API', () => {
  let academicMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_courses LIMIT 1');
      academicMigrated = true;
    } catch {
      academicMigrated = false;
      // eslint-disable-next-line no-console
      console.warn('[jupeb.academic.api] Skipping: apply migration `008_jupeb_academic.sql`.');
    }
  });

  const adminCredentials = {
    identifier: 'admin@example.com',
    password: 'Admin@12',
  };

  async function getAdminToken() {
    const res = await request(app).post('/auth/login').send(adminCredentials);
    if (res.status !== 200 || !res.body.data?.access_token) return null;
    return res.body.data.access_token;
  }

  it('GET /academic/courses without auth returns 200', async () => {
    if (!academicMigrated) return;
    const res = await request(app).get('/academic/courses');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('courses, bulk results, score, recompute', async () => {
    if (!academicMigrated) return;
    const token = await getAdminToken();
    if (!token) return;

    const suffix = Date.now();
    const c1 = await request(app)
      .post('/academic/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: nextJupebTestUniversityCode('C1'), title: 'Course One' });
    expect(c1.status).toBe(201);
    const c2 = await request(app)
      .post('/academic/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: nextJupebTestUniversityCode('C2'), title: 'Course Two' });
    expect(c2.status).toBe(201);

    const prefix = nextJupebTestPrefix();
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('ACU'),
        name: `Academic Uni ${suffix}`,
        jupeb_prefix: prefix,
      });
    expect(uniRes.status).toBe(201);
    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('ACS'),
        title: 'Combo',
        subjects: ['X', 'Y', 'Z'],
        is_global: true,
      });
    expect(scRes.status).toBe(201);
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const sessRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
      });
    expect(sessRes.status).toBe(201);
    const sessionId = sessRes.body.data.id;
    await closeAllOpenJupebSessions(token);
    await request(app).post(`/sessions/${sessionId}/open`).set('Authorization', `Bearer ${token}`);
    const regRes = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    expect(regRes.status).toBe(201);
    const registrationId = regRes.body.data.id;
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: regRes.body.data.institution_issued_code });

    const badGrade = await request(app)
      .post(`/academic/registrations/${registrationId}/results`)
      .set('Authorization', `Bearer ${token}`)
      .send({ results: [{ course_id: c1.body.data.id, grade: 'Z' }] });
    expect(badGrade.status).toBe(422);

    const save = await request(app)
      .post(`/academic/registrations/${registrationId}/results`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        results: [
          { course_id: c1.body.data.id, grade: 'A' },
          { course_id: c2.body.data.id, grade: 'F' },
        ],
      });
    expect(save.status).toBe(200);
    expect(save.body.data.length).toBe(2);

    const list = await request(app)
      .get(`/academic/registrations/${registrationId}/results`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(2);

    const score = await request(app)
      .get(`/academic/registrations/${registrationId}/score`)
      .set('Authorization', `Bearer ${token}`);
    expect(score.status).toBe(200);
    expect(score.body.data.aggregate.passed_courses_count).toBe(1);
    expect(score.body.data.aggregate.failed_courses_count).toBe(1);
    expect(score.body.data.aggregate.plus_one_total).toBe(1);
    expect(score.body.data.snapshot.plus_one_total).toBe(1);

    const re = await request(app)
      .post(`/academic/registrations/${registrationId}/recompute-score`)
      .set('Authorization', `Bearer ${token}`);
    expect(re.status).toBe(200);
    expect(re.body.data.plus_one_total).toBe(1);
  });
});
