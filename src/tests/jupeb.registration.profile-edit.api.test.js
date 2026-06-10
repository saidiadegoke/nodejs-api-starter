const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
  buildCatalogUniversityPayload,
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
    for (let i = 0; i < 30; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          buildCatalogUniversityPayload(`${tag}${i}`, {
            code: nextJupebTestUniversityCode(tag),
            name: `${tag} ProfileEdit University`,
          })
        );
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
      .post('/auth/complete-registration')
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

    // users.phone has a unique constraint, so the test phone must be unique
    // per run — accumulated state across runs would otherwise 409 the PATCH.
    const uniquePhone = `+234801${String(Date.now()).slice(-7)}`;
    const patch = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        residential_address: '12 Surulere Avenue, Lagos',
        state_of_origin: 'Ondo',
        lga: 'Ondo West',
        place_of_birth: 'Lagos State',
        phone: uniquePhone,
      });
    expect(patch.status).toBe(200);
    expect(patch.body.success).toBe(true);
    expect(patch.body.data.basic_information.residential_address).toBe(
      '12 Surulere Avenue, Lagos'
    );
    expect(patch.body.data.basic_information.state_of_origin).toBe('Ondo');
    expect(patch.body.data.basic_information.lga).toBe('Ondo West');
    expect(patch.body.data.basic_information.place_of_birth).toBe('Lagos State');
    expect(patch.body.data.contact_information.phone).toBe(uniquePhone);

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
        provider: 'mock',
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

describe('PATCH /registration/institution/registrations/:id/candidate', () => {
  let registrationMigrated = false;
  let addressColumnsMigrated = false;

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
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  async function newClaimedRegistration(adminToken, tag) {
    let uniRes;
    for (let i = 0; i < 30; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          buildCatalogUniversityPayload(`${tag}${i}`, {
            code: nextJupebTestUniversityCode(tag),
            name: `${tag} InstCand University`,
          })
        );
      if (uniRes.status === 201) break;
    }
    expect(uniRes.status).toBe(201);
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
      });
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const studentEmail = `icand-${tag.toLowerCase()}-${stamp}@example.com`;
    const reg = await request(app)
      .post('/auth/complete-registration')
      .send({
        code: createReg.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: studentEmail,
      });
    return {
      registrationId: createReg.body.data.id,
      studentToken: reg.body.data.access_token,
    };
  }

  async function ensureRequirement(adminToken, key, label) {
    const create = await request(app)
      .post('/submission/requirements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key,
        label,
        title: label,
        description: `${label} test`,
        is_mandatory: false,
        allowed_mime_types: ['application/pdf'],
        max_file_size_mb: 5,
      });
    if (create.status === 201) return create.body.data;
    const list = await request(app)
      .get('/submission/requirements?limit=200')
      .set('Authorization', `Bearer ${adminToken}`);
    const arr = Array.isArray(list.body.data) ? list.body.data : list.body.data?.rows || [];
    return arr.find((r) => r.key === key) || null;
  }

  async function uploadDummyFile(token, name = 'fake.pdf') {
    const tinyPdf = '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF';
    const base64 = Buffer.from(tinyPdf).toString('base64');
    const res = await request(app)
      .post('/files/upload-base64')
      .set('Authorization', `Bearer ${token}`)
      .send({
        file_data: `data:application/pdf;base64,${base64}`,
        context: 'submission_test',
        file_name: name,
      });
    return res.body.data && (res.body.data.file_id || res.body.data.id);
  }

  it('admin updates candidate profile via institution path', async () => {
    if (!registrationMigrated || !addressColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { registrationId } = await newClaimedRegistration(adminToken, 'ICAND');

    const patch = await request(app)
      .patch(`/registration/institution/registrations/${registrationId}/candidate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ residential_address: 'Institution candidate patch road' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.candidate.residential_address).toBe('Institution candidate patch road');
  });

  it('admin updates subject_combination_id via institution candidate path', async () => {
    if (!registrationMigrated || !addressColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { registrationId } = await newClaimedRegistration(adminToken, 'ICSC');

    let sc2;
    for (let i = 0; i < 5; i += 1) {
      sc2 = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode('ICSC2'),
          title: 'Inst cand combo 2',
          subjects: ['Bio', 'Chem', 'Phys'],
          is_global: true,
        });
      if (sc2.status === 201) break;
    }
    if (sc2.status !== 201) return;

    const patch = await request(app)
      .patch(`/registration/institution/registrations/${registrationId}/candidate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ subject_combination_id: sc2.body.data.id });
    expect(patch.status).toBe(200);
    expect(patch.body.data.subject_combination.id).toBe(sc2.body.data.id);
  });

  it('admin replaces a submitted document via institution candidate path', async () => {
    let submissionMigrated = false;
    try {
      await pool.query('SELECT 1 FROM jupeb_document_requirements LIMIT 1');
      submissionMigrated = true;
    } catch {
      submissionMigrated = false;
    }
    if (!submissionMigrated || !registrationMigrated || !addressColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(adminToken, 'inst_cand_reupload', 'Inst cand reupload');
    if (!requirement) return;

    const { registrationId, studentToken } = await newClaimedRegistration(adminToken, 'ICDOC');
    delete process.env.FEATURE_OCR_ENABLED;
    const file1 = await uploadDummyFile(studentToken, 'cand-v1.pdf');
    if (!file1) return;
    const attach = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: file1 });
    expect(attach.status).toBe(201);
    const documentId = attach.body.data.id;

    const file2 = await uploadDummyFile(adminToken, 'staff-v2.pdf');
    if (!file2) return;
    const patch = await request(app)
      .patch(`/registration/institution/registrations/${registrationId}/candidate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ documents: [{ document_id: documentId, file_id: file2 }] });
    expect(patch.status).toBe(200);
    const submitted = (patch.body.data.documents || []).filter(
      (d) => d.requirement_id === requirement.id && d.status === 'submitted'
    );
    expect(submitted.length).toBeGreaterThanOrEqual(1);
    expect(submitted.some((d) => d.file_id === file2)).toBe(true);
  });

  it('422 when registration is not yet claimed', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    let uniRes;
    for (let i = 0; i < 30; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          buildCatalogUniversityPayload(`UCLM${i}`, {
            code: nextJupebTestUniversityCode('UCLM'),
            name: 'Unclaimed Inst Uni',
          })
        );
      if (uniRes.status === 201) break;
    }
    expect(uniRes.status).toBe(201);
    let scRes;
    for (let i = 0; i < 5; i += 1) {
      scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode('UCLMSC'),
          title: 'Unclaimed Combo',
          subjects: ['M', 'P', 'C'],
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
      });
    expect(createReg.status).toBe(201);

    const patch = await request(app)
      .patch(`/registration/institution/registrations/${createReg.body.data.id}/candidate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ residential_address: 'Should fail' });
    expect(patch.status).toBe(422);
  });
});
