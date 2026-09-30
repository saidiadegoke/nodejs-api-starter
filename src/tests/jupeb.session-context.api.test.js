const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const { closeAllOpenJupebSessions, nextJupebAcademicSession } = require('./jupeb-session-test-helpers');

describe('JUPEB session viewing context API', () => {
  let ready = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT viewing_jupeb_session_id FROM profiles LIMIT 1');
      await pool.query('SELECT 1 FROM jupeb_registration_sessions LIMIT 1');
      ready = true;
    } catch {
      ready = false;
      // eslint-disable-next-line no-console
      console.warn(
        '[jupeb.session-context.api] Skipping: apply migrations through 023_profiles_viewing_jupeb_session.sql.'
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

  async function createSession(token, labelSuffix = '') {
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const res = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        notes: `viewing-context test ${labelSuffix}`,
      });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  it('GET /sessions/context without token returns 401', async () => {
    const res = await request(app).get('/sessions/context');
    expect(res.status).toBe(401);
  });

  it('viewing session scopes reads without changing global open session', async () => {
    if (!ready) return;
    const token = await getAdminAccessToken();
    if (!token) return;

    await request(app).delete('/sessions/viewing').set('Authorization', `Bearer ${token}`);

    const closedSession = await createSession(token, 'closed');
    const openSession = await createSession(token, 'open');

    await closeAllOpenJupebSessions(token);
    await request(app)
      .post(`/sessions/${closedSession.id}/open`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/sessions/${closedSession.id}/close`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/sessions/${openSession.id}/open`)
      .set('Authorization', `Bearer ${token}`);

    const setViewing = await request(app)
      .put('/sessions/viewing')
      .set('Authorization', `Bearer ${token}`)
      .send({ session_id: closedSession.id });
    expect(setViewing.status).toBe(200);
    expect(setViewing.body.data.effective_session.id).toBe(closedSession.id);
    expect(setViewing.body.data.active_session.id).toBe(openSession.id);

    const scope = await request(app)
      .get('/dashboard/scope')
      .set('Authorization', `Bearer ${token}`);
    expect(scope.status).toBe(200);
    expect(scope.body.data.effective_session.id).toBe(closedSession.id);
    expect(scope.body.data.active_session.id).toBe(openSession.id);
    expect(scope.body.data.session.id).toBe(closedSession.id);

    const cleared = await request(app)
      .delete('/sessions/viewing')
      .set('Authorization', `Bearer ${token}`);
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.viewing_session).toBeNull();
    expect(cleared.body.data.effective_session.id).toBe(openSession.id);

    const scopeAfter = await request(app)
      .get('/dashboard/scope')
      .set('Authorization', `Bearer ${token}`);
    expect(scopeAfter.body.data.effective_session.id).toBe(openSession.id);
  });

  it('PUT /sessions/viewing validates session_id', async () => {
    if (!ready) return;
    const token = await getAdminAccessToken();
    if (!token) return;

    const badUuid = await request(app)
      .put('/sessions/viewing')
      .set('Authorization', `Bearer ${token}`)
      .send({ session_id: 'not-a-uuid' });
    expect(badUuid.status).toBe(422);

    const missing = await request(app)
      .put('/sessions/viewing')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(missing.status).toBe(422);

    const unknown = await request(app)
      .put('/sessions/viewing')
      .set('Authorization', `Bearer ${token}`)
      .send({ session_id: '00000000-0000-4000-8000-000000000001' });
    expect(unknown.status).toBe(404);
  });

  it('explicit session_id query overrides viewing preference', async () => {
    if (!ready) return;
    const token = await getAdminAccessToken();
    if (!token) return;

    const sessionA = await createSession(token, 'override-a');
    const sessionB = await createSession(token, 'override-b');

    await request(app)
      .put('/sessions/viewing')
      .set('Authorization', `Bearer ${token}`)
      .send({ session_id: sessionA.id });

    const scope = await request(app)
      .get(`/dashboard/scope?session_id=${sessionB.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(scope.status).toBe(200);
    expect(scope.body.data.effective_session.id).toBe(sessionB.id);

    await request(app).delete('/sessions/viewing').set('Authorization', `Bearer ${token}`);
  });

  it('GET /sessions/metrics returns KPI cards for effective viewing session', async () => {
    if (!ready) return;
    const token = await getAdminAccessToken();
    if (!token) return;

    await request(app).delete('/sessions/viewing').set('Authorization', `Bearer ${token}`);

    const closedSession = await createSession(token, 'metrics-closed');
    const openSession = await createSession(token, 'metrics-open');

    await closeAllOpenJupebSessions(token);
    await request(app)
      .post(`/sessions/${closedSession.id}/open`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/sessions/${closedSession.id}/close`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/sessions/${openSession.id}/open`)
      .set('Authorization', `Bearer ${token}`);

    await request(app)
      .put('/sessions/viewing')
      .set('Authorization', `Bearer ${token}`)
      .send({ session_id: closedSession.id });

    const metrics = await request(app)
      .get('/sessions/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(metrics.status).toBe(200);
    expect(metrics.body.data.session.id).toBe(closedSession.id);
    expect(metrics.body.data.metrics).toEqual(
      expect.objectContaining({
        exams: null,
        institutions: expect.any(Number),
        total_candidates: expect.any(Number),
        current_candidates_enrolled: expect.any(Number),
        candidates_with_biometrics: expect.any(Number),
      })
    );

    const override = await request(app)
      .get(`/sessions/metrics?session_id=${openSession.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(override.status).toBe(200);
    expect(override.body.data.session.id).toBe(openSession.id);

    await request(app).delete('/sessions/viewing').set('Authorization', `Bearer ${token}`);
  });

  it('registration create still requires an open session', async () => {
    if (!ready) return;
    const token = await getAdminAccessToken();
    if (!token) return;

    const closedSession = await createSession(token, 'reg-closed');
    await closeAllOpenJupebSessions(token);
    await request(app)
      .post(`/sessions/${closedSession.id}/open`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/sessions/${closedSession.id}/close`)
      .set('Authorization', `Bearer ${token}`);

    await request(app)
      .put('/sessions/viewing')
      .set('Authorization', `Bearer ${token}`)
      .send({ session_id: closedSession.id });

    const openSession = await createSession(token, 'reg-open');
    await request(app)
      .post(`/sessions/${openSession.id}/open`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: closedSession.id,
        university_id: '00000000-0000-4000-8000-000000000099',
        subject_combination_id: '00000000-0000-4000-8000-000000000098',
      });
    expect([404, 422]).toContain(res.status);

    await request(app).delete('/sessions/viewing').set('Authorization', `Bearer ${token}`);
  });
});
