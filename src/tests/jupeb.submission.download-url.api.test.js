const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('GET /submission/me/documents/:id/download-url (M.11)', () => {
  let submissionMigrated = false;
  let registrationMigrated = false;
  let metaColumnsMigrated = false;

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
        key, label, title: label,
        description: `${label} test`,
        is_mandatory: false,
        allowed_mime_types: ['application/pdf'],
        max_file_size_mb: 5,
      });
    if (create.status === 201) return create.body.data;
    const list = await request(app)
      .get('/submission/requirements?limit=200')
      .set('Authorization', `Bearer ${adminToken}`);
    const arr = Array.isArray(list.body.data) ? list.body.data : (list.body.data?.rows || []);
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
          name: `${tag} DL University`,
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
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const reg = await request(app)
      .post('/auth/register-with-code')
      .send({
        code: createReg.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: `dl-${tag.toLowerCase()}-${stamp}@example.com`,
      });
    return {
      studentToken: reg.body.data.access_token,
    };
  }

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/submission/me/documents/00000000-0000-1000-8000-000000000000/download-url');
    expect(res.status).toBe(401);
  });

  it('owner gets { url, expires_at } for their own document', async () => {
    if (!submissionMigrated || !registrationMigrated || !metaColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(adminToken, 'signed_registration_form', 'Signed registration form');
    if (!requirement) return;

    const { studentToken } = await newClaimedRegistration(adminToken, 'OWN');
    const fileId = await uploadDummyFile(studentToken, 'mine.pdf');
    if (!fileId) return;

    delete process.env.FEATURE_OCR_ENABLED;
    const attach = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ requirement_id: requirement.id, file_id: fileId });
    expect(attach.status).toBe(201);
    const docId = attach.body.data.id;

    const res = await request(app)
      .get(`/submission/me/documents/${docId}/download-url`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBeDefined();
    expect(res.body.data.expires_at).toBeDefined();
    const expiresAt = new Date(res.body.data.expires_at).getTime();
    expect(expiresAt - Date.now()).toBeGreaterThan(0);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(310 * 1000);
  });

  it('non-owner student gets 403', async () => {
    if (!submissionMigrated || !registrationMigrated || !metaColumnsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const requirement = await ensureRequirement(adminToken, 'signed_registration_form', 'Signed registration form');
    if (!requirement) return;

    const { studentToken: ownerToken } = await newClaimedRegistration(adminToken, 'OWN2');
    const { studentToken: otherToken } = await newClaimedRegistration(adminToken, 'OTHER');

    const fileId = await uploadDummyFile(ownerToken, 'their.pdf');
    if (!fileId) return;
    const attach = await request(app)
      .post('/submission/me/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ requirement_id: requirement.id, file_id: fileId });
    expect(attach.status).toBe(201);
    const docId = attach.body.data.id;

    const res = await request(app)
      .get(`/submission/me/documents/${docId}/download-url`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown document id', async () => {
    if (!submissionMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'NF');
    const res = await request(app)
      .get('/submission/me/documents/aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa/download-url')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(404);
  });
});
