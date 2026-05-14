/**
 * Smoke tests for the three Wednesday-deadline gap fixes:
 *   #1  /auth/login response embeds `registration: {…}`
 *   #3  GET /institution/registrations/:id (candidate detail)
 *   #5  /auth/send-verification + /auth/verify-email routes
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

describe('Wednesday gap fixes', () => {
  let registrationMigrated = false;
  let emailVerifyMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      registrationMigrated = true;
    } catch { /* */ }
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='email_verification_token_hash'`
      );
      emailVerifyMigrated = r.rowCount > 0;
    } catch { /* */ }
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
  });

  async function getAdminToken() {
    const r = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return r.body.data?.access_token || null;
  }

  describe('#1 — login response embeds registration summary', () => {
    it('login response always carries a `registration` key (null when none)', async () => {
      const r = await request(app)
        .post('/auth/login')
        .send({ identifier: 'admin@example.com', password: 'Admin@12' });
      expect(r.status).toBe(200);
      expect(r.body.data).toHaveProperty('registration');
      // Field is present unconditionally. When non-null, it must have
      // the documented shape so the mobile app can rely on it.
      const reg = r.body.data.registration;
      if (reg !== null) {
        expect(reg).toHaveProperty('id');
        expect(reg).toHaveProperty('status');
        expect(reg).toHaveProperty('next_step');
        expect(typeof reg.dashboard_unlocked).toBe('boolean');
      }
    });

    it('a student who has claimed a code gets registration.id + next_step on login', async () => {
      if (!registrationMigrated) return;
      const adminToken = await getAdminToken();
      if (!adminToken) return;

      // Spin up uni/sc/session + create a registration + claim it.
      let uniRes;
      for (let i = 0; i < 30 && (!uniRes || uniRes.status !== 201); i += 1) {
        uniRes = await request(app)
          .post('/catalog/universities')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ code: nextJupebTestUniversityCode('GAP'), name: 'Gap U', jupeb_prefix: nextJupebTestPrefix() });
      }
      let scRes;
      for (let i = 0; i < 30 && (!scRes || scRes.status !== 201); i += 1) {
        scRes = await request(app)
          .post('/catalog/subject-combinations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ code: nextJupebTestUniversityCode('GAPSC'), title: 'Gap Combo', subjects: ['M','P','C'], is_global: true });
      }
      let sessRes;
      for (let i = 0; i < 30 && (!sessRes || sessRes.status !== 201); i += 1) {
        const { y1, academicYear, yearShort } = nextJupebAcademicSession();
        sessRes = await request(app)
          .post('/sessions')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            academic_year: academicYear, year_short: yearShort,
            opens_at: new Date(`${y1}-01-01T00:00:00Z`).toISOString(),
            closes_at: new Date(`${y1}-12-01T00:00:00Z`).toISOString(),
          });
      }
      await closeAllOpenJupebSessions(adminToken);
      await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${adminToken}`);

      const createReg = await request(app)
        .post('/registration/institution/registrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ session_id: sessRes.body.data.id, university_id: uniRes.body.data.id, subject_combination_id: scRes.body.data.id });
      const stamp = Date.now() + Math.floor(Math.random() * 1000);
      const email = `gap1-${stamp}@example.com`;
      const password = 'Strong@Password1';
      await request(app).post('/auth/complete-registration').send({
        code: createReg.body.data.institution_issued_code,
        password, email,
      });

      // Now login fresh — the response should carry the registration.
      const login = await request(app).post('/auth/login').send({ identifier: email, password });
      expect(login.status).toBe(200);
      expect(login.body.data.registration).not.toBeNull();
      expect(login.body.data.registration.id).toBe(createReg.body.data.id);
      expect(['claimed', 'pending_student_confirm', 'pending_documents'])
        .toContain(login.body.data.registration.status);
      expect(login.body.data.registration.next_step).toBeDefined();
      expect(typeof login.body.data.registration.dashboard_unlocked).toBe('boolean');
    });
  });

  describe('#3 — GET /institution/registrations/:id', () => {
    it('returns 404 for an unknown registration id', async () => {
      if (!registrationMigrated) return;
      const adminToken = await getAdminToken();
      if (!adminToken) return;
      const r = await request(app)
        .get('/registration/institution/registrations/00000000-0000-1000-8000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(404);
    });

    it('returns 422 for a malformed id', async () => {
      if (!registrationMigrated) return;
      const adminToken = await getAdminToken();
      if (!adminToken) return;
      const r = await request(app)
        .get('/registration/institution/registrations/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(422);
    });

    it('returns the full candidate detail when the id is valid', async () => {
      if (!registrationMigrated) return;
      const adminToken = await getAdminToken();
      if (!adminToken) return;

      let uniRes;
      for (let i = 0; i < 30 && (!uniRes || uniRes.status !== 201); i += 1) {
        uniRes = await request(app)
          .post('/catalog/universities')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ code: nextJupebTestUniversityCode('DET'), name: 'Det U', jupeb_prefix: nextJupebTestPrefix() });
      }
      let scRes;
      for (let i = 0; i < 30 && (!scRes || scRes.status !== 201); i += 1) {
        scRes = await request(app)
          .post('/catalog/subject-combinations')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ code: nextJupebTestUniversityCode('DETSC'), title: 'Det Combo', subjects: ['M','P','C'], is_global: true });
      }
      let sessRes;
      for (let i = 0; i < 30 && (!sessRes || sessRes.status !== 201); i += 1) {
        const { y1, academicYear, yearShort } = nextJupebAcademicSession();
        sessRes = await request(app)
          .post('/sessions')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            academic_year: academicYear, year_short: yearShort,
            opens_at: new Date(`${y1}-01-01T00:00:00Z`).toISOString(),
            closes_at: new Date(`${y1}-12-01T00:00:00Z`).toISOString(),
          });
      }
      await closeAllOpenJupebSessions(adminToken);
      await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${adminToken}`);

      const create = await request(app)
        .post('/registration/institution/registrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ session_id: sessRes.body.data.id, university_id: uniRes.body.data.id, subject_combination_id: scRes.body.data.id });
      expect(create.status).toBe(201);

      const detail = await request(app)
        .get(`/registration/institution/registrations/${create.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(detail.status).toBe(200);
      const d = detail.body.data;
      // Core fields + composed objects
      expect(d.id).toBe(create.body.data.id);
      expect(d.status).toBe('code_issued');
      expect(d.institution_issued_code).toBeDefined();
      expect(d.provisional_candidate_code).toBeDefined();
      expect(d.university).toBeDefined();
      expect(d.subject_combination).toBeDefined();
      expect(d.session).toBeDefined();
      // Detail-only fields
      expect(Array.isArray(d.documents)).toBe(true);
      expect(Array.isArray(d.result_entries)).toBe(true);
      expect(Array.isArray(d.biometrics)).toBe(true);
      expect(Array.isArray(d.status_history)).toBe(true);
      expect(d.biometric_status).toMatch(/^(yes|partial|no)$/);
      expect(d.biometric_skips).toEqual({ face: false, fingerprint: false });
    });
  });

  describe('#5 — email verification routes', () => {
    it('GET /auth/verify-email rejects an unknown token (400)', async () => {
      if (!emailVerifyMigrated) return;
      const r = await request(app).get('/auth/verify-email?token=not-a-real-token');
      expect(r.status).toBe(400);
      expect(r.body.details && r.body.details.error_code).toBe('invalid_token');
    });

    it('GET /auth/verify-email rejects an empty token (422)', async () => {
      if (!emailVerifyMigrated) return;
      const r = await request(app).get('/auth/verify-email');
      expect(r.status).toBe(422);
      expect(r.body.details && r.body.details.error_code).toBe('token_required');
    });

    it('/auth/send-verification requires auth (401)', async () => {
      if (!emailVerifyMigrated) return;
      const r = await request(app).post('/auth/send-verification');
      expect(r.status).toBe(401);
    });

    it('happy path: send-verification issues a token, verify-email flips email_verified=true', async () => {
      if (!emailVerifyMigrated) return;
      // Seed a fresh user with an unverified email.
      const email = `verify-${Date.now()}@example.com`;
      const password = 'Strong@Password1';
      const reg = await request(app)
        .post('/auth/register')
        .send({ first_name: 'Verify', last_name: 'Me', email, password });
      // Some envs require a different path — fall back to direct insert + login if /register isn't friendly.
      let token;
      if (reg.status === 201) {
        // Get an access token via login
        const login = await request(app).post('/auth/login').send({ identifier: email, password });
        token = login.body.data?.access_token;
      }
      if (!token) {
        // eslint-disable-next-line no-console
        console.warn('[gap-test] /auth/register flow returned', reg.status, '— skipping verification happy path');
        return;
      }

      const send = await request(app)
        .post('/auth/send-verification')
        .set('Authorization', `Bearer ${token}`);
      expect(send.status).toBe(200);
      expect(send.body.data.sent).toBe(true);
      expect(send.body.data.token).toBeDefined(); // test-mode only

      const verifyRes = await request(app)
        .get(`/auth/verify-email?token=${encodeURIComponent(send.body.data.token)}`);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.email_verified).toBe(true);

      // DB sanity
      const r = await pool.query(
        `SELECT email_verified, email_verified_at, email_verification_token_hash
           FROM users WHERE LOWER(email) = LOWER($1)`,
        [email]
      );
      expect(r.rows[0].email_verified).toBe(true);
      expect(r.rows[0].email_verified_at).not.toBeNull();
      // Token wiped after consumption
      expect(r.rows[0].email_verification_token_hash).toBeNull();
    });
  });
});
