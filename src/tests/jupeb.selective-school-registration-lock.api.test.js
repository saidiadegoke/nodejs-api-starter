const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const { nextJupebAcademicSession } = require('./jupeb-session-test-helpers');

const adminCredentials = {
  identifier: 'admin@example.com',
  password: 'Admin@12',
};

async function getAdminAccessToken() {
  const res = await request(app).post('/auth/login').send(adminCredentials);
  if (res.status !== 200 || !res.body.data?.access_token) return null;
  return res.body.data.access_token;
}

describe('JUPEB Selective School Registration Lock API', () => {
  let token;
  let sessionId;
  let universityA;
  let universityB;
  let subjectCombo;

  beforeAll(async () => {
    token = await getAdminAccessToken();
    expect(token).toBeTruthy();

    // Fetch two active universities
    const uniRes = await pool.query(
      `SELECT id, name, code, jupeb_prefix FROM jupeb_universities WHERE deleted_at IS NULL AND status = 'active' ORDER BY code ASC LIMIT 2`
    );
    if (uniRes.rows.length >= 2) {
      universityA = uniRes.rows[0];
      universityB = uniRes.rows[1];
    } else {
      // Create if needed
      const ins1 = await pool.query(
        `INSERT INTO jupeb_universities (name, code, jupeb_prefix, status)
         VALUES ('Test Uni Lock A', 'TULA', '911', 'active') RETURNING id, name, code, jupeb_prefix`
      );
      const ins2 = await pool.query(
        `INSERT INTO jupeb_universities (name, code, jupeb_prefix, status)
         VALUES ('Test Uni Lock B', 'TULB', '912', 'active') RETURNING id, name, code, jupeb_prefix`
      );
      universityA = ins1.rows[0];
      universityB = ins2.rows[0];
    }

    // Get a valid subject combination for universityA
    const comboRes = await pool.query(
      `SELECT id FROM jupeb_subject_combinations WHERE deleted_at IS NULL LIMIT 1`
    );
    if (comboRes.rows.length) {
      subjectCombo = comboRes.rows[0];
      // Ensure university combination link exists
      await pool.query(
        `INSERT INTO jupeb_university_combinations (university_id, subject_combination_id)
         VALUES ($1, $2), ($3, $2)
         ON CONFLICT DO NOTHING`,
        [universityA.id, subjectCombo.id, universityB.id]
      );
    }

    // Create an open session
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    token = await getAdminAccessToken();
    const createRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(Date.now() - 3600000).toISOString(),
        closes_at: new Date(Date.now() + 86400000 * 30).toISOString(),
      });
    expect(createRes.status).toBe(201);
    sessionId = createRes.body.data.id;
  });

  afterAll(async () => {
    if (sessionId) {
      await pool.query(`DELETE FROM jupeb_session_university_locks WHERE session_id = $1`, [sessionId]);
      await pool.query(`DELETE FROM jupeb_registration_sessions WHERE id = $1`, [sessionId]);
    }
  });

  it('admin can lock registration for a specific school (university_id)', async () => {
    const res = await request(app)
      .patch(`/sessions/${sessionId}/registration-lock`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        locked: true,
        university_id: universityA.id,
        reason: 'Outstanding payment reconciliation',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.locked).toBe(true);
    expect(res.body.data.university_ids).toContain(universityA.id);
    expect(res.body.data.reason).toBe('Outstanding payment reconciliation');
  });

  it('GET /sessions/:id/university-locks lists lock status for universities', async () => {
    const res = await request(app)
      .get(`/sessions/${sessionId}/university-locks?limit=100`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const lockedUni = res.body.data.find((u) => u.university_id === universityA.id);
    expect(lockedUni).toBeDefined();
    expect(lockedUni.locked).toBe(true);
    expect(lockedUni.reason).toBe('Outstanding payment reconciliation');

    const resB = await request(app)
      .get(`/sessions/${sessionId}/university-locks?q=${encodeURIComponent(universityB.code)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(resB.status).toBe(200);
    const unlockedUni = resB.body.data.find((u) => u.university_id === universityB.id);
    expect(unlockedUni).toBeDefined();
    expect(unlockedUni.locked).toBe(false);
  });

  it('GET /sessions/:id/university-locks?locked=true filters for only locked schools', async () => {
    const res = await request(app)
      .get(`/sessions/${sessionId}/university-locks?locked=true`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((u) => u.locked === true)).toBe(true);
    expect(res.body.data.some((u) => u.university_id === universityA.id)).toBe(true);
  });

  it('registration fails with 423 for the locked school', async () => {
    if (!subjectCombo) return;

    const res = await request(app)
      .post('/registration')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        university_id: universityA.id,
        subject_combination_id: subjectCombo.id,
        first_name: 'LockedCandidate',
        surname: 'Test',
        date_of_birth: '2005-01-01',
        gender: 'male',
        email: `locked.candidate.${Date.now()}@example.com`,
        phone: '08012345678',
        state_of_origin: 'Lagos',
      });

    expect(res.status).toBe(423);
    expect(res.body.message).toMatch(/Registration is locked for this institution/i);
  });

  it('registration succeeds for an unlocked school in the same session', async () => {
    if (!subjectCombo) return;

    const res = await request(app)
      .post('/registration')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        university_id: universityB.id,
        subject_combination_id: subjectCombo.id,
        first_name: 'UnlockedCandidate',
        surname: 'Test',
        date_of_birth: '2005-01-01',
        gender: 'female',
        email: `unlocked.candidate.${Date.now()}@example.com`,
        phone: '08098765432',
        state_of_origin: 'Ogun',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('admin can lock multiple select universities at once (university_ids)', async () => {
    const res = await request(app)
      .put(`/sessions/${sessionId}/university-locks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        locked: true,
        university_ids: [universityA.id, universityB.id],
        reason: 'Annual audit review',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.university_ids).toEqual(expect.arrayContaining([universityA.id, universityB.id]));

    // Now universityB should also fail registration
    if (subjectCombo) {
      const regRes = await request(app)
        .post('/registration')
        .set('Authorization', `Bearer ${token}`)
        .send({
          session_id: sessionId,
          university_id: universityB.id,
          subject_combination_id: subjectCombo.id,
          first_name: 'AnotherCandidate',
          surname: 'Test',
          date_of_birth: '2005-01-01',
          gender: 'female',
          email: `another.${Date.now()}@example.com`,
          phone: '08098765432',
          state_of_origin: 'Ogun',
        });

      expect(regRes.status).toBe(423);
      expect(regRes.body.message).toMatch(/Registration is locked for this institution/i);
    }
  });

  it('admin can unlock select schools (locked: false)', async () => {
    const res = await request(app)
      .patch(`/sessions/${sessionId}/registration-lock`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        locked: false,
        university_id: universityA.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.locked).toBe(false);

    // Registration for universityA should now succeed
    if (subjectCombo) {
      const regRes = await request(app)
        .post('/registration')
        .set('Authorization', `Bearer ${token}`)
        .send({
          session_id: sessionId,
          university_id: universityA.id,
          subject_combination_id: subjectCombo.id,
          first_name: 'UnlockedAgain',
          surname: 'Test',
          date_of_birth: '2005-01-01',
          gender: 'male',
          email: `unlocked.again.${Date.now()}@example.com`,
          phone: '08011223344',
          state_of_origin: 'Lagos',
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body.success).toBe(true);
    }
  });

  it('bulk registration fails with 423 when university is locked', async () => {
    // Re-lock universityA
    await request(app)
      .patch(`/sessions/${sessionId}/registration-lock`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        locked: true,
        university_id: universityA.id,
        reason: 'Bulk upload block test',
      });

    const csvContent = Buffer.from(
      'first_name,surname,other_names,date_of_birth,gender,phone,email,state_of_origin,subject_combination_code\n' +
      'John,Doe,K,2005-01-01,male,08012345678,john.bulk@example.com,Lagos,PHY-CHE-BIO\n'
    );

    const res = await request(app)
      .post('/registration/institution/registrations/bulk-upload')
      .set('Authorization', `Bearer ${token}`)
      .field('session_id', sessionId)
      .field('university_id', universityA.id)
      .attach('file', csvContent, 'candidates.csv');

    expect(res.status).toBe(423);
    expect(res.body.message).toMatch(/Registration is locked for this institution/i);
  });

  it('records audit log for institution registration lock actions', async () => {
    const auditRes = await pool.query(
      `SELECT action, resource_id, details FROM admin_audit_logs
       WHERE action IN ('session.institution_registration_lock', 'session.institution_registration_unlock')
         AND resource_id = $1
       ORDER BY created_at DESC LIMIT 2`,
      [sessionId]
    );

    expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    expect(['session.institution_registration_lock', 'session.institution_registration_unlock']).toContain(
      auditRes.rows[0].action
    );
  });
});
