const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('Registrar OCR review + override (M.13)', () => {
  let resultEntriesMigrated = false;
  let ocrMigrated = false;
  let registrationMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_result_entries LIMIT 1');
      resultEntriesMigrated = true;
    } catch {
      resultEntriesMigrated = false;
    }
    try {
      await pool.query('SELECT 1 FROM ocr_jobs LIMIT 1');
      ocrMigrated = true;
    } catch {
      ocrMigrated = false;
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

  async function newClaimedRegistration(adminToken, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} Review University`,
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
      .post('/auth/complete-registration')
      .send({
        code: createReg.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: `rev-${tag.toLowerCase()}-${stamp}@example.com`,
      });
    return {
      adminToken,
      studentToken: reg.body.data.access_token,
      registrationId: reg.body.data.registration.id,
    };
  }

  it('returns 401 without auth', async () => {
    const res = await request(app).get(
      '/submission/institution/registrations/00000000-0000-1000-8000-000000000000/result-entries'
    );
    expect(res.status).toBe(401);
  });

  it('GET institution result-entries lists rows grouped, with origin + ocr_confidence', async () => {
    if (!resultEntriesMigrated || !ocrMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken, registrationId } = await newClaimedRegistration(adminToken, 'GET');

    // Seed an OCR job + result + entry directly so we can assert the join.
    const ocrJobRow = await pool.query(
      `INSERT INTO ocr_jobs
         (file_id, exam_type, provider, status, requested_by, metadata)
       VALUES (
         (SELECT id FROM files LIMIT 1),
         'waec', 'mock', 'completed',
         (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1),
         $1
       )
       RETURNING id`,
      [JSON.stringify({ registration_id: registrationId, sitting: 1 })]
    ).catch(() => null);
    if (!ocrJobRow || !ocrJobRow.rows[0]) return; // No files row in this DB
    const ocrJobId = ocrJobRow.rows[0].id;
    await pool.query(
      `INSERT INTO ocr_results
         (job_id, exam_type_detected, confidence, result_json, raw_text)
       VALUES ($1, 'waec', 87.50, '{}'::jsonb, '')`,
      [ocrJobId]
    );
    await pool.query(
      `INSERT INTO jupeb_result_entries
         (registration_id, source, sitting, serial, subject, grade, grade_normalized, origin, ocr_job_id)
       VALUES ($1, 'waec', 1, 0, 'ENGLISH LANGUAGE', 'B3', 'B', 'ocr', $2)`,
      [registrationId, ocrJobId]
    );

    // The student's signup token has an admin/super_admin role under the relaxed
    // jupebStudentMiddleware default; they'd not have it in strict mode. Use the
    // adminToken which definitely has institution-review.
    const res = await request(app)
      .get(`/submission/institution/registrations/${registrationId}/result-entries`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.registration_id).toBe(registrationId);
    expect(Array.isArray(res.body.data.groups)).toBe(true);
    const waec1 = res.body.data.groups.find((g) => g.source === 'waec' && g.sitting === 1);
    expect(waec1).toBeDefined();
    const eng = waec1.subjects.find((s) => s.subject === 'ENGLISH LANGUAGE');
    expect(eng.origin).toBe('ocr');
    expect(eng.ocr_confidence).toBe(87.5);
    expect(eng.ocr_job_id).toBe(ocrJobId);
  });

  it('PATCH institution result-entry overwrites grade and flips origin to manual', async () => {
    if (!resultEntriesMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { registrationId } = await newClaimedRegistration(adminToken, 'PATCH');

    const ins = await pool.query(
      `INSERT INTO jupeb_result_entries
         (registration_id, source, sitting, serial, subject, grade, grade_normalized, origin)
       VALUES ($1, 'waec', 1, 0, 'MATHEMATICS', 'C5', 'C', 'ocr')
       RETURNING id`,
      [registrationId]
    );
    const entryId = ins.rows[0].id;

    const res = await request(app)
      .patch(`/submission/institution/result-entries/${entryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grade: 'A1' });
    expect(res.status).toBe(200);
    expect(res.body.data.grade).toBe('A1');
    expect(res.body.data.grade_normalized).toBe('A');
    expect(res.body.data.origin).toBe('manual');

    // Sanity: an OCR write-through can no longer overwrite this manual entry.
    const resultEntriesModel = require('../modules/jupeb/models/result-entries.model');
    await resultEntriesModel.bulkUpsert([
      {
        registration_id: registrationId,
        source: 'waec',
        sitting: 1,
        serial: 0,
        subject: 'MATHEMATICS',
        grade: 'C5',
        grade_normalized: 'C',
        origin: 'ocr',
      },
    ]);
    const after = await pool.query(
      `SELECT grade, origin FROM jupeb_result_entries WHERE id = $1`,
      [entryId]
    );
    expect(after.rows[0].grade).toBe('A1');
    expect(after.rows[0].origin).toBe('manual');
  });

  it('non-staff student gets 403 on the institution endpoints', async () => {
    if (!resultEntriesMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken, registrationId } = await newClaimedRegistration(adminToken, 'NONSTAFF');

    // Strict mode required to ensure the student token is *not* admin-laundered.
    process.env.JUPEB_STUDENT_ROUTES_STRICT = 'true';
    try {
      const res = await request(app)
        .get(`/submission/institution/registrations/${registrationId}/result-entries`)
        .set('Authorization', `Bearer ${studentToken}`);
      // Either the middleware blocks (403) or the service throws 403; both acceptable.
      expect([401, 403]).toContain(res.status);
    } finally {
      delete process.env.JUPEB_STUDENT_ROUTES_STRICT;
    }
  });

  it('PATCH rejects invalid grade with 422', async () => {
    if (!resultEntriesMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { registrationId } = await newClaimedRegistration(adminToken, 'BAD');
    const ins = await pool.query(
      `INSERT INTO jupeb_result_entries
         (registration_id, source, sitting, serial, subject, grade, origin)
       VALUES ($1, 'waec', 1, 0, 'ENGLISH', 'B3', 'ocr')
       RETURNING id`,
      [registrationId]
    );
    const res = await request(app)
      .patch(`/submission/institution/result-entries/${ins.rows[0].id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grade: 'INVALID-LONG' });
    expect(res.status).toBe(422);
  });
});
