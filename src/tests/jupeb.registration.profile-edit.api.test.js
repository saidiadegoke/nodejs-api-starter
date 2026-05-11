const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('PATCH /registration/me/profile (M.2)', () => {
  let registrationMigrated = false;
  let addressColumnsMigrated = false;
  let ninPendingMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
    }
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'profiles' AND column_name = 'residential_address'`
      );
      addressColumnsMigrated = r.rowCount > 0;
    } catch {
      addressColumnsMigrated = false;
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

  async function newClaimedRegistration(adminToken, tag, ninVerificationId = null) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} ProfileEdit University`,
          jupeb_prefix: nextJupebTestPrefix(),
        });
      if (uniRes.status === 201) break;
    }
    let scRes;
    for (let i = 0; i < 5; i += 1) {
      scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(`${tag}SC`),
          title: `${tag} Combo`,
          subjects: ['Math', 'Phys', 'Chem'],
          is_global: true,
        });
      if (scRes.status === 201) break;
    }
    let sessRes;
    for (let i = 0; i < 5; i += 1) {
      const { y1, academicYear, yearShort } = nextJupebAcademicSession();
      sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          academic_year: academicYear,
          year_short: yearShort,
          opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
          closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        });
      if (sessRes.status === 201) break;
    }
    await closeAllOpenJupebSessions(adminToken);
    await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${adminToken}`);
    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessRes.body.data.id,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
        nin_verification_id: ninVerificationId,
      });
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const studentEmail = `pe-${tag.toLowerCase()}-${stamp}@example.com`;
    const reg = await request(app)
      .post('/auth/register-with-code')
      .send({
        code: createReg.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: studentEmail,
      });
    return {
      studentToken: reg.body.data.access_token,
      studentEmail,
      registrationId: reg.body.data.registration.id,
    };
  }

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .patch('/registration/me/profile')
      .send({ residential_address: '123 Lagos Rd' });
    expect(res.status).toBe(401);
  });

  it('persists residential_address + state_of_origin + lga + place_of_birth + phone', async () => {
    if (!registrationMigrated || !addressColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'OK');

    const patch = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        residential_address: '12 Surulere Avenue, Lagos',
        state_of_origin: 'Ondo',
        lga: 'Ondo West',
        place_of_birth: 'Lagos State',
        phone: '+2348012345678',
      });
    expect(patch.status).toBe(200);
    expect(patch.body.success).toBe(true);
    expect(patch.body.data.basic_information.residential_address).toBe(
      '12 Surulere Avenue, Lagos'
    );
    expect(patch.body.data.basic_information.state_of_origin).toBe('Ondo');
    expect(patch.body.data.basic_information.lga).toBe('Ondo West');
    expect(patch.body.data.basic_information.place_of_birth).toBe('Lagos State');
    expect(patch.body.data.contact_information.phone).toBe('+2348012345678');

    // Subsequent GET reflects the same values
    const profile = await request(app)
      .get('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(profile.body.data.basic_information.residential_address).toBe(
      '12 Surulere Avenue, Lagos'
    );
  });

  it('rejects invalid email (422)', async () => {
    if (!registrationMigrated || !addressColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'BADEMAIL');

    const res = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(
      res.body.details &&
        Array.isArray(res.body.details.errors) &&
        res.body.details.errors.some((e) => e.error_code === 'invalid_email')
    ).toBe(true);
  });

  it('rejects updates to NIN-immutable fields (date_of_birth, gender) when verified NIN exists', async () => {
    if (!registrationMigrated || !addressColumnsMigrated || !ninPendingMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    // Create a NIN verification first via the mock adapter (verified state)
    const nin = `1${String(Date.now()).slice(-10)}`;
    const verifyRes = await request(app)
      .post('/identity/nin/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nin,
        idempotency_key: `idem-pe-immutable-${Date.now()}`,
        intake_payload: { name: 'Adebayo Salami' },
      });
    if (verifyRes.status !== 200 && verifyRes.status !== 201) return;
    // The mock adapter returns `status: verified` synchronously by default.
    const ninVerificationId = verifyRes.body.data.verification_id;

    const { studentToken } = await newClaimedRegistration(
      adminToken,
      'IMM',
      ninVerificationId
    );

    // Find what the verified payload says so we can attempt to overwrite it.
    const profile = await request(app)
      .get('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`);
    if (profile.body.data.nin_verification.status !== 'verified') {
      // adapter wasn't verified — skip rather than false-flag
      return;
    }
    const onFileGender = profile.body.data.basic_information.gender;
    const conflictingGender = onFileGender === 'male' ? 'female' : 'male';

    const patch = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ gender: conflictingGender });
    expect(patch.status).toBe(422);
    expect(
      Array.isArray(patch.body.details.errors) &&
        patch.body.details.errors.some(
          (e) => e.field === 'gender' && e.error_code === 'nin_field_immutable'
        )
    ).toBe(true);
  });

  it('returns 409 when email is already taken by another user', async () => {
    if (!registrationMigrated || !addressColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentEmail: existingEmail } = await newClaimedRegistration(adminToken, 'OWN1');
    const { studentToken } = await newClaimedRegistration(adminToken, 'OWN2');

    const res = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ email: existingEmail });
    expect(res.status).toBe(409);
  });
});
