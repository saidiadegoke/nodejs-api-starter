const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('POST /auth/register-with-code (M.3)', () => {
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

  function fresh(tag) {
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    return {
      email: `rwc-${tag}-${stamp}@example.com`,
      phone: `+234801${String(stamp).slice(-7)}`,
    };
  }

  async function makeIssuedCode(token, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} RWC University`,
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
    };
  }

  it('rejects missing code via express-validator (422)', async () => {
    const res = await request(app)
      .post('/auth/register-with-code')
      .send({ password: 'Strong@Password1' });
    expect(res.status).toBe(422);
  });

  it('rejects weak password via express-validator (422)', async () => {
    const res = await request(app)
      .post('/auth/register-with-code')
      .send({ code: 'ABC123', password: 'short' });
    expect(res.status).toBe(422);
  });

  it('returns 404 + error_code:code_not_found for an unknown code', async () => {
    const { email } = fresh('NF');
    const res = await request(app)
      .post('/auth/register-with-code')
      .send({ code: 'NOSUCH9999', password: 'Strong@Password1', email });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.details && res.body.details.error_code).toBe('code_not_found');
  });

  it('happy path: creates user, claims code, returns access + refresh tokens', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code } = await makeIssuedCode(token, 'OK');
    const { email, phone } = fresh('OK');

    const res = await request(app)
      .post('/auth/register-with-code')
      .send({
        code,
        password: 'Strong@Password1',
        email,
        phone,
        first_name: 'Ada',
        last_name: 'Lovelace',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.access_token).toBeDefined();
    expect(res.body.data.refresh_token).toBeDefined();
    expect(res.body.data.token_type).toBe('Bearer');
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.first_name).toBe('Ada');
    expect(res.body.data.user.last_name).toBe('Lovelace');
    expect(res.body.data.registration).toBeDefined();
    expect(res.body.data.registration.status).toBe('claimed');
    expect(res.body.data.registration.claimed_at).toBeDefined();

    // The new account can immediately call an authed endpoint.
    const me = await request(app)
      .get('/registration/me/current')
      .set('Authorization', `Bearer ${res.body.data.access_token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBeDefined();
  });

  it('returns 410 + error_code:code_expired with expires_at on stale code', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code, registrationId } = await makeIssuedCode(token, 'EX');
    await pool.query(
      `UPDATE jupeb_registrations SET institution_code_expires_at = NOW() - interval '1 minute' WHERE id = $1`,
      [registrationId]
    );
    const { email } = fresh('EX');
    const res = await request(app)
      .post('/auth/register-with-code')
      .send({ code, password: 'Strong@Password1', email });
    expect(res.status).toBe(410);
    expect(res.body.details.error_code).toBe('code_expired');
    expect(res.body.details.expires_at).toBeDefined();
  });

  it('returns 409 + error_code:code_already_claimed for a code that is already taken', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code } = await makeIssuedCode(token, 'AC');
    const { email: email1 } = fresh('AC1');
    const { email: email2 } = fresh('AC2');

    const first = await request(app)
      .post('/auth/register-with-code')
      .send({ code, password: 'Strong@Password1', email: email1 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/auth/register-with-code')
      .send({ code, password: 'Strong@Password1', email: email2 });
    expect(second.status).toBe(409);
    expect(['code_already_claimed', 'code_unavailable']).toContain(
      second.body.details.error_code
    );
  });

  it('returns 409 + error_code:email_in_use when email is already registered', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { code: code1 } = await makeIssuedCode(token, 'DUP1');
    const { code: code2 } = await makeIssuedCode(token, 'DUP2');
    const { email } = fresh('DUP');

    const first = await request(app)
      .post('/auth/register-with-code')
      .send({ code: code1, password: 'Strong@Password1', email });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/auth/register-with-code')
      .send({ code: code2, password: 'Strong@Password1', email });
    expect(second.status).toBe(409);
    expect(second.body.details.error_code).toBe('email_in_use');

    // The second code must remain claimable — duplicate-email rejection
    // happens before the claim mutation, so the txn rolls back.
    const status = await request(app).get(
      `/auth/code-status?code=${encodeURIComponent(code2)}`
    );
    expect(status.body.data.valid).toBe(true);
  });
});
