const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
  buildCatalogUniversityPayload,
} = require('./jupeb-session-test-helpers');

describe('Next-of-kin endpoints (M.1)', () => {
  let nokMigrated = false;
  let registrationMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_next_of_kin LIMIT 1');
      nokMigrated = true;
    } catch {
      nokMigrated = false;
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
        .send(
          buildCatalogUniversityPayload(`${tag}${i}`, {
            code: nextJupebTestUniversityCode(tag),
            name: `${tag} NoK University`,
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
          opens_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          closes_at: new Date(Date.now() + 30 * 86400000).toISOString(),
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
    // Sign up a fresh student against this code so tests don't share a
    // registration across describes.
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const studentEmail = `nok-${tag.toLowerCase()}-${stamp}@example.com`;
    const reg = await request(app)
      .post('/auth/complete-registration')
      .send({
        code: createReg.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: studentEmail,
        first_name: 'Ada',
        last_name: 'Tester',
      });
    return {
      studentToken: reg.body.data.access_token,
      registrationId: reg.body.data.registration.id,
      adminToken,
    };
  }

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/registration/me/next-of-kin');
    expect(res.status).toBe(401);
  });

  it('returns 404 when no next-of-kin yet', async () => {
    if (!nokMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'GET404');

    const res = await request(app)
      .get('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(404);
  });

  it('rejects payload missing both phone and email (422 with errors[])', async () => {
    if (!nokMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'NOCT');

    const res = await request(app)
      .post('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ name: 'Jane Mother', relationship: 'mother' });
    expect(res.status).toBe(422);
    expect(res.body.details && Array.isArray(res.body.details.errors)).toBe(true);
  });

  it('rejects unknown relationship (422)', async () => {
    if (!nokMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'BADREL');

    const res = await request(app)
      .post('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        name: 'Jane Mother',
        relationship: 'pet',
        phone: '+2348000000001',
      });
    expect(res.status).toBe(422);
  });

  it('POST creates the active row, second POST returns 409 next_of_kin_exists', async () => {
    if (!nokMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'POST');

    const first = await request(app)
      .post('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        name: 'Jane Mother',
        relationship: 'mother',
        phone: '+2348111111111',
        email: 'jane.mother@example.com',
        address: '12 Lagos Rd',
      });
    expect(first.status).toBe(201);
    expect(first.body.data.name).toBe('Jane Mother');
    expect(first.body.data.relationship).toBe('mother');
    expect(first.body.data.source).toBe('student');

    const get = await request(app)
      .get('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(get.status).toBe(200);
    expect(get.body.data.email).toBe('jane.mother@example.com');

    const conflict = await request(app)
      .post('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        name: 'Other Person',
        relationship: 'father',
        phone: '+2348999999999',
      });
    expect(conflict.status).toBe(409);
    expect(conflict.body.details && conflict.body.details.error_code).toBe(
      'next_of_kin_exists'
    );
  });

  it('PUT replaces the active row and history exposes the prior soft-deleted entry', async () => {
    if (!nokMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'PUT');

    await request(app)
      .post('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        name: 'Jane Mother',
        relationship: 'mother',
        phone: '+2348111111111',
      });

    const replaced = await request(app)
      .put('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        name: 'John Father',
        relationship: 'father',
        phone: '+2348222222222',
      });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.name).toBe('John Father');
    expect(replaced.body.data.relationship).toBe('father');

    const active = await request(app)
      .get('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(active.body.data.name).toBe('John Father');

    const history = await request(app)
      .get('/registration/me/next-of-kin/history')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(history.status).toBe(200);
    expect(Array.isArray(history.body.data.history)).toBe(true);
    expect(history.body.data.history.length).toBeGreaterThanOrEqual(2);
    const deletedRows = history.body.data.history.filter((r) => r.deleted_at);
    expect(deletedRows.length).toBeGreaterThanOrEqual(1);
  });

  it('next-of-kin shows up on GET /registration/me/profile', async () => {
    if (!nokMigrated || !registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'PROF');

    await request(app)
      .post('/registration/me/next-of-kin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        name: 'Profile NoK',
        relationship: 'sibling',
        phone: '+2348333333333',
      });

    const profile = await request(app)
      .get('/registration/me/profile')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.next_of_kin).toBeDefined();
    expect(profile.body.data.next_of_kin.name).toBe('Profile NoK');
    expect(profile.body.data.next_of_kin.source).toBe('student');
  });
});
