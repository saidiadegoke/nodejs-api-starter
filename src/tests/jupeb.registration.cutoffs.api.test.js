const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
  buildCatalogUniversityPayload,
} = require('./jupeb-session-test-helpers');

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

/**
 * A session registration window that is open right now.
 *
 * Candidate creation is gated on `opens_at`/`closes_at`, so the shared fixtures
 * that pin `opens_at` to a far-future year (`nextJupebAcademicSession` uses
 * y1 >= 3000 to keep `academic_year` globally unique) would be "not yet open".
 * Spread this into a session payload instead. The 30-day margin far exceeds any
 * server-timezone offset in the naive `TIMESTAMP WITHOUT TIME ZONE` columns.
 */
function openJupebSessionWindow({ daysBefore = 30, daysAfter = 30 } = {}) {
  return {
    opens_at: iso(-daysBefore * DAY_MS),
    closes_at: iso(daysAfter * DAY_MS),
  };
}

describe('JUPEB session window + cut-off enforcement', () => {
  let migrated = false;
  let adminToken = null;
  let universityId = null;
  let combinationId = null;
  let combinationCode = null;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registration_status_history LIMIT 1');
      migrated = true;
    } catch {
      migrated = false;
      return;
    }

    const login = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    adminToken = login.body?.data?.access_token || null;
    if (!adminToken) return;

    // University and combination codes carry unique indexes, so a value left
    // behind by an earlier run 409s — retry with a freshly generated code.
    const suffix = Date.now().toString().slice(-6);
    for (let i = 0; i < 10 && !universityId; i += 1) {
      const res = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          buildCatalogUniversityPayload('CUT', {
            code: nextJupebTestUniversityCode('CUT'),
            name: `Cutoff Test Uni ${suffix}${i}`,
          })
        );
      if (res.status === 201) universityId = res.body.data.id;
    }

    for (let i = 0; i < 10 && !combinationId; i += 1) {
      const res = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode('CT'),
          title: `Cutoff Combination ${suffix}${i}`,
          subjects: ['Mathematics', 'Physics', 'Chemistry'],
          is_global: true,
        });
      if (res.status === 201) {
        combinationId = res.body.data.id;
        combinationCode = res.body.data.code;
      }
    }
  });

  const ready = () => migrated && adminToken && universityId && combinationId;

  /** Create a session, leave it the only open one, and return its row. */
  async function makeOpenSession(overrides = {}) {
    const { academicYear, yearShort } = nextJupebAcademicSession();
    const res = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        ...openJupebSessionWindow(),
        ...overrides,
      });
    expect(res.status).toBe(201);
    await closeAllOpenJupebSessions(adminToken);
    await request(app)
      .post(`/sessions/${res.body.data.id}/open`)
      .set('Authorization', `Bearer ${adminToken}`);
    return res.body.data;
  }

  /**
   * Move a session bound directly in the DB, bypassing the service.
   *
   * `SessionService` enforces `closes_at <= candidate_info_cutoff_at <=
   * profile_update_cutoff_at <= ca_cutoff_at` on both create and update, so the
   * API cannot express "the window is still open but this cut-off has passed".
   * The enforcement layer still has to handle that row — rows predating the
   * ordering rule, seeds, and direct SQL all produce it — so the test writes it
   * the same way.
   */
  const forceBound = (sessionId, field, value) =>
    pool.query(`UPDATE jupeb_registration_sessions SET ${field} = $1 WHERE id = $2`, [
      value,
      sessionId,
    ]);

  const createCandidate = (sessionId) =>
    request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessionId,
        university_id: universityId,
        subject_combination_id: combinationId,
      });

  function bulkUpload(sessionId, nin) {
    const csv = [
      'first_name,last_name,middle_name,email,phone,nin,combination_code',
      `Cutoff,Tester,M,cutoff_${nin}@test.com,08099990000,${nin},${combinationCode}`,
    ].join('\n');
    return request(app)
      .post('/registration/institution/registrations/bulk-upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('session_id', sessionId)
      .field('university_id', universityId)
      .field('provider', 'mock')
      .attach('file', Buffer.from(csv), 'cutoff.csv');
  }

  /** Claim a registration code and return the new student's access token. */
  async function claim(code) {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const res = await request(app)
      .post('/auth/complete-registration')
      .send({ code, password: 'Strong@Password1', email: `cutoff-${stamp}@example.com` });
    return res.body?.data?.access_token || null;
  }

  it('allows candidate creation while candidate_info_cutoff_at is in the future', async () => {
    if (!ready()) return;

    const session = await makeOpenSession();
    await forceBound(session.id, 'candidate_info_cutoff_at', iso(DAY_MS));

    expect((await createCandidate(session.id)).status).toBe(201);
  });

  it('rejects candidate creation once candidate_info_cutoff_at has passed', async () => {
    if (!ready()) return;

    const session = await makeOpenSession();
    await forceBound(session.id, 'candidate_info_cutoff_at', iso(-DAY_MS));

    const res = await createCandidate(session.id);

    expect(res.status).toBe(423);
    expect(res.body.success).toBe(false);
    expect(res.body.details.error_code).toBe('session_cutoff_passed');
    expect(res.body.details.cutoff).toBe('candidate_info_cutoff_at');
    expect(res.body.details.cutoff_at).toBeTruthy();
    expect(res.body.message).toMatch(/Candidate information entry/i);
  });

  it('allows bulk upload while candidate_info_cutoff_at is in the future', async () => {
    if (!ready()) return;

    const session = await makeOpenSession();
    await forceBound(session.id, 'candidate_info_cutoff_at', iso(DAY_MS));

    const nin = `5${Date.now().toString().slice(-9)}2`;
    expect([200, 201]).toContain((await bulkUpload(session.id, nin)).status);
  });

  it('rejects bulk upload once candidate_info_cutoff_at has passed, writing no rows', async () => {
    if (!ready()) return;

    const session = await makeOpenSession();
    await forceBound(session.id, 'candidate_info_cutoff_at', iso(-DAY_MS));

    const nin = `4${Date.now().toString().slice(-9)}1`;
    const res = await bulkUpload(session.id, nin);

    expect(res.status).toBe(423);
    expect(res.body.details.error_code).toBe('session_cutoff_passed');

    const count = await pool.query(
      'SELECT COUNT(*)::int AS c FROM jupeb_registrations WHERE session_id = $1',
      [session.id]
    );
    expect(count.rows[0].c).toBe(0);
  });

  it('rejects candidate creation before opens_at with a distinct error code', async () => {
    if (!ready()) return;

    const session = await makeOpenSession({
      opens_at: iso(DAY_MS),
      closes_at: iso(30 * DAY_MS),
    });
    const res = await createCandidate(session.id);

    expect(res.status).toBe(423);
    expect(res.body.details.error_code).toBe('session_not_open');
    expect(res.body.details.opens_at).toBeTruthy();
  });

  it('rejects candidate creation after closes_at with a distinct error code', async () => {
    if (!ready()) return;

    const session = await makeOpenSession({
      opens_at: iso(-30 * DAY_MS),
      closes_at: iso(-DAY_MS),
    });
    const res = await createCandidate(session.id);

    expect(res.status).toBe(423);
    expect(res.body.details.error_code).toBe('session_window_closed');
    expect(res.body.details.closes_at).toBeTruthy();
  });

  it('rejects the institution candidate edit once profile_update_cutoff_at has passed', async () => {
    if (!ready()) return;

    const session = await makeOpenSession();
    const created = await createCandidate(session.id);
    expect(created.status).toBe(201);

    // The gate sits behind the "must be claimed" check, so claim it first.
    expect(await claim(created.body.data.institution_issued_code)).toBeTruthy();

    await forceBound(session.id, 'profile_update_cutoff_at', iso(-DAY_MS));

    const res = await request(app)
      .patch(`/registration/institution/registrations/${created.body.data.id}/candidate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ residential_address: '1 Blocked Street' });

    expect(res.status).toBe(423);
    expect(res.body.details.error_code).toBe('session_cutoff_passed');
    expect(res.body.details.cutoff).toBe('profile_update_cutoff_at');
  });

  it('rejects the student profile edit once profile_update_cutoff_at has passed', async () => {
    if (!ready()) return;

    const session = await makeOpenSession();
    const created = await createCandidate(session.id);
    expect(created.status).toBe(201);

    const studentToken = await claim(created.body.data.institution_issued_code);
    expect(studentToken).toBeTruthy();

    await forceBound(session.id, 'profile_update_cutoff_at', iso(-DAY_MS));

    const res = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ residential_address: '1 Blocked Street' });

    expect(res.status).toBe(423);
    expect(res.body.details.error_code).toBe('session_cutoff_passed');
    expect(res.body.details.cutoff).toBe('profile_update_cutoff_at');
  });

  it('exposes cut-off state on GET /sessions/context', async () => {
    if (!ready()) return;

    const session = await makeOpenSession();
    await forceBound(session.id, 'candidate_info_cutoff_at', iso(-DAY_MS));

    const res = await request(app)
      .get('/sessions/context')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const summary = res.body.data.effective_session;
    expect(summary).toBeTruthy();
    expect(summary.candidate_info_cutoff_at).toBeTruthy();
    expect(typeof summary.window_open).toBe('boolean');
    expect(typeof summary.candidate_info_closed).toBe('boolean');
    expect(typeof summary.profile_update_closed).toBe('boolean');
    expect(typeof summary.ca_closed).toBe('boolean');
    expect(summary.candidate_info_closed).toBe(true);
  });
});
