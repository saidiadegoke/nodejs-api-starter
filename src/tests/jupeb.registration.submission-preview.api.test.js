const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  ensureTestRegistrationFixtures,
} = require('./jupeb-session-test-helpers');

describe('GET /registration/me/submission-preview', () => {
  let registrationMigrated = false;
  let createdRegId = null;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registration_status_history LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
    }
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
  });

  afterAll(async () => {
    if (createdRegId) {
      await pool.query('DELETE FROM jupeb_registrations WHERE id = $1', [createdRegId]).catch(() => {});
    }
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/registration/me/submission-preview');
    expect(res.status).toBe(401);
  });

  it('returns the composite submission preview with documents and biometric_status', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const { sessionId, universityId, subjectCombinationId } = await ensureTestRegistrationFixtures(pool, token, 'SUB');
    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({ session_id: sessionId, university_id: universityId, subject_combination_id: subjectCombinationId });
    expect(createReg.status).toBe(201);
    createdRegId = createReg.body.data?.id;
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: createReg.body.data.institution_issued_code });

    const res = await request(app)
      .get('/registration/me/submission-preview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.candidate).toBeDefined();
    expect(res.body.data.subject_combination).toBeDefined();
    expect(res.body.data.documents).toBeDefined();
    expect(Array.isArray(res.body.data.documents)).toBe(true);
    expect(res.body.data.biometric_status).toBeDefined();
    expect(['none', 'partial', 'complete']).toContain(res.body.data.biometric_status);
    expect(res.body.data.biometrics).toBeDefined();
    expect(Array.isArray(res.body.data.biometrics)).toBe(true);
  });
});
