const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('jupeb_result_entries (M.7 + M.8)', () => {
  let resultEntriesMigrated = false;
  let registrationMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_result_entries LIMIT 1');
      resultEntriesMigrated = true;
    } catch {
      resultEntriesMigrated = false;
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
          name: `${tag} ResEntries University`,
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
        email: `re-${tag.toLowerCase()}-${stamp}@example.com`,
      });
    return {
      studentToken: reg.body.data.access_token,
      registrationId: reg.body.data.registration.id,
    };
  }

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/submission/me/result-entries');
    expect(res.status).toBe(401);
  });

  it('GET returns empty list initially', async () => {
    if (!resultEntriesMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken, registrationId } = await newClaimedRegistration(adminToken, 'EMP');

    const res = await request(app)
      .get('/submission/me/result-entries')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.registration_id).toBe(registrationId);
    expect(Array.isArray(res.body.data.entries)).toBe(true);
    expect(res.body.data.entries.length).toBe(0);
  });

  it('POST bulk-upserts entries with grade normalization', async () => {
    if (!resultEntriesMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'BULK');

    const res = await request(app)
      .post('/submission/me/result-entries')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        entries: [
          { source: 'waec', sitting: 1, serial: 0, subject: 'English Language', grade: 'B3' },
          { source: 'waec', sitting: 1, serial: 1, subject: 'Mathematics',     grade: 'A1' },
          { source: 'waec', sitting: 1, serial: 2, subject: 'Physics',         grade: 'C5', score: 65 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.upserted_count).toBe(3);
    const eng = res.body.data.entries.find((e) => e.subject === 'ENGLISH LANGUAGE');
    expect(eng.grade_normalized).toBe('B');
    const math = res.body.data.entries.find((e) => e.subject === 'MATHEMATICS');
    expect(math.grade_normalized).toBe('A');
    const phys = res.body.data.entries.find((e) => e.subject === 'PHYSICS');
    expect(phys.grade_normalized).toBe('C');
    expect(phys.score).toBe(65);
    expect(res.body.data.entries.every((e) => e.origin === 'manual')).toBe(true);

    const get = await request(app)
      .get('/submission/me/result-entries')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(get.body.data.entries.length).toBe(3);
  });

  it('rejects invalid payload (422 with errors[])', async () => {
    if (!resultEntriesMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'BAD');

    const res = await request(app)
      .post('/submission/me/result-entries')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        entries: [
          { source: 'pet', sitting: 7, serial: 0, subject: '', grade: 'XYZ', score: 200 },
        ],
      });
    expect(res.status).toBe(422);
    const codes = (res.body.details && res.body.details.errors || []).map((e) => e.error_code);
    expect(codes).toEqual(expect.arrayContaining(['source_invalid', 'sitting_invalid', 'subject_required', 'grade_invalid', 'score_invalid']));
  });

  it('manual upsert overrides an OCR-origin row at the same key', async () => {
    if (!resultEntriesMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken, registrationId } = await newClaimedRegistration(adminToken, 'OVR');

    // Seed an OCR-origin row directly so we don't depend on the async OCR worker.
    await pool.query(
      `INSERT INTO jupeb_result_entries
         (registration_id, source, sitting, serial, subject, grade, grade_normalized, origin)
       VALUES ($1, 'waec', 1, 0, 'ENGLISH LANGUAGE', 'B3', 'B', 'ocr')`,
      [registrationId]
    );

    const res = await request(app)
      .post('/submission/me/result-entries')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        entries: [
          { source: 'waec', sitting: 1, serial: 0, subject: 'English Language', grade: 'A1' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.entries[0].grade).toBe('A1');
    expect(res.body.data.entries[0].grade_normalized).toBe('A');
    expect(res.body.data.entries[0].origin).toBe('manual');
  });

  it('OCR-origin upsert does NOT overwrite a manual row at the same key (manual wins)', async () => {
    if (!resultEntriesMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken, registrationId } = await newClaimedRegistration(adminToken, 'WIN');

    // Manual entry first
    await request(app)
      .post('/submission/me/result-entries')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        entries: [
          { source: 'waec', sitting: 1, serial: 0, subject: 'Math', grade: 'A1' },
        ],
      });

    // Simulate OCR write-through at the same key with a different grade
    const resultEntriesModel = require('../modules/jupeb/models/result-entries.model');
    await resultEntriesModel.bulkUpsert([
      {
        registration_id: registrationId,
        source: 'waec',
        sitting: 1,
        serial: 0,
        subject: 'MATHEMATICS',
        grade: 'C6',
        grade_normalized: 'C',
        origin: 'ocr',
        ocr_job_id: null,
      },
    ]);

    const get = await request(app)
      .get('/submission/me/result-entries')
      .set('Authorization', `Bearer ${studentToken}`);
    const row = get.body.data.entries.find((e) => e.serial === 0 && e.source === 'waec');
    expect(row.grade).toBe('A1');
    expect(row.origin).toBe('manual');
  });

  it('result entries appear on the submission preview, grouped by (source, sitting)', async () => {
    if (!resultEntriesMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'PREV');

    await request(app)
      .post('/submission/me/result-entries')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        entries: [
          { source: 'waec', sitting: 1, serial: 0, subject: 'English', grade: 'B3' },
          { source: 'waec', sitting: 1, serial: 1, subject: 'Math',    grade: 'A1' },
          { source: 'neco', sitting: 2, serial: 0, subject: 'Biology', grade: 'C4' },
        ],
      });

    const res = await request(app)
      .get('/registration/me/submission-preview')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.academic_details)).toBe(true);
    const waec1 = res.body.data.academic_details.find(
      (g) => g.source === 'waec' && g.sitting === 1
    );
    expect(waec1).toBeDefined();
    expect(waec1.subjects.length).toBe(2);
    expect(waec1.subjects.map((s) => s.subject)).toEqual(['ENGLISH', 'MATH']);
    const neco2 = res.body.data.academic_details.find(
      (g) => g.source === 'neco' && g.sitting === 2
    );
    expect(neco2).toBeDefined();
    expect(neco2.subjects[0].subject).toBe('BIOLOGY');
  });
});
