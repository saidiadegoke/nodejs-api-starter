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
