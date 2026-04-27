const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('JUPEB registration API', () => {
  let registrationMigrated = false;
  let jupebEnhancements = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registration_status_history LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
      // eslint-disable-next-line no-console
      console.warn('[jupeb.registration.api] Skipping: apply migration `006_jupeb_registration.sql`.');
    }
    if (registrationMigrated) {
      try {
        await pool.query('SELECT payment_projection FROM jupeb_registrations LIMIT 1');
        jupebEnhancements = true;
      } catch {
        jupebEnhancements = false;
      }
    }
    // Non-positive TTL => no expiry (see registration.service); avoids flaky 410s if .env sets a short TTL.
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
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

  it('institution routes return 401 without auth', async () => {
    const res = await request(app).get('/registration/institution/registrations');
    expect(res.status).toBe(401);
  });

  it('institution create -> student claim -> confirm -> submit -> approve -> finalize flow', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;

    const suffix = Date.now();
    const prefix = nextJupebTestPrefix();
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('REG'),
        name: `Reg Test Uni ${suffix}`,
        jupeb_prefix: prefix,
      });
    expect(uniRes.status).toBe(201);
    const universityId = uniRes.body.data.id;

    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('SC'),
        title: 'Combination A',
        subjects: ['Mathematics', 'Physics', 'Chemistry'],
        is_global: true,
      });
    expect(scRes.status).toBe(201);
    const subjectCombinationId = scRes.body.data.id;

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
    const openRes = await request(app)
      .post(`/sessions/${sessionId}/open`)
      .set('Authorization', `Bearer ${token}`);
    expect(openRes.status).toBe(200);

    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        university_id: universityId,
        subject_combination_id: subjectCombinationId,
      });
    expect(createReg.status).toBe(201);
    expect(createReg.body.data.status).toBe('code_issued');
    expect(createReg.body.data.institution_issued_code).toBeTruthy();
    const claimCode = createReg.body.data.institution_issued_code;
    const registrationId = createReg.body.data.id;

    const claimRes = await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: claimCode });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.data.status).toBe('claimed');

    const confirmRes = await request(app)
      .post('/registration/me/confirm-subjects')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('pending_documents');

    const submitRes = await request(app)
      .post('/registration/me/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('pending_institution_review');

    const approveRes = await request(app)
      .post(`/registration/institution/registrations/${registrationId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('approved');
    expect(approveRes.body.data.dashboard_unlocked_at).toBeTruthy();

    const dashRes = await request(app)
      .get('/registration/me/dashboard-access')
      .set('Authorization', `Bearer ${token}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.locked).toBe(false);

    const closeRes = await request(app)
      .post(`/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${token}`);
    expect(closeRes.status).toBe(200);

    const previewRes = await request(app)
      .get(`/registration/sessions/${sessionId}/numbering-preview`)
      .set('Authorization', `Bearer ${token}`);
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.proposed.length).toBe(1);
    expect(previewRes.body.data.proposed[0].proposed_jupeb_candidate_number).toMatch(/^\d{9,}$/);

    const finRes = await request(app)
      .post(`/sessions/${sessionId}/finalize-candidate-numbers`)
      .set('Authorization', `Bearer ${token}`);
    expect(finRes.status).toBe(200);
    expect(finRes.body.data.assigned).toBe(1);
    expect(finRes.body.data.numbers[0].jupeb_candidate_number).toBe(
      previewRes.body.data.proposed[0].proposed_jupeb_candidate_number
    );

    const finAgain = await request(app)
      .post(`/sessions/${sessionId}/finalize-candidate-numbers`)
      .set('Authorization', `Bearer ${token}`);
    expect(finAgain.status).toBe(200);
    expect(finAgain.body.data.assigned).toBe(0);
    expect(finAgain.body.data.skipped).toBeGreaterThanOrEqual(0);
  });

  it('reject requires reason and blocks dashboard', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;

    const suffix = Date.now() + 1;
    const prefix = nextJupebTestPrefix();
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('RJ'),
        name: `Reject Uni ${suffix}`,
        jupeb_prefix: prefix,
      });
    expect(uniRes.status).toBe(201);

    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('SCRJ'),
        title: 'Combination B',
        subjects: ['English', 'Literature', 'History'],
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

    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    expect(createReg.status).toBe(201);
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: createReg.body.data.institution_issued_code });
    await request(app).post('/registration/me/confirm-subjects').set('Authorization', `Bearer ${token}`).send({});
    await request(app).post('/registration/me/submit').set('Authorization', `Bearer ${token}`).send({});

    const badReject = await request(app)
      .post(`/registration/institution/registrations/${createReg.body.data.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(badReject.status).toBe(422);

    const rejectRes = await request(app)
      .post(`/registration/institution/registrations/${createReg.body.data.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Incomplete records' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');

    const dashRes = await request(app)
      .get('/registration/me/dashboard-access')
      .set('Authorization', `Bearer ${token}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.locked).toBe(true);
  });

  it('creates notification after institution approval', async () => {
    if (!registrationMigrated || !jupebEnhancements) return;
    const token = await getAdminToken();
    if (!token) return;
    const studentLogin = await request(app)
      .post('/auth/login')
      .send({ identifier: 'student@example.com', password: 'Student@12' });
    if (studentLogin.status !== 200 || !studentLogin.body.data?.access_token) {
      // eslint-disable-next-line no-console
      console.warn('[jupeb.registration.api] Skipping notification test: student@example.com not seeded');
      return;
    }
    const studentToken = studentLogin.body.data.access_token;

    const suffix = Date.now() + 2;
    const prefix = nextJupebTestPrefix();
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('NT'),
        name: `Notify Uni ${suffix}`,
        jupeb_prefix: prefix,
      });
    expect(uniRes.status).toBe(201);
    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('NTSC'),
        title: 'Notify Combo',
        subjects: ['A', 'B', 'C'],
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
    expect(createReg.status).toBe(201);
    const registrationId = createReg.body.data.id;
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ institution_issued_code: createReg.body.data.institution_issued_code });
    await request(app)
      .post('/registration/me/confirm-subjects')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    await request(app).post('/registration/me/submit').set('Authorization', `Bearer ${studentToken}`).send({});

    const approveRes = await request(app)
      .post(`/registration/institution/registrations/${registrationId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(approveRes.status).toBe(200);

    const uidRes = await pool.query(`SELECT user_id FROM jupeb_registrations WHERE id = $1`, [registrationId]);
    const n = await pool.query(
      `SELECT id FROM notifications WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1`,
      [uidRes.rows[0].user_id, 'jupeb_registration_approved']
    );
    expect(n.rows.length).toBe(1);
  });

  it('parallel claim with same user: one succeeds, one conflicts', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;

    const suffix = Date.now() + 3;
    const prefix = nextJupebTestPrefix();
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('PC'),
        name: `Parallel Uni ${suffix}`,
        jupeb_prefix: prefix,
      });
    expect(uniRes.status).toBe(201);
    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('PCSC'),
        title: 'Parallel Combo',
        subjects: ['A', 'B', 'C'],
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
    expect(createReg.status).toBe(201);
    const code = createReg.body.data.institution_issued_code;
    const body = { institution_issued_code: code };
    const [a, b] = await Promise.all([
      request(app).post('/registration/me/claim-code').set('Authorization', `Bearer ${token}`).send(body),
      request(app).post('/registration/me/claim-code').set('Authorization', `Bearer ${token}`).send(body),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('claim returns 410 when institution code TTL has passed', async () => {
    if (!registrationMigrated || !jupebEnhancements) return;
    const token = await getAdminToken();
    if (!token) return;

    const suffix = Date.now() + 4;
    const prefix = nextJupebTestPrefix();
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('EX'),
        name: `Expiry Uni ${suffix}`,
        jupeb_prefix: prefix,
      });
    expect(uniRes.status).toBe(201);
    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('EXSC'),
        title: 'Expiry Combo',
        subjects: ['A', 'B', 'C'],
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
    expect(createReg.status).toBe(201);
    await pool.query(
      `UPDATE jupeb_registrations SET institution_code_expires_at = NOW() - interval '1 minute' WHERE id = $1`,
      [createReg.body.data.id]
    );
    const claimRes = await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: createReg.body.data.institution_issued_code });
    expect(claimRes.status).toBe(410);
  });

  it('program_director cannot create registration for university outside profile scope', async () => {
    if (!registrationMigrated || !jupebEnhancements) return;
    const token = await getAdminToken();
    if (!token) return;

    const suffix = Date.now() + 5;
    const email = `pd_scope_${suffix}@example.com`;
    const hash = '$2a$10$nUXnvPcXVjgZ/fMOeFown.orAJ1WTBQUvi7nt5pjJH.PsQ.gmXwa.';
    const uIns = await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $3, true, true, $2, 'active') RETURNING id`,
      [email, hash, `+2349${String(suffix).padStart(10, '0').slice(0, 10)}`]
    );
    const pdId = uIns.rows[0].id;
    const uniA = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('SUA'),
        name: `Scope A ${suffix}`,
        jupeb_prefix: nextJupebTestPrefix(),
      });
    const uniB = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('SUB'),
        name: `Scope B ${suffix}`,
        jupeb_prefix: nextJupebTestPrefix(),
      });
    expect(uniA.status).toBe(201);
    expect(uniB.status).toBe(201);
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name, jupeb_university_id)
       VALUES ($1, 'Scope', 'Director', 'Scope Director', $2)`,
      [pdId, uniA.body.data.id]
    );
    const roleR = await pool.query(`SELECT id FROM roles WHERE name = 'program_director' LIMIT 1`);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [pdId, roleR.rows[0].id]);

    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('SCS'),
        title: 'Scope Combo',
        subjects: ['A', 'B', 'C'],
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
    await closeAllOpenJupebSessions(token);
    await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${token}`);

    const loginPd = await request(app).post('/auth/login').send({ identifier: email, password: 'Director@12' });
    expect(loginPd.status).toBe(200);
    const pdToken = loginPd.body.data.access_token;

    const bad = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${pdToken}`)
      .send({
        session_id: sessRes.body.data.id,
        university_id: uniB.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    expect(bad.status).toBe(403);

    await pool.query(`DELETE FROM user_roles WHERE user_id = $1`, [pdId]);
    await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [pdId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [pdId]);
  });
});
