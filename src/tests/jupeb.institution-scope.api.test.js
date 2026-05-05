const crypto = require('crypto');
const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('JUPEB institution scope API', () => {
  let scopeMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT jupeb_university_id FROM profiles LIMIT 1');
      scopeMigrated = true;
    } catch {
      scopeMigrated = false;
      // eslint-disable-next-line no-console
      console.warn('[jupeb.institution-scope.api] Skipping: apply migration `009_jupeb_enhancements.sql`.');
    }
  });

  const adminCredentials = {
    identifier: 'admin@example.com',
    password: 'Admin@12',
  };

  async function getAdminToken() {
    const res = await request(app).post('/auth/login').send(adminCredentials);
    if (res.status !== 200 || !res.body.data?.access_token) return null;
    return res.body.data.access_token;
  }

  it('PATCH /admin/users/:userId/jupeb-university returns 401 without auth', async () => {
    if (!scopeMigrated) return;
    const res = await request(app)
      .patch(`/admin/users/${crypto.randomUUID()}/jupeb-university`)
      .send({ jupeb_university_id: null });
    expect(res.status).toBe(401);
  });

  it('PATCH jupeb-university returns 403 for non-admin (student)', async () => {
    if (!scopeMigrated) return;
    const st = await request(app)
      .post('/auth/login')
      .send({ identifier: 'student@example.com', password: 'Student@12' });
    if (st.status !== 200) return;
    const res = await request(app)
      .patch(`/admin/users/${crypto.randomUUID()}/jupeb-university`)
      .set('Authorization', `Bearer ${st.body.data.access_token}`)
      .send({ jupeb_university_id: null });
    expect(res.status).toBe(403);
  });

  it('PATCH jupeb-university returns 422 when jupeb_university_id omitted', async () => {
    if (!scopeMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const res = await request(app)
      .patch(`/admin/users/${crypto.randomUUID()}/jupeb-university`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
  });

  it('admin can set and clear profiles.jupeb_university_id for a user', async () => {
    if (!scopeMigrated) return;
    const token = await getAdminToken();
    if (!token) return;

    const suffix = Date.now();
    const hash = '$2a$10$blUvzJlgCbWl5uaKCWCMSOK.ECArvoly4FuRu5KeMrtw92raxgUbO';
    const email = `scope_tgt_${suffix}@example.com`;
    const uIns = await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active') RETURNING id`,
      [email, `+2347${String(suffix).slice(-9)}`, hash]
    );
    const targetId = uIns.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name) VALUES ($1, 'T', 'G', 'Target')`,
      [targetId]
    );

    const prefix = nextJupebTestPrefix();
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('ISU'),
        name: `Scope Uni ${suffix}`,
        jupeb_prefix: prefix,
      });
    expect(uniRes.status).toBe(201);
    const uniId = uniRes.body.data.id;

    const setRes = await request(app)
      .patch(`/admin/users/${targetId}/jupeb-university`)
      .set('Authorization', `Bearer ${token}`)
      .send({ jupeb_university_id: uniId });
    expect(setRes.status).toBe(200);
    expect(setRes.body.data.jupeb_university_id).toBe(uniId);

    const row = await pool.query(`SELECT jupeb_university_id FROM profiles WHERE user_id = $1`, [targetId]);
    expect(row.rows[0].jupeb_university_id).toBe(uniId);

    const clearRes = await request(app)
      .patch(`/admin/users/${targetId}/jupeb-university`)
      .set('Authorization', `Bearer ${token}`)
      .send({ jupeb_university_id: null });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.data.jupeb_university_id).toBeNull();

    await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [targetId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [targetId]);
  });
});

describe('JUPEB registration RBAC negatives', () => {
  let registrationMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registration_status_history LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
    }
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
  });

  async function getAdminToken() {
    const res = await request(app).post('/auth/login').send({ identifier: 'admin@example.com', password: 'Admin@12' });
    if (res.status !== 200 || !res.body.data?.access_token) return null;
    return res.body.data.access_token;
  }

  it('user with only plain "user" role cannot institution-approve', async () => {
    if (!registrationMigrated) return;
    const adminT = await getAdminToken();
    if (!adminT) return;

    const suffix = Date.now();
    const plainEmail = `plainonly_${suffix}@example.com`;
    const plainHash = '$2a$10$blUvzJlgCbWl5uaKCWCMSOK.ECArvoly4FuRu5KeMrtw92raxgUbO';
    const uIns = await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active') RETURNING id`,
      [plainEmail, `+2346${String(suffix).slice(-9)}`, plainHash]
    );
    const plainId = uIns.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name) VALUES ($1, 'Plain', 'User', 'Plain')`,
      [plainId]
    );
    const roleUser = await pool.query(`SELECT id FROM roles WHERE name = 'user' LIMIT 1`);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [plainId, roleUser.rows[0].id]);

    const prefix = nextJupebTestPrefix();
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${adminT}`)
      .send({
        code: nextJupebTestUniversityCode('RBU'),
        name: `RBAC Uni ${suffix}`,
        jupeb_prefix: prefix,
      });
    expect(uniRes.status).toBe(201);
    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${adminT}`)
      .send({
        code: nextJupebTestUniversityCode('RBS'),
        title: 'RBAC Combo',
        subjects: ['A', 'B', 'C'],
        is_global: true,
      });
    expect(scRes.status).toBe(201);
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const sessRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${adminT}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
      });
    expect(sessRes.status).toBe(201);
    await closeAllOpenJupebSessions(adminT);
    await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${adminT}`);

    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminT}`)
      .send({
        session_id: sessRes.body.data.id,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    expect(createReg.status).toBe(201);
    const registrationId = createReg.body.data.id;

    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${adminT}`)
      .send({ institution_issued_code: createReg.body.data.institution_issued_code });
    await request(app).post('/registration/me/confirm-subjects').set('Authorization', `Bearer ${adminT}`).send({});
    await request(app).post('/registration/me/submit').set('Authorization', `Bearer ${adminT}`).send({});

    const plainLogin = await request(app).post('/auth/login').send({ identifier: plainEmail, password: 'Student@12' });
    expect(plainLogin.status).toBe(200);
    const plainToken = plainLogin.body.data.access_token;

    const bad = await request(app)
      .post(`/registration/institution/registrations/${registrationId}/approve`)
      .set('Authorization', `Bearer ${plainToken}`)
      .send({});
    expect(bad.status).toBe(403);

    await pool.query(`DELETE FROM user_roles WHERE user_id = $1`, [plainId]);
    await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [plainId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [plainId]);
  });
});
