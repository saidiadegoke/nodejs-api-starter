/**
 * Institution registration lock enforcement (Nest endpoints).
 *
 * A university locked for a session must not be able to run registration
 * actions — verify NIN, register a candidate, or bulk upload — while the
 * lock is in place.
 */
const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebAcademicSession,
  buildCatalogUniversityPayload,
} = require('./jupeb-session-test-helpers');

describe('Institution registration lock', () => {
  let adminToken = null;
  let universityId = null;
  let sessionId = null;

  const adminCredentials = {
    identifier: 'admin@example.com',
    password: 'Admin@12',
  };

  const NIN = '08012345678';

  beforeAll(async () => {
    const loginRes = await request(app).post('/auth/login').send(adminCredentials);
    if (loginRes.status !== 200 || !loginRes.body.data?.access_token) return;
    adminToken = loginRes.body.data.access_token;

    const suffix = Date.now().toString().slice(-6);
    for (let i = 0; i < 20 && !universityId; i += 1) {
      const uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          buildCatalogUniversityPayload('LOCK', {
            name: `Lock Test Uni ${suffix}`,
            jupeb_prefix: `LOCK${suffix.slice(-4)}${i}`,
            short_name: `LOCK${suffix.slice(-4)}${i}`,
          }),
        );
      if (uniRes.status === 201) universityId = uniRes.body.data.id;
    }
    if (!universityId) {
      const rows = await pool.query(
        `SELECT id FROM jupeb_universities WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
      );
      universityId = rows.rows[0]?.id || null;
    }

    const { academicYear, yearShort } = nextJupebAcademicSession();
    const sessRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        closes_at: new Date(Date.now() + 365 * 86400000).toISOString(),
      });
    if (sessRes.status === 201) {
      sessionId = sessRes.body.data.id;
      await closeAllOpenJupebSessions(adminToken);
      await request(app)
        .post(`/sessions/${sessionId}/open`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
  });

  afterAll(async () => {
    if (!sessionId) return;
    await pool.query(`DELETE FROM jupeb_session_university_locks WHERE session_id = $1`, [sessionId]);
    await pool.query(`DELETE FROM jupeb_registration_sessions WHERE id = $1`, [sessionId]);
  });

  const lockInstitution = async (locked) => {
    const res = await request(app)
      .patch(`/sessions/${sessionId}/registration-lock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ locked, university_id: universityId, reason: 'Lock enforcement test' });
    expect(res.status).toBe(200);
  };

  it('locks the institution for the session', async () => {
    expect(adminToken).toBeTruthy();
    expect(universityId).toBeTruthy();
    expect(sessionId).toBeTruthy();
    await lockInstitution(true);

    const res = await request(app)
      .get(`/sessions/${sessionId}/university-locks?limit=100`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const locked = res.body.data.find((u) => u.university_id === universityId);
    expect(locked).toBeDefined();
    expect(locked.locked).toBe(true);
  });

  it('rejects candidate registration for the locked institution with 423', async () => {
    if (!adminToken || !universityId || !sessionId) return;

    const res = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ session_id: sessionId, university_id: universityId });

    expect(res.status).toBe(423);
    expect(res.body.message).toMatch(/Registration is locked for this institution/i);
  });

  it('rejects bulk upload for the locked institution with 423', async () => {
    if (!adminToken || !universityId || !sessionId) return;

    const csvContent = Buffer.from(
      'first_name,surname,other_names,date_of_birth,gender,phone,email,state_of_origin,subject_combination_code\n' +
        'John,Doe,K,2005-01-01,male,08012345678,john.bulk@example.com,Lagos,PHY-CHE-BIO\n',
    );

    const res = await request(app)
      .post('/registration/institution/registrations/bulk-upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('session_id', sessionId)
      .field('university_id', universityId)
      .attach('file', csvContent, 'candidates.csv');

    expect(res.status).toBe(423);
    expect(res.body.message).toMatch(/Registration is locked for this institution/i);
  });

  it('rejects NIN verification for the locked institution with 423', async () => {
    if (!adminToken || !universityId || !sessionId) return;

    const res = await request(app)
      .post('/identity/nin/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nin: NIN,
        session_id: sessionId,
        intake_payload: { university_id: universityId },
      });

    expect(res.status).toBe(423);
    expect(res.body.message).toMatch(/Registration is locked for this institution/i);
  });

  it('allows registration again once the institution is unlocked', async () => {
    if (!adminToken || !universityId || !sessionId) return;

    await lockInstitution(false);

    const res = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ session_id: sessionId, university_id: universityId });

    // Past the lock: the request now fails on its own validation rules.
    expect(res.status).not.toBe(423);
    expect(res.status).toBe(422);
  });
});
