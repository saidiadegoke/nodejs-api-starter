const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
  buildCatalogUniversityPayload,
} = require('./jupeb-session-test-helpers');

describe('Registration Institution Admin Scoping', () => {
  let dbReady = false;
  const password = 'ScopeTestAdmin@12';
  const passwordHash = bcrypt.hashSync(password, 10);

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      dbReady = true;
    } catch {
      dbReady = false;
    }
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  function unique(tag) {
    return `${tag}_${Date.now().toString(36)}_${Math.floor(Math.random() * 9999)}`.toLowerCase();
  }

  function uniquePhone(prefix = '8') {
    const tail = String(process.hrtime.bigint()).slice(-9);
    return `+234${prefix}${tail}`;
  }

  it('newly created institution sees 0 candidates in overview/stats and registrations list', async () => {
    if (!dbReady) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffixA = unique('unia');
    const uniARes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        buildCatalogUniversityPayload(String(Date.now()).slice(-3), {
          name: `Existing Uni ${suffixA}`,
        })
      );
    expect(uniARes.status).toBe(201);
    const uniAId = uniARes.body.data.id;

    // Create session
    const { academicYear, yearShort, y1 } = nextJupebAcademicSession();
    const sessionRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
      });
    expect(sessionRes.status).toBe(201);
    const sessionId = sessionRes.body.data.id;

    // Create a subject combination
    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: nextJupebTestUniversityCode('SCA'),
        title: 'Scope Combo A',
        subjects: ['MAT', 'PHY', 'CHM'],
        is_global: true,
      });
    expect(scRes.status).toBe(201);
    const comboId = scRes.body.data.id;

    // Create candidate registration under University A
    const ninA = `11${String(Date.now()).slice(-9)}`;
    const ninVerifyARes = await pool.query(
      `INSERT INTO jupeb_nin_verifications (nin_hash, nin_last4, status, response_payload, intake_payload)
       VALUES ($1, $2, 'verified', '{"firstname":"Candidate","surname":"A"}'::jsonb, '{"name":"Candidate A"}'::jsonb)
       RETURNING id`,
      [ninA, ninA.slice(-4)]
    );
    const ninAVerifyId = ninVerifyARes.rows[0].id;

    const regARes = await pool.query(
      `INSERT INTO jupeb_registrations (session_id, university_id, subject_combination_id, nin_verification_id, status, provisional_candidate_code)
       VALUES ($1, $2, $3, $4, 'approved', '1000001')
       RETURNING id`,
      [sessionId, uniAId, comboId, ninAVerifyId]
    );
    const regAId = regARes.rows[0].id;

    // Now create University B (new institution) with an institution admin
    const suffixB = unique('unib');
    const instAdminEmail = `inst_admin_${suffixB}@example.com`;
    const instAdminPhone = uniquePhone('7');

    const uIns = await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active') RETURNING id`,
      [instAdminEmail, instAdminPhone, passwordHash]
    );
    const instAdminUserId = uIns.rows[0].id;

    const uniBRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        buildCatalogUniversityPayload(String(Date.now() + 1).slice(-3), {
          name: `New Empty Uni ${suffixB}`,
        })
      );
    expect(uniBRes.status).toBe(201);
    const uniBId = uniBRes.body.data.id;

    // Set profile and institution admin role for University B
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name, jupeb_university_id)
       VALUES ($1, 'New', 'Admin', 'New Admin', $2)`,
      [instAdminUserId, uniBId]
    );
    const roleRow = await pool.query(
      `SELECT id FROM roles WHERE name = 'institution_admin' LIMIT 1`
    );
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
      instAdminUserId,
      roleRow.rows[0].id,
    ]);
    await pool.query(
      `INSERT INTO user_universities (user_id, university_id, role, is_primary)
       VALUES ($1, $2, 'institution_admin', true)
       ON CONFLICT (user_id, university_id) DO NOTHING`,
      [instAdminUserId, uniBId]
    );

    // Log in as new institution admin
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ identifier: instAdminEmail, password });
    expect(loginRes.status).toBe(200);
    const instAdminToken = loginRes.body.data?.access_token;
    expect(instAdminToken).toBeDefined();

    // 1. GET /registration/institution/overview/stats (without university_id)
    const statsRes = await request(app)
      .get('/registration/institution/overview/stats')
      .set('Authorization', `Bearer ${instAdminToken}`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.success).toBe(true);
    // Newly created institution has 0 candidates!
    expect(statsRes.body.data.total).toBe(0);
    expect(statsRes.body.data.approved).toBe(0);
    expect(statsRes.body.data.pending).toBe(0);
    expect(statsRes.body.data.rejected).toBe(0);
    expect(statsRes.body.data.biometric).toBe(0);
    expect(statsRes.body.data.without_biometric).toBe(0);

    // 2. GET /registration/institution/registrations?page=1 (without university_id)
    const listRes = await request(app)
      .get('/registration/institution/registrations?page=1')
      .set('Authorization', `Bearer ${instAdminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.total).toBe(0);
    expect(listRes.body.data).toEqual([]);
    expect(listRes.body.rows).toEqual([]);

    // 3. Trying to access University A's stats or registrations returns 403 Forbidden
    const outOfScopeStats = await request(app)
      .get(`/registration/institution/overview/stats?university_id=${uniAId}`)
      .set('Authorization', `Bearer ${instAdminToken}`);
    expect(outOfScopeStats.status).toBe(403);

    const outOfScopeList = await request(app)
      .get(`/registration/institution/registrations?university_id=${uniAId}`)
      .set('Authorization', `Bearer ${instAdminToken}`);
    expect(outOfScopeList.status).toBe(403);

    const outOfScopeCandidate = await request(app)
      .get(`/registration/institution/registrations/${regAId}`)
      .set('Authorization', `Bearer ${instAdminToken}`);
    expect(outOfScopeCandidate.status).toBe(403);

    // Clean up
    await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [regAId]);
    await pool.query(`DELETE FROM jupeb_nin_verifications WHERE id = $1`, [ninAVerifyId]);
    await pool.query(`DELETE FROM user_universities WHERE user_id = $1`, [instAdminUserId]);
    await pool.query(`DELETE FROM user_roles WHERE user_id = $1`, [instAdminUserId]);
    await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [instAdminUserId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [instAdminUserId]);
  });
});
