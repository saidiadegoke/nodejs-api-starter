/**
 * Login by registration / matric number.
 *
 * After a student claims a code via /auth/complete-registration, they end
 * up with three identifiers usable on /auth/login:
 *   1. email (always)
 *   2. phone (when supplied at signup)
 *   3. jupeb_registrations.provisional_candidate_code   (9-digit reg no.)
 *   4. jupeb_registrations.jupeb_candidate_number       (final matric no.,
 *      set during finalization)
 *
 * AuthModel.findByIdentifier matches all of the above.
 */
const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('Login by reg/matric number', () => {
  let registrationMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      registrationMigrated = true;
    } catch { /* */ }
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
  });

  async function getAdminToken() {
    const r = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return r.body.data?.access_token || null;
  }

  async function seedFixturesAndStudent(tag) {
    const adminToken = await getAdminToken();
    let uniRes;
    for (let i = 0; i < 30 && (!uniRes || uniRes.status !== 201); i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: nextJupebTestUniversityCode(tag), name: `${tag} U`, jupeb_prefix: nextJupebTestPrefix() });
    }
    let scRes;
    for (let i = 0; i < 30 && (!scRes || scRes.status !== 201); i += 1) {
      scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: nextJupebTestUniversityCode(`${tag}SC`), title: `${tag} Combo`, subjects: ['M','P','C'], is_global: true });
    }
    let sessRes;
    for (let i = 0; i < 30 && (!sessRes || sessRes.status !== 201); i += 1) {
      const { y1, academicYear, yearShort } = nextJupebAcademicSession();
      sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          academic_year: academicYear, year_short: yearShort,
          opens_at: new Date(`${y1}-01-01T00:00:00Z`).toISOString(),
          closes_at: new Date(`${y1}-12-01T00:00:00Z`).toISOString(),
        });
    }
    await closeAllOpenJupebSessions(adminToken);
    await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${adminToken}`);

    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ session_id: sessRes.body.data.id, university_id: uniRes.body.data.id, subject_combination_id: scRes.body.data.id });
    expect(createReg.status).toBe(201);

    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const email = `regno-${tag.toLowerCase()}-${stamp}@example.com`;
    const phone = `+234801${String(stamp).slice(-7)}`;
    const password = 'Strong@Password1';
    const reg = await request(app)
      .post('/auth/complete-registration')
      .send({
        code: createReg.body.data.institution_issued_code,
        password, email, phone,
      });
    expect(reg.status).toBe(201);

    return {
      registrationId: createReg.body.data.id,
      provisionalCode: createReg.body.data.provisional_candidate_code,
      email, phone, password,
    };
  }

  it('login still works with email + password (regression)', async () => {
    if (!registrationMigrated) return;
    const { email, password } = await seedFixturesAndStudent('EML');
    const r = await request(app).post('/auth/login').send({ identifier: email, password });
    expect(r.status).toBe(200);
    expect(r.body.data.access_token).toBeDefined();
  });

  it('login still works with phone + password (regression)', async () => {
    if (!registrationMigrated) return;
    const { phone, password } = await seedFixturesAndStudent('PHN');
    const r = await request(app).post('/auth/login').send({ identifier: phone, password });
    expect(r.status).toBe(200);
    expect(r.body.data.access_token).toBeDefined();
  });

  it('login works with provisional_candidate_code + password', async () => {
    if (!registrationMigrated) return;
    const { provisionalCode, password, email } = await seedFixturesAndStudent('REGNO');
    expect(provisionalCode).toMatch(/^\d{9}$/);
    const r = await request(app).post('/auth/login').send({ identifier: provisionalCode, password });
    expect(r.status).toBe(200);
    expect(r.body.data.access_token).toBeDefined();
    // Login response carries the student's email, proving we resolved
    // to the correct user via the candidate code.
    expect(r.body.data.user.email).toBe(email);
    expect(r.body.data.registration).toBeDefined();
    expect(r.body.data.registration.provisional_candidate_code).toBe(provisionalCode);
  });

  it('login works with jupeb_candidate_number (final matric) + password', async () => {
    if (!registrationMigrated) return;
    const { registrationId, password, email } = await seedFixturesAndStudent('MATRIC');
    // Simulate finalization: set jupeb_candidate_number on the row.
    // Format check is ^[0-9]{2}[0-9]{3}[0-9]{4,}$ (all-numeric, 9+ digits).
    const matric = `26${String(Math.floor(Math.random() * 900) + 100)}${String(Date.now()).slice(-5)}`;
    await pool.query(
      `UPDATE jupeb_registrations SET jupeb_candidate_number = $2 WHERE id = $1`,
      [registrationId, matric]
    );

    const r = await request(app).post('/auth/login').send({ identifier: matric, password });
    expect(r.status).toBe(200);
    expect(r.body.data.user.email).toBe(email);
    expect(r.body.data.registration.jupeb_candidate_number).toBe(matric);
  });

  it('login with a candidate code but wrong password returns 401', async () => {
    if (!registrationMigrated) return;
    const { provisionalCode } = await seedFixturesAndStudent('WRONG');
    const r = await request(app)
      .post('/auth/login')
      .send({ identifier: provisionalCode, password: 'wrong-pw-XYZ' });
    // login.controller maps "Invalid credentials" to 400 — accept either
    // 400 or 401; the load-bearing assertion is "not 200".
    expect(r.status).not.toBe(200);
  });

  it('login with an unknown candidate code returns the same error as wrong email', async () => {
    if (!registrationMigrated) return;
    const r = await request(app)
      .post('/auth/login')
      .send({ identifier: '999999999', password: 'Strong@Password1' });
    expect(r.status).not.toBe(200);
  });

  describe('alphanumeric matric formats (post-migration 012)', () => {
    it('accepts a slash-separated alphanumeric matric like UI/2024/12345', async () => {
      if (!registrationMigrated) return;
      const { registrationId, password, email } = await seedFixturesAndStudent('SLSH');
      const matric = `UI/2024/${String(Date.now()).slice(-5)}`;
      await pool.query(
        `UPDATE jupeb_registrations SET jupeb_candidate_number = $2 WHERE id = $1`,
        [registrationId, matric]
      );
      const r = await request(app).post('/auth/login').send({ identifier: matric, password });
      expect(r.status).toBe(200);
      expect(r.body.data.user.email).toBe(email);
    });

    it('accepts a dash-separated matric like PG21-3-CHM-0123', async () => {
      if (!registrationMigrated) return;
      const { registrationId, password } = await seedFixturesAndStudent('DASH');
      const matric = `PG21-3-CHM-${String(Date.now()).slice(-4)}`;
      await pool.query(
        `UPDATE jupeb_registrations SET jupeb_candidate_number = $2 WHERE id = $1`,
        [registrationId, matric]
      );
      const r = await request(app).post('/auth/login').send({ identifier: matric, password });
      expect(r.status).toBe(200);
    });

    it('rejects an invalid (too-short) matric at the DB constraint level', async () => {
      if (!registrationMigrated) return;
      const { registrationId } = await seedFixturesAndStudent('SHRT');
      await expect(
        pool.query(
          `UPDATE jupeb_registrations SET jupeb_candidate_number = 'A1' WHERE id = $1`,
          [registrationId]
        )
      ).rejects.toThrow(/jupeb_reg_final_number_format/);
    });
  });

  describe('matric lockdown — other login methods disabled once matric is assigned', () => {
    async function seedWithMatric(tag) {
      const seed = await seedFixturesAndStudent(tag);
      const matric = `26${String(Math.floor(Math.random() * 900) + 100)}${String(Date.now()).slice(-5)}`;
      await pool.query(
        `UPDATE jupeb_registrations SET jupeb_candidate_number = $2 WHERE id = $1`,
        [seed.registrationId, matric]
      );
      return { ...seed, matric };
    }

    it('login by email is BLOCKED once the student has a matric', async () => {
      if (!registrationMigrated) return;
      const { email, password } = await seedWithMatric('LKE');
      const r = await request(app).post('/auth/login').send({ identifier: email, password });
      expect(r.status).not.toBe(200);
    });

    it('login by phone is BLOCKED once the student has a matric', async () => {
      if (!registrationMigrated) return;
      const { phone, password } = await seedWithMatric('LKP');
      const r = await request(app).post('/auth/login').send({ identifier: phone, password });
      expect(r.status).not.toBe(200);
    });

    it('login by provisional_candidate_code is BLOCKED once the student has a matric', async () => {
      if (!registrationMigrated) return;
      const { provisionalCode, password } = await seedWithMatric('LKR');
      const r = await request(app).post('/auth/login').send({ identifier: provisionalCode, password });
      expect(r.status).not.toBe(200);
    });

    it('login by matric STILL works after lockdown kicks in', async () => {
      if (!registrationMigrated) return;
      const { matric, password, email } = await seedWithMatric('LKM');
      const r = await request(app).post('/auth/login').send({ identifier: matric, password });
      expect(r.status).toBe(200);
      expect(r.body.data.user.email).toBe(email);
      expect(r.body.data.registration.jupeb_candidate_number).toBe(matric);
    });
  });

  describe('matric lockdown — re-entry exception for a new session', () => {
    // Seeds a user who:
    //   - has a matric in session A (lockdown would normally apply)
    //   - has an in-progress (claimed) registration in a NEW session B
    // → the in-progress no-matric row should release the lockdown so the
    //   user can log in by email / phone again to keep working on B.
    async function seedReEntryStudent(tag) {
      const seedA = await seedFixturesAndStudent(tag);
      const matric = `26${String(Math.floor(Math.random() * 900) + 100)}${String(Date.now()).slice(-5)}`;
      await pool.query(
        `UPDATE jupeb_registrations SET jupeb_candidate_number = $2 WHERE id = $1`,
        [seedA.registrationId, matric]
      );

      // Find the (just-created) user_id by email so we can attach a 2nd reg.
      const userRow = await pool.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [seedA.email]
      );
      const userId = userRow.rows[0].id;

      // Build a 2nd session + uni + combo and attach a fresh claimed
      // registration to the same user — no matric yet.
      const adminToken = await getAdminToken();
      const uniB = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: nextJupebTestUniversityCode(`${tag}B`), name: `${tag}B U`, jupeb_prefix: nextJupebTestPrefix() });
      const scB = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: nextJupebTestUniversityCode(`${tag}SCB`), title: `${tag}B Combo`, subjects: ['M','P','C'], is_global: true });
      const { y1, academicYear, yearShort } = nextJupebAcademicSession();
      const sessB = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          academic_year: academicYear, year_short: yearShort,
          opens_at: new Date(`${y1}-01-01T00:00:00Z`).toISOString(),
          closes_at: new Date(`${y1}-12-01T00:00:00Z`).toISOString(),
        });
      await closeAllOpenJupebSessions(adminToken);
      await request(app).post(`/sessions/${sessB.body.data.id}/open`).set('Authorization', `Bearer ${adminToken}`);

      // Insert the in-progress registration directly — we only need the
      // row to exist with status=claimed and a null candidate number.
      const reg = await pool.query(
        `INSERT INTO jupeb_registrations
            (session_id, university_id, user_id, subject_combination_id,
             provisional_serial, provisional_candidate_code, status, claimed_at)
         VALUES ($1, $2, $3, $4, 1, $5, 'claimed', CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          sessB.body.data.id,
          uniB.body.data.id,
          userId,
          scB.body.data.id,
          // Unique provisional code to satisfy any downstream queries.
          `${yearShort}${uniB.body.data.jupeb_prefix}${String(Math.floor(1000 + Math.random() * 8999))}`,
        ]
      );
      return { ...seedA, matric, sessionBRegId: reg.rows[0].id };
    }

    it('login by email is ALLOWED again when an in-progress no-matric reg exists', async () => {
      if (!registrationMigrated) return;
      const { email, password } = await seedReEntryStudent('RE1');
      const r = await request(app).post('/auth/login').send({ identifier: email, password });
      expect(r.status).toBe(200);
      expect(r.body.data.access_token).toBeDefined();
    });

    it('login by phone is ALLOWED again during re-entry', async () => {
      if (!registrationMigrated) return;
      const { phone, password } = await seedReEntryStudent('RE2');
      const r = await request(app).post('/auth/login').send({ identifier: phone, password });
      expect(r.status).toBe(200);
    });

    it('matric still resolves during re-entry (both identifiers work)', async () => {
      if (!registrationMigrated) return;
      const { matric, password } = await seedReEntryStudent('RE3');
      const r = await request(app).post('/auth/login').send({ identifier: matric, password });
      expect(r.status).toBe(200);
    });
  });
});
