const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('GET /registration/me/code-status', () => {
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

  async function makeIssuedCode(token, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} CodeStatus Uni`,
          jupeb_prefix: nextJupebTestPrefix(),
        });
      if (uniRes.status === 201) break;
    }
    let scRes;
    for (let i = 0; i < 5; i += 1) {
      scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: nextJupebTestUniversityCode(`${tag}SC`),
          title: `${tag} Combo`,
          subjects: ['A', 'B', 'C'],
          is_global: true,
        });
      if (scRes.status === 201) break;
    }
    let sessRes;
    for (let i = 0; i < 5; i += 1) {
      const { y1, academicYear, yearShort } = nextJupebAcademicSession();
      sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          academic_year: academicYear,
          year_short: yearShort,
          opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
          closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        });
      if (sessRes.status === 201) break;
    }
    await closeAllOpenJupebSessions(token);
    await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${token}`);
    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessRes.body.data.id,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    return {
      registrationId: createReg.body.data.id,
      code: createReg.body.data.institution_issued_code,
      universityName: uniRes.body.data.name,
    };
  }

  it('returns valid:true with university_name for a fresh code (no mutation)', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code, universityName } = await makeIssuedCode(token, 'CSV');

    const first = await request(app)
      .get(`/registration/me/code-status?code=${encodeURIComponent(code)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.data.valid).toBe(true);
    expect(first.body.data.university_name).toBe(universityName);

    // No mutation: a second GET still says valid; and the code is still claimable.
    const second = await request(app)
      .get(`/registration/me/code-status?code=${encodeURIComponent(code)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.body.data.valid).toBe(true);

    const claim = await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: code });
    expect(claim.status).toBe(200);
    expect(claim.body.data.status).toBe('claimed');
  });

  it('returns valid:false error_code:code_not_found for an unknown code', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const res = await request(app)
      .get('/registration/me/code-status?code=ZZZZZZ')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.error_code).toBe('code_not_found');
  });

  it('returns valid:false error_code:code_expired with expires_at when TTL has passed', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code, registrationId } = await makeIssuedCode(token, 'CSE');
    await pool.query(
      `UPDATE jupeb_registrations SET institution_code_expires_at = NOW() - interval '1 minute' WHERE id = $1`,
      [registrationId]
    );
    const res = await request(app)
      .get(`/registration/me/code-status?code=${encodeURIComponent(code)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.error_code).toBe('code_expired');
    expect(res.body.data.expires_at).toBeDefined();
  });

  it('POST /registration/me/claim-code on expired code returns 410 with structured body', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code, registrationId } = await makeIssuedCode(token, 'CSX');
    await pool.query(
      `UPDATE jupeb_registrations SET institution_code_expires_at = NOW() - interval '1 minute' WHERE id = $1`,
      [registrationId]
    );
    const res = await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: code });
    expect(res.status).toBe(410);
    expect(res.body.success).toBe(false);
    expect(res.body.details).toBeDefined();
    expect(res.body.details.error_code).toBe('code_expired');
    expect(res.body.details.expires_at).toBeDefined();
  });
});
