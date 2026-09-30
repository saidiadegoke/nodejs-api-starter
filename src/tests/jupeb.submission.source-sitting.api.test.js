const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('POST /submission/me/documents — source + sitting (M.4)', () => {
  let submissionMigrated = false;
  let metaColumnsMigrated = false;
  let registrationMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_document_requirements LIMIT 1');
      submissionMigrated = true;
    } catch {
      submissionMigrated = false;
    }
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'jupeb_registration_documents' AND column_name = 'source'`
      );
      metaColumnsMigrated = r.rowCount > 0;
    } catch {
      metaColumnsMigrated = false;
    }
    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
    }
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  async function ensureRequirement(adminToken, key, label) {
    // Try to create. 409 ⇒ already seeded; we then need its id, fetched by listing.
    const create = await request(app)
      .post('/submission/requirements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key,
        label,
        title: label,
        description: `${label} (test fixture)`,
        is_mandatory: false,
        allowed_mime_types: ['application/pdf', 'image/png', 'image/jpeg'],
        max_file_size_mb: 5,
      });
    if (create.status === 201) return create.body.data;

    // Fall back to lookup
    const list = await request(app)
      .get('/submission/requirements?limit=200')
      .set('Authorization', `Bearer ${adminToken}`);
    const rows = list.body && (list.body.data || []);
    const arr = Array.isArray(rows) ? rows : (rows.rows || []);
    const found = arr.find((r) => r.key === key);
    return found || null;
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

  async function newClaimedRegistration(adminToken, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} M4 University`,
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
      });
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const reg = await request(app)
      .post('/auth/complete-registration')
      .send({
        code: createReg.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: `m4-${tag.toLowerCase()}-${stamp}@example.com`,
      });
    return {
      studentToken: reg.body.data.access_token,
      registrationId: reg.body.data.registration.id,
    };
  }

  it('rejects WAEC result upload without source + sitting (422 with errors[])', async () => {
    if (!submissionMigrated || !metaColumnsMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(adminToken, 'waec_result', 'WAEC SSCE result');
    if (!requirement) return;

    const { studentToken } = await newClaimedRegistration(adminToken, 'NOMETA');
    const fileId = await uploadDummyFile(studentToken, 'fake-waec.pdf');
    if (!fileId) return;

    const res = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: fileId });
    expect(res.status).toBe(422);
    const codes = (res.body.details && res.body.details.errors || []).map((e) => e.error_code);
    // Either source_required (caller passed nothing → infer fails when key isn't `waec_result` style)
    // or sitting_required.
    expect(codes.includes('sitting_required') || codes.includes('source_required')).toBe(true);
  });

  it('accepts WAEC sitting=1 then sitting=2 (different tuples succeed)', async () => {
    if (!submissionMigrated || !metaColumnsMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(adminToken, 'waec_result', 'WAEC SSCE result');
    if (!requirement) return;

    const { studentToken } = await newClaimedRegistration(adminToken, 'TWOSIT');
    const file1 = await uploadDummyFile(studentToken, 'waec-1.pdf');
    const file2 = await uploadDummyFile(studentToken, 'waec-2.pdf');
    if (!file1 || !file2) return;

    const r1 = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: file1, source: 'waec', sitting: 1 });
    expect(r1.status).toBe(201);
    expect(r1.body.data.source).toBe('waec');
    expect(r1.body.data.sitting).toBe(1);

    const r2 = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: file2, source: 'waec', sitting: 2 });
    expect(r2.status).toBe(201);
    expect(r2.body.data.source).toBe('waec');
    expect(r2.body.data.sitting).toBe(2);
  });

  it('rejects duplicate (source, sitting) with 409 + error_code:duplicate_source_sitting', async () => {
    if (!submissionMigrated || !metaColumnsMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(adminToken, 'waec_result', 'WAEC SSCE result');
    if (!requirement) return;

    const { studentToken } = await newClaimedRegistration(adminToken, 'DUP');
    const file1 = await uploadDummyFile(studentToken, 'dup-1.pdf');
    const file2 = await uploadDummyFile(studentToken, 'dup-2.pdf');
    if (!file1 || !file2) return;

    const r1 = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: file1, source: 'waec', sitting: 1 });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: file2, source: 'waec', sitting: 1 });
    expect(r2.status).toBe(409);
    expect(r2.body.details && r2.body.details.error_code).toBe('duplicate_source_sitting');
    expect(r2.body.details.existing_document_id).toBe(r1.body.data.id);
  });

  it('rejects sitting outside {1,2} with sitting_invalid', async () => {
    if (!submissionMigrated || !metaColumnsMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(adminToken, 'waec_result', 'WAEC SSCE result');
    if (!requirement) return;

    const { studentToken } = await newClaimedRegistration(adminToken, 'BADSIT');
    const fileId = await uploadDummyFile(studentToken, 'bad-sit.pdf');
    if (!fileId) return;

    const res = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: fileId, source: 'waec', sitting: 7 });
    expect(res.status).toBe(422);
    const codes = (res.body.details && res.body.details.errors || []).map((e) => e.error_code);
    expect(codes).toContain('sitting_invalid');
  });

  it('non-result requirement (signed_registration_form) does not require source/sitting and ignores them', async () => {
    if (!submissionMigrated || !metaColumnsMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(
      adminToken,
      'signed_registration_form',
      'Signed registration form'
    );
    if (!requirement) return;

    const { studentToken } = await newClaimedRegistration(adminToken, 'NONRES');
    const fileId = await uploadDummyFile(studentToken, 'signed.pdf');
    if (!fileId) return;

    // Even with source/sitting in the body, non-result requirements ignore them.
    const res = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        requirement_id: requirement.id,
        file_id: fileId,
        source: 'waec',
        sitting: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.source).toBeNull();
    expect(res.body.data.sitting).toBeNull();
  });
});
