const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('Institution registrations — list / stats / by-university / export (013 §E.1-E.6)', () => {
  let registrationMigrated = false;

  beforeAll(async () => {
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

  async function makeUniversity(adminToken, tag) {
    let res;
    // jupeb_prefix space is only 100..999 with a global unique index, and
    // test DBs accumulate rows across runs — retry generously.
    for (let i = 0; i < 30; i += 1) {
      res = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} List University`,
          short_name: `${tag}LU`,
          jupeb_prefix: nextJupebTestPrefix(),
        });
      if (res.status === 201) return res.body.data;
    }
    throw new Error(`Could not create university: ${res && res.status}`);
  }

  async function makeSubjectCombination(adminToken, tag) {
    let res;
    for (let i = 0; i < 5; i += 1) {
      res = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(`${tag}SC`),
          title: `${tag} Combo`,
          subjects: ['Math', 'Phys', 'Chem'],
          is_global: true,
        });
      if (res.status === 201) return res.body.data;
    }
    throw new Error(`Could not create combo: ${res && res.status}`);
  }

  async function makeOpenSession(adminToken) {
    let res;
    for (let i = 0; i < 5; i += 1) {
      const { y1, academicYear, yearShort } = nextJupebAcademicSession();
      res = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          academic_year: academicYear,
          year_short: yearShort,
          opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
          closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        });
      if (res.status === 201) break;
    }
    await closeAllOpenJupebSessions(adminToken);
    await request(app).post(`/sessions/${res.body.data.id}/open`).set('Authorization', `Bearer ${adminToken}`);
    return res.body.data;
  }

  async function createRegistrationWithStudent(adminToken, { universityId, sessionId, comboId, tag }) {
    const created = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessionId,
        university_id: universityId,
        subject_combination_id: comboId,
      });
    expect(created.status).toBe(201);
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const reg = await request(app)
      .post('/auth/complete-registration')
      .send({
        code: created.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: `inst-${tag.toLowerCase()}-${stamp}@example.com`,
        first_name: tag,
        last_name: 'Tester',
      });
    expect(reg.status).toBe(201);
    return {
      registrationId: reg.body.data.registration.id,
      studentEmail: `inst-${tag.toLowerCase()}-${stamp}@example.com`,
    };
  }

  it('GET /institution/registrations enriches rows with candidate + university + biometric_status', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const uni = await makeUniversity(adminToken, 'JOIN');
    const combo = await makeSubjectCombination(adminToken, 'JOIN');
    const session = await makeOpenSession(adminToken);
    const { registrationId, studentEmail } = await createRegistrationWithStudent(
      adminToken,
      { universityId: uni.id, sessionId: session.id, comboId: combo.id, tag: 'Ada' }
    );

    // Add a single 'face' biometric so biometric_status is 'partial'.
    await pool.query(
      `INSERT INTO jupeb_biometric_captures (registration_id, capture_type, external_reference, captured_at)
       VALUES ($1, 'face', 'demo://test-face', NOW())`,
      [registrationId]
    );

    const res = await request(app)
      .get(`/registration/institution/registrations?university_id=${uni.id}&session_id=${session.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.data.find((r) => r.id === registrationId);
    expect(row).toBeDefined();
    expect(row.candidate).toBeDefined();
    expect(row.candidate.email).toBe(studentEmail);
    expect(row.candidate.name).toMatch(/Ada/);
    expect(row.university).toBeDefined();
    expect(row.university.name).toBe(uni.name);
    expect(row.biometric_status).toBe('partial');
  });

  it('?q=ada finds candidates by name (E.2)', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const uni = await makeUniversity(adminToken, 'SRCH');
    const combo = await makeSubjectCombination(adminToken, 'SRCH');
    const session = await makeOpenSession(adminToken);
    const { registrationId } = await createRegistrationWithStudent(
      adminToken,
      { universityId: uni.id, sessionId: session.id, comboId: combo.id, tag: 'Adaeze' }
    );

    const res = await request(app)
      .get(`/registration/institution/registrations?university_id=${uni.id}&session_id=${session.id}&q=ada`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((r) => r.id === registrationId)).toBe(true);

    const noMatch = await request(app)
      .get(`/registration/institution/registrations?university_id=${uni.id}&session_id=${session.id}&q=nonexistentname`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(noMatch.body.data.find((r) => r.id === registrationId)).toBeUndefined();
  });

  it('?bucket=pending matches all pending statuses (E.3)', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const uni = await makeUniversity(adminToken, 'BKT');
    const combo = await makeSubjectCombination(adminToken, 'BKT');
    const session = await makeOpenSession(adminToken);
    const { registrationId: r1 } = await createRegistrationWithStudent(
      adminToken,
      { universityId: uni.id, sessionId: session.id, comboId: combo.id, tag: 'PendOne' }
    );
    const { registrationId: r2 } = await createRegistrationWithStudent(
      adminToken,
      { universityId: uni.id, sessionId: session.id, comboId: combo.id, tag: 'PendTwo' }
    );
    // Set them to two different pending statuses
    await pool.query(`UPDATE jupeb_registrations SET status = 'pending_documents' WHERE id = $1`, [r1]);
    await pool.query(`UPDATE jupeb_registrations SET status = 'pending_institution_review' WHERE id = $1`, [r2]);

    const res = await request(app)
      .get(`/registration/institution/registrations?university_id=${uni.id}&session_id=${session.id}&bucket=pending`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([r1, r2]));

    const approvedOnly = await request(app)
      .get(`/registration/institution/registrations?university_id=${uni.id}&session_id=${session.id}&bucket=approved`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approvedOnly.body.data.some((r) => r.id === r1)).toBe(false);
  });

  it('GET /institution/overview/stats returns approved / pending / rejected / with_biometrics counts (E.4)', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const uni = await makeUniversity(adminToken, 'STAT');
    const combo = await makeSubjectCombination(adminToken, 'STAT');
    const session = await makeOpenSession(adminToken);
    const { registrationId: a } = await createRegistrationWithStudent(adminToken, { universityId: uni.id, sessionId: session.id, comboId: combo.id, tag: 'A' });
    const { registrationId: b } = await createRegistrationWithStudent(adminToken, { universityId: uni.id, sessionId: session.id, comboId: combo.id, tag: 'B' });
    const { registrationId: c } = await createRegistrationWithStudent(adminToken, { universityId: uni.id, sessionId: session.id, comboId: combo.id, tag: 'C' });
    await pool.query(`UPDATE jupeb_registrations SET status = 'approved' WHERE id = $1`, [a]);
    await pool.query(`UPDATE jupeb_registrations SET status = 'rejected' WHERE id = $1`, [b]);
    await pool.query(`UPDATE jupeb_registrations SET status = 'pending_institution_review' WHERE id = $1`, [c]);
    await pool.query(`INSERT INTO jupeb_biometric_captures (registration_id, capture_type, external_reference, captured_at) VALUES ($1, 'face', 'demo://stat', NOW())`, [a]);

    const res = await request(app)
      .get(`/registration/institution/overview/stats?university_id=${uni.id}&session_id=${session.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(3);
    expect(res.body.data.approved).toBeGreaterThanOrEqual(1);
    expect(res.body.data.rejected).toBeGreaterThanOrEqual(1);
    expect(res.body.data.pending).toBeGreaterThanOrEqual(1);
    expect(res.body.data.with_biometrics).toBeGreaterThanOrEqual(1);
  });

  it('GET /institution/overview/by-university returns top-N by registered_count (E.5)', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const uni = await makeUniversity(adminToken, 'CHRT');
    const combo = await makeSubjectCombination(adminToken, 'CHRT');
    const session = await makeOpenSession(adminToken);
    await createRegistrationWithStudent(adminToken, { universityId: uni.id, sessionId: session.id, comboId: combo.id, tag: 'C1' });
    await createRegistrationWithStudent(adminToken, { universityId: uni.id, sessionId: session.id, comboId: combo.id, tag: 'C2' });

    const res = await request(app)
      .get(`/registration/institution/overview/by-university?session_id=${session.id}&limit=12`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const ours = res.body.data.find((r) => r.university_id === uni.id);
    expect(ours).toBeDefined();
    expect(ours.registered_count).toBeGreaterThanOrEqual(2);
    expect(ours.university_name).toBe(uni.name);
  });

  it('GET /institution/registrations/export streams CSV honoring filters (E.6)', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const uni = await makeUniversity(adminToken, 'CSV');
    const combo = await makeSubjectCombination(adminToken, 'CSV');
    const session = await makeOpenSession(adminToken);
    await createRegistrationWithStudent(adminToken, { universityId: uni.id, sessionId: session.id, comboId: combo.id, tag: 'Csv' });

    const res = await request(app)
      .get(`/registration/institution/registrations/export?university_id=${uni.id}&session_id=${session.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];
        response.on('data', (c) => chunks.push(c));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/candidates-/);
    const csv = res.body.toString('utf8');
    expect(csv.split('\n')[0]).toBe(
      'candidate_id,name,email,university,subject_combination,sittings_count,status,biometric_status,institution_issued_code,jupeb_candidate_number,provisional_candidate_code,created_at,submitted_at,approved_at'
    );
    expect(csv).toMatch(uni.name);
  });
});
