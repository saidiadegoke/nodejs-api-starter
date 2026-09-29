const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
  buildCatalogUniversityPayload,
} = require('./jupeb-session-test-helpers');

describe('GET /registration/me/profile', () => {
  let registrationMigrated = false;
  let ninPendingMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registration_status_history LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
    }
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'jupeb_nin_verifications' AND column_name = 'intake_payload'`
      );
      ninPendingMigrated = r.rowCount > 0;
    } catch {
      ninPendingMigrated = false;
    }
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  async function makeFixtures(token, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send(
          buildCatalogUniversityPayload(`${tag}${i}`, {
            code: nextJupebTestUniversityCode(tag),
            name: `${tag} Profile Uni`,
          })
        );
      if (uniRes.status === 201) break;
    }
    expect(uniRes.status).toBe(201);
    let scRes;
    for (let i = 0; i < 5; i += 1) {
      scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: nextJupebTestUniversityCode(`${tag}SC`),
          title: `${tag} Combo`,
          subjects: ['Math', 'Phys', 'Chem'],
          is_global: true,
        });
      if (scRes.status === 201) break;
    }
    expect(scRes.status).toBe(201);
    let sessRes;
    for (let i = 0; i < 5; i += 1) {
      const { y1, academicYear, yearShort } = nextJupebAcademicSession();
      sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          academic_year: academicYear,
          year_short: yearShort,
          opens_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          closes_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
      if (sessRes.status === 201) break;
    }
    await closeAllOpenJupebSessions(token);
    await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${token}`);
    return {
      sessionId: sessRes.body.data.id,
      universityId: uniRes.body.data.id,
      subjectCombinationId: scRes.body.data.id,
    };
  }

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/registration/me/profile');
    expect(res.status).toBe(401);
  });

  it('returns the composite profile after the student claims a code', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { sessionId, universityId, subjectCombinationId } = await makeFixtures(token, 'PRO');

    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        university_id: universityId,
        subject_combination_id: subjectCombinationId,
      });
    expect(createReg.status).toBe(201);
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: createReg.body.data.institution_issued_code });

    const res = await request(app)
      .get('/registration/me/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.candidate).toBeDefined();
    expect(res.body.data.candidate.id).toBe(createReg.body.data.id);
    expect(res.body.data.candidate.provisional_candidate_code).toBeDefined();
    expect(res.body.data.basic_information).toBeDefined();
    expect(res.body.data.contact_information).toBeDefined();
    expect(res.body.data.contact_information.email).toBeDefined();
    expect(res.body.data.subject_combination).toBeDefined();
    expect(res.body.data.subject_combination.id).toBe(subjectCombinationId);
    expect(res.body.data.university).toBeDefined();
    expect(res.body.data.university.id).toBe(universityId);
    expect(res.body.data.session).toBeDefined();
  });

  it('surfaces NIN-derived fields from intake_payload when verification is still pending', async () => {
    if (!registrationMigrated || !ninPendingMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { sessionId, universityId, subjectCombinationId } = await makeFixtures(token, 'PRP');

    process.env.JUPEB_NIN_FORCE_UNAVAILABLE = '1';
    const nin = `9${String(Date.now()).slice(-10)}`;
    // complete-registration copies intake_payload.phone onto users.phone,
    // which is uniquely constrained. Use a per-run value so reruns against
    // the same DB don't collide.
    const intakePhone = `+234800${String(Date.now()).slice(-7)}`;
    const verifyRes = await request(app)
      .post('/identity/nin/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nin,
        provider: 'mock',
        idempotency_key: `idem-profile-pending-${Date.now()}`,
        intake_payload: { name: 'Adebayo Salami', phone: intakePhone },
      });
    delete process.env.JUPEB_NIN_FORCE_UNAVAILABLE;
    const ninVerificationId = verifyRes.body.data.verification_id;

    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        university_id: universityId,
        subject_combination_id: subjectCombinationId,
        nin_verification_id: ninVerificationId,
      });
    // Claim as a fresh student via complete-registration so the user is born
    // out of the NIN intake (no admin phone leaking into contact_information).
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const reg = await request(app)
      .post('/auth/complete-registration')
      .send({
        code: createReg.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: `prp-pending-${stamp}@example.com`,
      });
    expect(reg.status).toBe(201);
    const studentToken = reg.body.data.access_token;

    const res = await request(app)
      .get('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.nin_verification.status).toBe('pending');
    expect(res.body.data.contact_information.phone).toBe(intakePhone);
    expect(res.body.data.candidate.full_name).toMatch(/Adebayo Salami/);
  });

  it('prefers NIN-verified name over intake_payload.name when verification is verified', async () => {
    if (!registrationMigrated || !ninPendingMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { sessionId, universityId, subjectCombinationId } = await makeFixtures(token, 'NIN');

    const nin = `8${String(Date.now()).slice(-10)}`;
    const verifyRes = await request(app)
      .post('/identity/nin/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nin,
        provider: 'mock',
        idempotency_key: `idem-profile-verified-${Date.now()}`,
        intake_payload: { name: 'James Bonds' },
      });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.status).toBe('verified');
    const ninVerificationId = verifyRes.body.data.verification_id;
    const ninFullName = [
      verifyRes.body.data.profile.first_name,
      verifyRes.body.data.profile.last_name,
    ].filter(Boolean).join(' ');
    expect(ninFullName).toBeTruthy();
    expect(ninFullName).not.toMatch(/James Bonds/);

    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        university_id: universityId,
        subject_combination_id: subjectCombinationId,
        nin_verification_id: ninVerificationId,
      });
    expect(createReg.status).toBe(201);

    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const reg = await request(app)
      .post('/auth/complete-registration')
      .send({
        code: createReg.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: `nin-name-${stamp}@example.com`,
      });
    expect(reg.status).toBe(201);
    const studentToken = reg.body.data.access_token;

    const res = await request(app)
      .get('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.nin_verification.status).toBe('verified');
    expect(res.body.data.candidate.full_name).toBe(ninFullName);
    expect(res.body.data.candidate.full_name).not.toMatch(/James Bonds/);
  });

  // Regression: when a student has registrations across multiple
  // sessions, findLatestForUser must prefer the row in the currently
  // OPEN session — not the most-recently-touched row across all
  // sessions. Without this, a stale rejected reg in a newer-by-
  // created_at closed session would mask the active one.
  it('prefers the open-session registration over a newer closed-session one', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;

    // Session A — claimed by admin, then we'll close it.
    const fixA = await makeFixtures(token, 'OSA');
    const createA = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: fixA.sessionId,
        university_id: fixA.universityId,
        subject_combination_id: fixA.subjectCombinationId,
      });
    expect(createA.status).toBe(201);
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: createA.body.data.institution_issued_code });

    // Close session A and open session B with a fresh fixture set.
    await request(app).post(`/sessions/${fixA.sessionId}/close`).set('Authorization', `Bearer ${token}`);
    const fixB = await makeFixtures(token, 'OSB');

    // Resolve admin's user_id so we can attach a second registration.
    const userRow = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER('admin@example.com') LIMIT 1`
    );
    const userId = userRow.rows[0]?.id;
    if (!userId) return;

    // Insert the new-session registration, *backdating* updated_at so
    // the old query (ORDER BY updated_at DESC) would still pick A —
    // proving the new query prefers B because session B is open.
    await pool.query(
      `INSERT INTO jupeb_registrations
         (session_id, university_id, user_id, subject_combination_id,
          provisional_serial, provisional_candidate_code, status,
          claimed_at, updated_at, created_at)
       VALUES ($1, $2, $3, $4, 1, $5, 'claimed',
               CURRENT_TIMESTAMP,
               CURRENT_TIMESTAMP - INTERVAL '1 day',
               CURRENT_TIMESTAMP - INTERVAL '1 day')`,
      [
        fixB.sessionId,
        fixB.universityId,
        userId,
        fixB.subjectCombinationId,
        // 9-char numeric code; uniqueness scoped via the random suffix.
        `26${String(Math.floor(100 + Math.random() * 899))}${String(Math.floor(1000 + Math.random() * 8999))}`,
      ]
    );

    const res = await request(app)
      .get('/registration/me/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.session.id).toBe(fixB.sessionId);
  });
});
