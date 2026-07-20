/**
 * End-to-end matric assignment lifecycle.
 *
 * Walks a single registration through:
 *   create code → student claims → confirm → submit → approve →
 *   numbering-preview → finalize → login with matric.
 *
 * Asserts provisional code omits year; assigned `jupeb_candidate_number`
 * follows formatCandidateNumber (yearShort + jupeb_prefix + serial),
 * is persisted, and that the lockdown rule kicks in (email login
 * stops working once matric is set).
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

describe('JUPEB matric-number lifecycle (provisional → finalize)', () => {
  let migrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      migrated = true;
    } catch { /* */ }
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
  });

  async function adminToken() {
    const r = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return r.body.data?.access_token;
  }

  it('matric is assigned on finalize, follows the yearShort+prefix+serial format, and locks the student out of email login', async () => {
    if (!migrated) return;
    const token = await adminToken();
    if (!token) return;

    // ── 1. Catalog fixtures
    let uniRes;
    for (let i = 0; i < 30 && (!uniRes || uniRes.status !== 201); i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: nextJupebTestUniversityCode('MTR'), name: 'Matric U', jupeb_prefix: nextJupebTestPrefix() });
    }
    expect(uniRes.status).toBe(201);
    const universityId = uniRes.body.data.id;
    const jupebPrefix = uniRes.body.data.jupeb_prefix;

    let scRes;
    for (let i = 0; i < 30 && (!scRes || scRes.status !== 201); i += 1) {
      scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: nextJupebTestUniversityCode('MTRSC'), title: 'Matric Combo', subjects: ['M','P','C'], is_global: true });
    }
    const comboId = scRes.body.data.id;

    let sessRes;
    let yearShort;
    for (let i = 0; i < 30 && (!sessRes || sessRes.status !== 201); i += 1) {
      const s = nextJupebAcademicSession();
      sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          academic_year: s.academicYear, year_short: s.yearShort,
          opens_at: new Date(`${s.y1}-01-01T00:00:00Z`).toISOString(),
          closes_at: new Date(`${s.y1}-12-01T00:00:00Z`).toISOString(),
        });
      if (sessRes.status === 201) yearShort = s.yearShort;
    }
    const sessionId = sessRes.body.data.id;
    await closeAllOpenJupebSessions(token);
    await request(app).post(`/sessions/${sessionId}/open`).set('Authorization', `Bearer ${token}`);

    // ── 2. Institution creates the registration (code_issued)
    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, university_id: universityId, subject_combination_id: comboId });
    expect(createReg.status).toBe(201);
    const registrationId = createReg.body.data.id;
    const code = createReg.body.data.institution_issued_code;
    const provisionalSerial = createReg.body.data.provisional_serial;
    const expectedProvisional = `${jupebPrefix}${String(provisionalSerial).padStart(4, '0')}`;
    expect(createReg.body.data.provisional_candidate_code).toBe(expectedProvisional);
    expect(createReg.body.data.provisional_candidate_code).not.toMatch(
      new RegExp(`^${String(yearShort).padStart(2, '0')}`)
    );

    // ── 3. Student claims via register-with-code (claimed)
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const email = `matric-${stamp}@example.com`;
    const password = 'Strong@Password1';
    const reg = await request(app)
      .post('/auth/complete-registration')
      .send({ code, password, email, first_name: 'Adunni', last_name: 'Yusuf' });
    expect(reg.status).toBe(201);
    const studentToken = reg.body.data.access_token;

    // ── 4. Confirm subjects (pending_documents)
    const confirm = await request(app)
      .post('/registration/me/confirm-subjects')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(confirm.status).toBe(200);

    // ── 5. Submit (pending_institution_review)
    const submit = await request(app)
      .post('/registration/me/submit')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(submit.status).toBe(200);

    // ── 6. Institution approves
    const approve = await request(app)
      .post(`/registration/institution/registrations/${registrationId}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('approved');

    // Pre-finalize: matric must still be null.
    const before = await pool.query(
      `SELECT jupeb_candidate_number FROM jupeb_registrations WHERE id = $1`,
      [registrationId]
    );
    expect(before.rows[0].jupeb_candidate_number).toBeNull();

    // ── 7. Numbering preview surfaces the proposed matric (session still open)
    const preview = await request(app)
      .get(`/registration/sessions/${sessionId}/numbering-preview`)
      .set('Authorization', `Bearer ${token}`);
    expect(preview.status).toBe(200);
    const proposed = preview.body.data.proposed.find((p) => p.registration_id === registrationId);
    expect(proposed).toBeDefined();
    // Format: yearShort (2 digits) + jupeb_prefix (3 digits) + serial (4 digits)
    const expectedMatric = `${String(yearShort).padStart(2, '0')}${jupebPrefix}${String(provisionalSerial).padStart(4, '0')}`;
    expect(proposed.proposed_jupeb_candidate_number).toBe(expectedMatric);

    // ── 8. Finalize — actually writes the matric
    const finalize = await request(app)
      .post(`/sessions/${sessionId}/finalize-candidate-numbers`)
      .set('Authorization', `Bearer ${token}`);
    expect(finalize.status).toBe(200);
    expect(finalize.body.data.assigned).toBeGreaterThanOrEqual(1);
    const assigned = finalize.body.data.numbers.find((n) => n.registration_id === registrationId);
    expect(assigned).toBeDefined();
    expect(assigned.jupeb_candidate_number).toBe(expectedMatric);

    // Persisted on the row.
    const after = await pool.query(
      `SELECT jupeb_candidate_number FROM jupeb_registrations WHERE id = $1`,
      [registrationId]
    );
    expect(after.rows[0].jupeb_candidate_number).toBe(expectedMatric);

    // ── 9. Finalize is idempotent — re-running doesn't overwrite
    const finalize2 = await request(app)
      .post(`/sessions/${sessionId}/finalize-candidate-numbers`)
      .set('Authorization', `Bearer ${token}`);
    expect(finalize2.status).toBe(200);
    // No row in `numbers` for this registration the second time —
    // setCandidateNumberIfNull skips it.
    const second = finalize2.body.data.numbers.find((n) => n.registration_id === registrationId);
    expect(second).toBeUndefined();

    // ── 10. Student can now log in with the matric
    const loginByMatric = await request(app)
      .post('/auth/login')
      .send({ identifier: expectedMatric, password });
    expect(loginByMatric.status).toBe(200);
    expect(loginByMatric.body.data.user.email).toBe(email);
    expect(loginByMatric.body.data.registration.jupeb_candidate_number).toBe(expectedMatric);

    // ── 11. Lockdown — email login no longer resolves to the student
    const loginByEmail = await request(app)
      .post('/auth/login')
      .send({ identifier: email, password });
    expect(loginByEmail.status).not.toBe(200);
  });

  it('numbering-preview works while the session is still open', async () => {
    if (!migrated) return;
    const token = await adminToken();
    let sessRes;
    for (let i = 0; i < 30 && (!sessRes || sessRes.status !== 201); i += 1) {
      const s = nextJupebAcademicSession();
      sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          academic_year: s.academicYear, year_short: s.yearShort,
          opens_at: new Date(`${s.y1}-01-01T00:00:00Z`).toISOString(),
          closes_at: new Date(`${s.y1}-12-01T00:00:00Z`).toISOString(),
        });
    }
    await closeAllOpenJupebSessions(token);
    await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${token}`);

    const r = await request(app)
      .get(`/registration/sessions/${sessRes.body.data.id}/numbering-preview`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.data.proposed).toBeDefined();
    expect(Array.isArray(r.body.data.proposed)).toBe(true);
  });

  it('finalize requires an authenticated registrar/admin role (401 without auth)', async () => {
    if (!migrated) return;
    const r = await request(app)
      .post('/sessions/00000000-0000-1000-8000-000000000000/finalize-candidate-numbers');
    expect(r.status).toBe(401);
  });

  describe('POST /sessions/finalize-all-closed (bulk)', () => {
    it('walks every closed session and returns an aggregated result', async () => {
      if (!migrated) return;
      const token = await adminToken();
      if (!token) return;

      const r = await request(app)
        .post('/sessions/finalize-all-closed')
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
      expect(r.body.data.sessions).toBeDefined();
      expect(Array.isArray(r.body.data.sessions)).toBe(true);
      expect(r.body.data.totals).toBeDefined();
      expect(typeof r.body.data.totals.sessions_processed).toBe('number');
      expect(typeof r.body.data.totals.assigned).toBe('number');
      expect(typeof r.body.data.totals.skipped).toBe('number');
    });

    it('requires registrar/admin role', async () => {
      const r = await request(app).post('/sessions/finalize-all-closed');
      expect(r.status).toBe(401);
    });

    it('bulk endpoint is idempotent — second call assigns nothing new', async () => {
      if (!migrated) return;
      const token = await adminToken();
      if (!token) return;
      const r1 = await request(app)
        .post('/sessions/finalize-all-closed')
        .set('Authorization', `Bearer ${token}`);
      const r2 = await request(app)
        .post('/sessions/finalize-all-closed')
        .set('Authorization', `Bearer ${token}`);
      expect(r2.status).toBe(200);
      // r2 must assign nothing more than r1 left undone.
      expect(r2.body.data.totals.assigned).toBe(0);
    });
  });
});
