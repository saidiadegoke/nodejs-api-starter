const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('GET /auth/code-status (M.9 — public, no auth)', () => {
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
          name: `${tag} CodeStatus University`,
          short_name: `${tag}CSU`,
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
      universityShortName: uniRes.body.data.short_name,
    };
  }

  it('rejects missing code with 400 + error_code:code_required', async () => {
    const res = await request(app).get('/auth/code-status');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.details && res.body.details.error_code).toBe('code_required');
  });

  it('returns valid:false error_code:code_not_found for an unknown code (no auth)', async () => {
    const res = await request(app).get('/auth/code-status?code=UNKNOWN1234');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.error_code).toBe('code_not_found');
  });

  it('returns valid:true with university metadata, requires NO auth header', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code, universityName } = await makeIssuedCode(token, 'PUB');

    // Note: NO Authorization header is sent.
    const res = await request(app).get(`/auth/code-status?code=${encodeURIComponent(code)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.university).toBeDefined();
    expect(res.body.data.university.name).toBe(universityName);
    expect(res.body.data.university.id).toBeDefined();
  });

  it('returns valid:false error_code:code_expired with expires_at when TTL passed', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code, registrationId } = await makeIssuedCode(token, 'PEX');
    await pool.query(
      `UPDATE jupeb_registrations SET institution_code_expires_at = NOW() - interval '1 minute' WHERE id = $1`,
      [registrationId]
    );
    const res = await request(app).get(`/auth/code-status?code=${encodeURIComponent(code)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.error_code).toBe('code_expired');
    expect(res.body.data.expires_at).toBeDefined();
  });

  it('returns valid:false error_code:code_already_claimed once a user has claimed it', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code } = await makeIssuedCode(token, 'PCL');
    // Use the existing authenticated claim path to mark it claimed.
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: code });

    const res = await request(app).get(`/auth/code-status?code=${encodeURIComponent(code)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.error_code).toBe('code_already_claimed');
  });

  it('returns an `account` block with masked identifiers when the code has been claimed via register-with-code', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code } = await makeIssuedCode(token, 'ACC');

    // Spin up a fresh student account via the public single-shot signup
    // — this is the realistic flow the mobile app will exercise.
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const email = `accblock-${stamp}@example.com`;
    const reg = await request(app)
      .post('/auth/register-with-code')
      .send({ code, password: 'Strong@Password1', email });
    expect(reg.status).toBe(201);

    const res = await request(app).get(`/auth/code-status?code=${encodeURIComponent(code)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
    expect(res.body.data.error_code).toBe('code_already_claimed');
    expect(res.body.data.university).toBeDefined();
    // Account block — the load-bearing addition for the mobile login flow.
    expect(res.body.data.account).toBeDefined();
    expect(res.body.data.account.exists).toBe(true);
    expect(res.body.data.account.active).toBe(true);
    expect(res.body.data.account.can_login).toBe(true);
    expect(res.body.data.account.email_masked).toMatch(/^\w{1,2}\*\*\*@/);
    // Raw email must never leak.
    expect(res.body.data.account.email_masked).not.toBe(email);
    expect(JSON.stringify(res.body.data)).not.toContain(email);
  });

  it('account.can_login flips to false when the account is suspended', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code } = await makeIssuedCode(token, 'SUS');

    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const email = `suspended-${stamp}@example.com`;
    const reg = await request(app)
      .post('/auth/register-with-code')
      .send({ code, password: 'Strong@Password1', email });
    expect(reg.status).toBe(201);

    // Suspend the new user
    const pool = require('../db/pool');
    await pool.query(
      `UPDATE users SET status = 'suspended' WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    const res = await request(app).get(`/auth/code-status?code=${encodeURIComponent(code)}`);
    expect(res.body.data.account.exists).toBe(true);
    expect(res.body.data.account.active).toBe(false);
    expect(res.body.data.account.can_login).toBe(false);
  });
});
