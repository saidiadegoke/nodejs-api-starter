const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
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
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} Profile Uni`,
          jupeb_prefix: nextJupebTestPrefix(),
        });
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
          opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
          closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
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
    const verifyRes = await request(app)
      .post('/identity/nin/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nin,
        idempotency_key: `idem-profile-pending-${Date.now()}`,
        intake_payload: { name: 'Adebayo Salami', phone: '+2348000000001' },
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
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: createReg.body.data.institution_issued_code });

    const res = await request(app)
      .get('/registration/me/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.nin_verification.status).toBe('pending');
    expect(res.body.data.contact_information.phone).toBe('+2348000000001');
    expect(res.body.data.candidate.full_name).toMatch(/Adebayo Salami/);
  });
});
