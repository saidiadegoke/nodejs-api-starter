const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('POST /submission/me/documents — OCR auto-trigger (M.6)', () => {
  let submissionMigrated = false;
  let ocrMigrated = false;
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
      await pool.query('SELECT 1 FROM ocr_jobs LIMIT 1');
      ocrMigrated = true;
    } catch {
      ocrMigrated = false;
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

  async function ensureRequirement(adminToken, key, label, mandatory = false) {
    const create = await request(app)
      .post('/submission/requirements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        key,
        label,
        title: label,
        description: `${label} (test fixture)`,
        is_mandatory: mandatory,
        allowed_mime_types: ['application/pdf', 'image/png', 'image/jpeg'],
        max_file_size_mb: 5,
      });
    if (create.status === 201) return create.body.data;
    const list = await request(app)
      .get('/submission/requirements?limit=200')
      .set('Authorization', `Bearer ${adminToken}`);
    const rows = list.body && (list.body.data || []);
    const arr = Array.isArray(rows) ? rows : (rows.rows || []);
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

  async function newClaimedRegistration(adminToken, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} OCR University`,
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
        email: `m6-${tag.toLowerCase()}-${stamp}@example.com`,
      });
    return {
      studentToken: reg.body.data.access_token,
      registrationId: reg.body.data.registration.id,
    };
  }

  it('result-type upload returns ocr_job: { id, status: "queued" }', async () => {
    if (!submissionMigrated || !ocrMigrated || !metaColumnsMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(adminToken, 'waec_result', 'WAEC SSCE result');
    if (!requirement) return;

    const { studentToken, registrationId } = await newClaimedRegistration(adminToken, 'OCROK');
    const fileId = await uploadDummyFile(studentToken, 'ocr-trigger.pdf');
    if (!fileId) return;

    delete process.env.FEATURE_OCR_ENABLED;
    const res = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: fileId, source: 'waec', sitting: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.ocr_job).toBeDefined();
    expect(res.body.data.ocr_job.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(['queued', 'processing', 'completed', 'failed']).toContain(
      res.body.data.ocr_job.status
    );
    // Most-likely state when the response is built (worker runs in setImmediate)
    expect(['queued', 'processing']).toContain(res.body.data.ocr_job.status);

    // The DB row carries the linkage metadata.
    const jobRow = await pool.query('SELECT * FROM ocr_jobs WHERE id = $1', [res.body.data.ocr_job.id]);
    expect(jobRow.rows.length).toBe(1);
    const job = jobRow.rows[0];
    expect(job.file_id).toBe(fileId);
    expect(job.exam_type).toBe('waec');
    expect(job.metadata.registration_id).toBe(registrationId);
    expect(job.metadata.requirement_id).toBe(requirement.id);
    expect(job.metadata.document_id).toBe(res.body.data.id);
    expect(job.metadata.source).toBe('waec');
    expect(job.metadata.sitting).toBe(1);
  });

  it('non-result requirement (signed_registration_form) does NOT trigger OCR', async () => {
    if (!submissionMigrated || !ocrMigrated || !metaColumnsMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(
      adminToken,
      'signed_registration_form',
      'Signed registration form',
      true
    );
    if (!requirement) return;

    const { studentToken } = await newClaimedRegistration(adminToken, 'OCRSKIP');
    const fileId = await uploadDummyFile(studentToken, 'signed.pdf');
    if (!fileId) return;

    delete process.env.FEATURE_OCR_ENABLED;
    const res = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: fileId });
    expect(res.status).toBe(201);
    expect(res.body.data.ocr_job).toBeUndefined();
  });

  it('FEATURE_OCR_ENABLED=false skips OCR even for result-type uploads', async () => {
    if (!submissionMigrated || !ocrMigrated || !metaColumnsMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(adminToken, 'waec_result', 'WAEC SSCE result');
    if (!requirement) return;

    const { studentToken } = await newClaimedRegistration(adminToken, 'OCROFF');
    const fileId = await uploadDummyFile(studentToken, 'flag-off.pdf');
    if (!fileId) return;

    process.env.FEATURE_OCR_ENABLED = 'false';
    try {
      const res = await request(app)
        .post('/submission/me/documents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ requirement_id: requirement.id, file_id: fileId, source: 'waec', sitting: 1 });
      expect(res.status).toBe(201);
      expect(res.body.data.ocr_job).toBeUndefined();
    } finally {
      delete process.env.FEATURE_OCR_ENABLED;
    }
  });

  it('PATCH replacement also re-triggers OCR for result-type uploads', async () => {
    if (!submissionMigrated || !ocrMigrated || !metaColumnsMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(adminToken, 'waec_result', 'WAEC SSCE result');
    if (!requirement) return;

    const { studentToken } = await newClaimedRegistration(adminToken, 'OCRPATCH');
    const file1 = await uploadDummyFile(studentToken, 'first.pdf');
    const file2 = await uploadDummyFile(studentToken, 'second.pdf');
    if (!file1 || !file2) return;

    delete process.env.FEATURE_OCR_ENABLED;
    const create = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: file1, source: 'waec', sitting: 1 });
    expect(create.status).toBe(201);
    const firstJobId = create.body.data.ocr_job && create.body.data.ocr_job.id;

    const replace = await request(app)
      .patch(`/submission/me/documents/${create.body.data.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ file_id: file2 });
    expect(replace.status).toBe(200);
    expect(replace.body.data.ocr_job).toBeDefined();
    expect(replace.body.data.ocr_job.id).not.toBe(firstJobId);
  });
});
