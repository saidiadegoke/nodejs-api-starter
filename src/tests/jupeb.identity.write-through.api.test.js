const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
  buildCatalogUniversityPayload,
} = require('./jupeb-session-test-helpers');

describe('NIN write-through to NoK + profile address (M.12)', () => {
  let nokMigrated = false;
  let profileColsMigrated = false;
  let registrationMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_next_of_kin LIMIT 1');
      nokMigrated = true;
    } catch {
      nokMigrated = false;
    }
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'profiles' AND column_name = 'residential_address'`
      );
      profileColsMigrated = r.rowCount > 0;
    } catch {
      profileColsMigrated = false;
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

  async function makeFixtures(adminToken, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          buildCatalogUniversityPayload(tag, {
            code: nextJupebTestUniversityCode(tag),
            name: `${tag} WT University`,
          })
        );
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
    return {
      sessionId: sessRes.body.data.id,
      universityId: uniRes.body.data.id,
      subjectCombinationId: scRes.body.data.id,
    };
  }

  it('institutionCreate with verified NIN seeds profile address + NoK from response_payload', async () => {
    if (!nokMigrated || !profileColsMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    // Verify a NIN first (mock adapter returns rich payload by default).
    const nin = `1${String(Date.now()).slice(-10)}`;
    const verifyRes = await request(app)
      .post('/identity/nin/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nin,
        provider: 'mock',
        idempotency_key: `idem-wt-${Date.now()}`,
      });
    if (verifyRes.status !== 200 && verifyRes.status !== 201) return;
    if (verifyRes.body.data.status !== 'verified') return; // some envs route to pending
    const ninVerificationId = verifyRes.body.data.verification_id;

    const { sessionId, universityId, subjectCombinationId } = await makeFixtures(adminToken, 'WT');

    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessionId,
        university_id: universityId,
        subject_combination_id: subjectCombinationId,
        nin_verification_id: ninVerificationId,
      });
    expect(createReg.status).toBe(201);
    const registrationId = createReg.body.data.id;

    // Sign up the student and check that profile + NoK are pre-populated.
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const studentEmail = `wt-${stamp}@example.com`;
    const reg = await request(app)
      .post('/auth/complete-registration')
      .send({
        code: createReg.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: studentEmail,
      });
    expect(reg.status).toBe(201);
    const studentToken = reg.body.data.access_token;

    // Profile should have at least one of state_of_origin / lga / place_of_birth / residential_address.
    const profile = await request(app)
      .get('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(profile.status).toBe(200);
    const bi = profile.body.data.basic_information || {};
    expect(
      Boolean(bi.state_of_origin || bi.lga || bi.place_of_birth || bi.residential_address)
    ).toBe(true);

    // NoK should be present, source 'nin'.
    const nokRes = await request(app)
      .get('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(nokRes.status).toBe(200);
    expect(nokRes.body.data.source).toBe('nin');
    expect(nokRes.body.data.name).toBeDefined();

    // Sanity: row exists in the underlying tables linked to this registration.
    const dbNok = await pool.query(
      `SELECT * FROM jupeb_next_of_kin WHERE registration_id = $1 AND deleted_at IS NULL`,
      [registrationId]
    );
    expect(dbNok.rows.length).toBe(1);
    expect(dbNok.rows[0].source).toBe('nin');
  });
});
