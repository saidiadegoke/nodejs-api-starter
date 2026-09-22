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
          opens_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          closes_at: new Date(Date.now() + 30 * 86400000).toISOString(),
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

  it('persists next_of_kin via nested object on PATCH /registration/me/profile', async () => {
    if (!registrationMigrated || !addressColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'NOK1');

    const nokData = {
      name: 'Folashade Adebayo',
      relationship: 'mother',
      phone: '+2348030000000',
      email: 'folashade@example.com',
      address: '12 Victoria Island, Lagos',
    };

    const patch = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        residential_address: '12 Surulere Avenue, Lagos',
        next_of_kin: nokData,
      });

    expect(patch.status).toBe(200);
    expect(patch.body.success).toBe(true);
    expect(patch.body.data.next_of_kin).toBeDefined();
    expect(patch.body.data.next_of_kin.name).toBe(nokData.name);
    expect(patch.body.data.next_of_kin.relationship).toBe(nokData.relationship);
    expect(patch.body.data.next_of_kin.phone).toBe(nokData.phone);
    expect(patch.body.data.next_of_kin.email).toBe(nokData.email);
    expect(patch.body.data.next_of_kin.address).toBe(nokData.address);
    expect(patch.body.data.next_of_kin.source).toBe('student');

    // Subsequent GET /registration/me/profile reflects the same next_of_kin
    const profile = await request(app)
      .get('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.next_of_kin).toBeDefined();
    expect(profile.body.data.next_of_kin.name).toBe(nokData.name);
    expect(profile.body.data.next_of_kin.phone).toBe(nokData.phone);

    // Dedicated GET /registration/me/next-of-kin endpoint also reflects it
    const nokRes = await request(app)
      .get('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(nokRes.status).toBe(200);
    expect(nokRes.body.data.name).toBe(nokData.name);
    expect(nokRes.body.data.phone).toBe(nokData.phone);
  });

  it('allows partial next_of_kin update merging with existing active next_of_kin', async () => {
    if (!registrationMigrated || !addressColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'NOK2');

    // Initial creation via PATCH /registration/me/profile
    await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        next_of_kin: {
          name: 'Jane Doe',
          relationship: 'sister',
          phone: '+2348012345678',
          email: 'jane@example.com',
          address: '456 Ikeja Road',
        },
      });

    // Partial update: update only phone
    const patch = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        next_of_kin: {
          phone: '+2348099998888',
        },
      });

    expect(patch.status).toBe(200);
    expect(patch.body.data.next_of_kin.name).toBe('Jane Doe');
    expect(patch.body.data.next_of_kin.relationship).toBe('sibling');
    expect(patch.body.data.next_of_kin.phone).toBe('+2348099998888');
    expect(patch.body.data.next_of_kin.email).toBe('jane@example.com');
    expect(patch.body.data.next_of_kin.address).toBe('456 Ikeja Road');
  });

  it('supports flat next_of_kin fields on PATCH /registration/me/profile', async () => {
    if (!registrationMigrated || !addressColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'NOK3');

    const patch = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        next_of_kin_name: 'Samuel Tester',
        next_of_kin_relationship: 'father',
        next_of_kin_phone: '+2348077776666',
        next_of_kin_email: 'samuel@example.com',
        next_of_kin_address: '77 Marina St',
      });

    expect(patch.status).toBe(200);
    expect(patch.body.data.next_of_kin.name).toBe('Samuel Tester');
    expect(patch.body.data.next_of_kin.relationship).toBe('father');
    expect(patch.body.data.next_of_kin.phone).toBe('+2348077776666');
    expect(patch.body.data.next_of_kin.email).toBe('samuel@example.com');
    expect(patch.body.data.next_of_kin.address).toBe('77 Marina St');
  });

  it('validates next_of_kin fields on PATCH /registration/me/profile (422)', async () => {
    if (!registrationMigrated || !addressColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'NOKVAL');

    // 1. Invalid relationship
    const resRel = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        next_of_kin: {
          name: 'Jane Doe',
          relationship: 'pet',
          phone: '+2348012345678',
        },
      });
    expect(resRel.status).toBe(422);
    expect(
      resRel.body.details?.errors?.some(
        (e) => e.field === 'next_of_kin.relationship' && e.error_code === 'invalid_relationship'
      )
    ).toBe(true);

    // 2. Phone too short
    const resPhone = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        next_of_kin: {
          name: 'Jane Doe',
          relationship: 'mother',
          phone: '123',
        },
      });
    expect(resPhone.status).toBe(422);
    expect(
      resPhone.body.details?.errors?.some(
        (e) => e.field === 'next_of_kin.phone' && e.error_code === 'phone_too_short'
      )
    ).toBe(true);

    // 3. Invalid email
    const resEmail = await request(app)
      .patch('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        next_of_kin: {
          name: 'Jane Doe',
          relationship: 'mother',
          email: 'not-an-email',
        },
      });
    expect(resEmail.status).toBe(422);
    expect(
      resEmail.body.details?.errors?.some(
        (e) => e.field === 'next_of_kin.email' && e.error_code === 'invalid_email'
      )
    ).toBe(true);
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
          opens_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          closes_at: new Date(Date.now() + 30 * 86400000).toISOString(),
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
          opens_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          closes_at: new Date(Date.now() + 30 * 86400000).toISOString(),
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
