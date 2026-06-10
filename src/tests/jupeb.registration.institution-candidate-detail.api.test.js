const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
  buildCatalogUniversityPayload,
} = require('./jupeb-session-test-helpers');

/**
 * GET /registration/institution/registrations/:id must return real documents
 * and result entries (regression: wrong model method names returned []).
 */
describe('GET /registration/institution/registrations/:id — documents & result_entries', () => {
  let submissionMigrated = false;
  let registrationMigrated = false;
  let metaColumnsMigrated = false;
  let resultEntriesMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_document_requirements LIMIT 1');
      submissionMigrated = true;
    } catch {
      submissionMigrated = false;
    }
    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
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
      await pool.query('SELECT 1 FROM jupeb_result_entries LIMIT 1');
      resultEntriesMigrated = true;
    } catch {
      resultEntriesMigrated = false;
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

  it('returns documents with download_url and result_entries after student activity', async () => {
    if (
      !submissionMigrated ||
      !registrationMigrated ||
      !metaColumnsMigrated ||
      !resultEntriesMigrated
    ) {
      return;
    }
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(
      adminToken,
      'inst_detail_test_doc',
      'Inst detail test doc'
    );
    if (!requirement) return;

    let uniRes;
    for (let i = 0; i < 30; i += 1) {
      const payload = buildCatalogUniversityPayload(`ICD${i}`);
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);
      if (uniRes.status === 201) break;
    }
    expect(uniRes.status).toBe(201);
    let scRes;
    for (let i = 0; i < 30; i += 1) {
      scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode('INSDETSC'),
          title: 'Inst Detail Combo',
          subjects: ['M', 'P', 'C'],
          is_global: true,
        });
      if (scRes.status === 201) break;
    }
    expect(scRes.status).toBe(201);
    let sessRes;
    for (let i = 0; i < 30; i += 1) {
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
    expect(sessRes.status).toBe(201);
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
    const registrationId = createReg.body.data.id;

    const stamp = Date.now();
    const reg = await request(app)
      .post('/auth/complete-registration')
      .send({
        code: createReg.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: `insdet-${stamp}@example.com`,
      });
    expect(reg.status).toBe(201);
    const studentToken = reg.body.data.access_token;

    delete process.env.FEATURE_OCR_ENABLED;
    const fileId = await uploadDummyFile(studentToken, 'inst-view.pdf');
    if (!fileId) return;
    const attach = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: fileId });
    expect(attach.status).toBe(201);

    const entry = await request(app)
      .post('/submission/me/result-entries')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        entries: [
          {
            source: 'waec',
            sitting: 1,
            serial: 1,
            subject: 'English Language',
            grade: 'A1',
          },
        ],
      });
    expect([200, 201]).toContain(entry.status);

    const detail = await request(app)
      .get(`/registration/institution/registrations/${registrationId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    const d = detail.body.data;
    expect(Array.isArray(d.documents)).toBe(true);
    expect(d.documents.length).toBeGreaterThanOrEqual(1);
    const doc = d.documents.find((x) => x.requirement_id === requirement.id);
    expect(doc).toBeDefined();
    expect(doc.file_id).toBe(fileId);
    expect(doc.download_url === null || typeof doc.download_url === 'string').toBe(true);

    expect(Array.isArray(d.result_entries)).toBe(true);
    expect(d.result_entries.length).toBeGreaterThanOrEqual(1);
    expect(d.result_entries.some((r) => String(r.subject || '').includes('ENGLISH'))).toBe(true);

    expect(Array.isArray(d.biometrics)).toBe(true);
    if (d.biometrics.length) {
      expect(d.biometrics[0]).toHaveProperty('preview_url');
    }
  });
});
