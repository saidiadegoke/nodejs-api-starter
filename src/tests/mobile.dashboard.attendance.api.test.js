const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('Mobile dashboard + attendance API', () => {
  let registrationMigrated = false;

  beforeAll(async () => {
    process.env.ATTENDANCE_PROVIDER = 'mock';
    process.env.CRMS_PROVIDER = 'mock';
    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
      // eslint-disable-next-line no-console
      console.warn('[mobile.dashboard] Skipping: jupeb_registrations missing');
    }
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  async function claimRegistration(adminToken, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} Mobile Uni`,
          short_name: `${tag}MU`,
          jupeb_prefix: nextJupebTestPrefix(),
          email: `${tag.toLowerCase()}-${Date.now()}@mobile-test.edu.ng`,
        });
      if (uniRes.status === 201) break;
    }
    let scRes;
    for (let i = 0; i < 5; i += 1) {
      scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(`${tag}SC`),
          title: `${tag} Combo`,
          subjects: ['Math', 'Phys', 'Chem'],
          is_global: true,
        });
      if (scRes.status === 201) break;
    }
    let sessRes;
    for (let i = 0; i < 5; i += 1) {
      const { y1, academicYear, yearShort } = nextJupebAcademicSession();
      sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          academic_year: academicYear,
          year_short: yearShort,
          opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
          closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        });
      if (sessRes.status === 201) break;
    }
    await closeAllOpenJupebSessions(adminToken);
    await request(app)
      .post(`/sessions/${sessRes.body.data.id}/open`)
      .set('Authorization', `Bearer ${adminToken}`);
    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessRes.body.data.id,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    expect(createReg.status).toBe(201);
    const claim = await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ institution_issued_code: createReg.body.data.institution_issued_code });
    expect([200, 201]).toContain(claim.status);
    return createReg.body.data;
  }

  it('GET /dashboard/home|courses|results compose mock providers', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    await claimRegistration(token, 'MDH');

    const home = await request(app)
      .get('/dashboard/home')
      .set('Authorization', `Bearer ${token}`);
    expect(home.status).toBe(200);
    expect(home.body.data.summary).toMatchObject({
      attendance_percent: 96,
      subjects_count: 3,
    });
    expect(Array.isArray(home.body.data.todays_classes)).toBe(true);
    expect(typeof home.body.data.unread_notifications_count).toBe('number');

    const courses = await request(app)
      .get('/dashboard/courses')
      .set('Authorization', `Bearer ${token}`);
    expect(courses.status).toBe(200);
    expect(courses.body.data.courses.length).toBeGreaterThan(0);

    const results = await request(app)
      .get('/dashboard/results')
      .set('Authorization', `Bearer ${token}`);
    expect(results.status).toBe(200);
    expect(results.body.data.exam_scores.length).toBeGreaterThan(0);
  });

  it('GET /attendance/* endpoints work with mock provider', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    await claimRegistration(token, 'MAT');

    const home = await request(app)
      .get('/attendance/home')
      .set('Authorization', `Bearer ${token}`);
    expect(home.status).toBe(200);
    expect(home.body.data.summary.attendance_percent).toBe(96);

    const summary = await request(app)
      .get('/attendance/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(summary.status).toBe(200);
    expect(summary.body.data.total_marked).toBe(14);

    const classes = await request(app)
      .get('/attendance/classes')
      .query({ q: 'ELE' })
      .set('Authorization', `Bearer ${token}`);
    expect(classes.status).toBe(200);
    expect(Array.isArray(classes.body.data)).toBe(true);

    const history = await request(app)
      .get('/attendance/history')
      .set('Authorization', `Bearer ${token}`);
    expect(history.status).toBe(200);

    const sessions = await request(app)
      .get('/attendance/classes/ELE%20202/sessions')
      .set('Authorization', `Bearer ${token}`);
    expect(sessions.status).toBe(200);
    expect(sessions.body.data.length).toBeGreaterThan(0);

    const badMonth = await request(app)
      .get('/attendance/timetable')
      .query({ month: '07-2026' })
      .set('Authorization', `Bearer ${token}`);
    expect(badMonth.status).toBe(422);

    const timetable = await request(app)
      .get('/attendance/timetable')
      .query({ month: '2026-07' })
      .set('Authorization', `Bearer ${token}`);
    expect(timetable.status).toBe(200);
    expect(Array.isArray(timetable.body.data.marked_dates)).toBe(true);
  });

  it('staff analytics routes remain permission-gated', async () => {
    const res = await request(app).get('/dashboard/stat-cards');
    expect(res.status).toBe(401);
  });
});
