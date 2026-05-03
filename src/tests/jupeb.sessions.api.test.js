const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const { closeAllOpenJupebSessions, nextJupebAcademicSession } = require('./jupeb-session-test-helpers');

/**
 * Integration tests for 002 JUPEB sessions (requires `003_jupeb_sessions.sql` + seed admin).
 */
describe('JUPEB sessions API', () => {
  let sessionsMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registration_sessions LIMIT 1');
      sessionsMigrated = true;
    } catch {
      sessionsMigrated = false;
      // eslint-disable-next-line no-console
      console.warn(
        '[jupeb.sessions.api] Skipping DB-backed tests: apply migration `003_jupeb_sessions.sql`.'
      );
    }
  });

  const adminCredentials = {
    identifier: 'admin@example.com',
    password: 'Admin@12',
  };

  async function getAdminAccessToken() {
    const res = await request(app).post('/auth/login').send(adminCredentials);
    if (res.status !== 200 || !res.body.data?.access_token) return null;
    return res.body.data.access_token;
  }

  it('GET /sessions without token returns 401', async () => {
    const res = await request(app).get('/sessions');
    expect(res.status).toBe(401);
  });

  it('POST /sessions without token returns 401', async () => {
    const res = await request(app).post('/sessions').send({});
    expect(res.status).toBe(401);
  });

  it('registrar/admin can create, open, close session lifecycle', async () => {
    if (!sessionsMigrated) return;
    const token = await getAdminAccessToken();
    if (!token) {
      // eslint-disable-next-line no-console
      console.warn('[jupeb.sessions.api] Skipping: admin login failed');
      return;
    }
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();

    const createRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        notes: 'integration test',
      });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.data.id;

    await closeAllOpenJupebSessions(token);
    const openRes = await request(app)
      .post(`/sessions/${sessionId}/open`)
      .set('Authorization', `Bearer ${token}`);
    expect(openRes.status).toBe(200);
    expect(openRes.body.data.status).toBe('open');

    const closeRes = await request(app)
      .post(`/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${token}`);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe('closed');

    const closeAgain = await request(app)
      .post(`/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${token}`);
    expect(closeAgain.status).toBe(200);

    const finRes = await request(app)
      .post(`/sessions/${sessionId}/finalize-candidate-numbers`)
      .set('Authorization', `Bearer ${token}`);
    expect(finRes.status).toBe(200);
    expect(finRes.body.data).toHaveProperty('assigned');
    expect(typeof finRes.body.data.assigned).toBe('number');
  });

  it('persists cutoff dates, fees, max_ca_score, description', async () => {
    if (!sessionsMigrated) return;
    const token = await getAdminAccessToken();
    if (!token) return;
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const opens = new Date(`${y1}-01-01T00:00:00.000Z`).toISOString();
    const closes = new Date(`${y1}-06-01T00:00:00.000Z`).toISOString();
    const candidateCutoff = new Date(`${y1}-07-01T00:00:00.000Z`).toISOString();
    const profileCutoff = new Date(`${y1}-08-01T00:00:00.000Z`).toISOString();
    const caCutoff = new Date(`${y1}-09-01T00:00:00.000Z`).toISOString();
    const create = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: opens,
        closes_at: closes,
        candidate_info_cutoff_at: candidateCutoff,
        profile_update_cutoff_at: profileCutoff,
        ca_cutoff_at: caCutoff,
        max_ca_score: 30,
        affiliation_fee_existing: 250000,
        affiliation_fee_new: 1500000,
        exam_fee_per_candidate: 50000,
        description: '2026/2027 JUPEB Session',
      });
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const got = await request(app)
      .get(`/sessions/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(got.status).toBe(200);
    expect(got.body.data.candidate_info_cutoff_at).toBeTruthy();
    expect(got.body.data.profile_update_cutoff_at).toBeTruthy();
    expect(got.body.data.ca_cutoff_at).toBeTruthy();
    expect(got.body.data.max_ca_score).toBe(30);
    expect(Number(got.body.data.affiliation_fee_existing)).toBe(250000);
    expect(Number(got.body.data.affiliation_fee_new)).toBe(1500000);
    expect(Number(got.body.data.exam_fee_per_candidate)).toBe(50000);
    expect(got.body.data.notes).toBe('2026/2027 JUPEB Session');
  });

  it('rejects max_ca_score out of range', async () => {
    if (!sessionsMigrated) return;
    const token = await getAdminAccessToken();
    if (!token) return;
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const res = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        max_ca_score: 200,
      });
    expect(res.status).toBe(422);
  });

  it('rejects out-of-order cutoff dates', async () => {
    if (!sessionsMigrated) return;
    const token = await getAdminAccessToken();
    if (!token) return;
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const res = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-06-01T00:00:00.000Z`).toISOString(),
        candidate_info_cutoff_at: new Date(`${y1}-08-01T00:00:00.000Z`).toISOString(),
        profile_update_cutoff_at: new Date(`${y1}-07-01T00:00:00.000Z`).toISOString(),
      });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/profile_update_cutoff_at/i);
  });

  it('GET /sessions/:id/stats returns extended KPIs', async () => {
    if (!sessionsMigrated) return;
    const token = await getAdminAccessToken();
    if (!token) return;
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const create = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
      });
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const stats = await request(app)
      .get(`/sessions/${id}/stats`)
      .set('Authorization', `Bearer ${token}`);
    expect(stats.status).toBe(200);
    expect(stats.body.data).toEqual(
      expect.objectContaining({
        session_id: id,
        total_registrations: expect.any(Number),
        registrations_by_status: expect.any(Object),
        institutions_count: expect.any(Number),
        subject_combinations_count: expect.any(Number),
        candidates_with_biometrics: expect.any(Number),
        candidates_without_biometrics: expect.any(Number),
      })
    );
  });

  it('GET /sessions/:id/stats?previous_session_id returns delta_pct/direction per metric', async () => {
    if (!sessionsMigrated) return;
    const token = await getAdminAccessToken();
    if (!token) return;
    // Seed two sessions; the previous-session_id is the comparison anchor.
    const prev = nextJupebAcademicSession();
    const curr = nextJupebAcademicSession();
    const prevSession = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: prev.academicYear,
        year_short: prev.yearShort,
        opens_at: new Date(`${prev.y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${prev.y1}-12-01T00:00:00.000Z`).toISOString(),
      });
    const currSession = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: curr.academicYear,
        year_short: curr.yearShort,
        opens_at: new Date(`${curr.y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${curr.y1}-12-01T00:00:00.000Z`).toISOString(),
      });
    expect(currSession.status).toBe(201);

    const stats = await request(app)
      .get(
        `/sessions/${currSession.body.data.id}/stats?previous_session_id=${prevSession.body.data.id}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(stats.status).toBe(200);
    expect(stats.body.data.deltas).toBeDefined();
    for (const key of [
      'total_registrations',
      'institutions_count',
      'subject_combinations_count',
      'candidates_with_biometrics',
      'candidates_without_biometrics',
    ]) {
      expect(stats.body.data.deltas[key]).toEqual(
        expect.objectContaining({
          value: expect.any(Number),
          previous: expect.any(Number),
          delta_pct: expect.anything(),
          direction: expect.stringMatching(/^(up|down|flat)$/),
        })
      );
    }
  });

  it('GET /sessions/export streams CSV with the new columns in the header', async () => {
    if (!sessionsMigrated) return;
    const token = await getAdminAccessToken();
    if (!token) return;
    const res = await request(app)
      .get('/sessions/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const firstLine = res.text.split(/\r?\n/)[0];
    for (const col of [
      'id',
      'academic_year',
      'opens_at',
      'closes_at',
      'candidate_info_cutoff_at',
      'profile_update_cutoff_at',
      'ca_cutoff_at',
      'max_ca_score',
      'affiliation_fee_existing',
      'affiliation_fee_new',
      'exam_fee_per_candidate',
    ]) {
      expect(firstLine).toContain(col);
    }
  });

  it('GET /sessions/export rejects non-admin', async () => {
    const studentLogin = await request(app)
      .post('/auth/login')
      .send({ identifier: 'student@example.com', password: 'Student@12' });
    if (studentLogin.status !== 200) return;
    const studentToken = studentLogin.body.data.access_token;
    const res = await request(app)
      .get('/sessions/export')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('POST finalize returns 422 when session is not closed', async () => {
    if (!sessionsMigrated) return;
    const token = await getAdminAccessToken();
    if (!token) return;
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const createRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-02-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-11-01T00:00:00.000Z`).toISOString(),
      });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.data.id;

    const finRes = await request(app)
      .post(`/sessions/${sessionId}/finalize-candidate-numbers`)
      .set('Authorization', `Bearer ${token}`);
    expect(finRes.status).toBe(422);
  });
});
