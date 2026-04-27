const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

describe('JUPEB identity API', () => {
  let identityMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_nin_verifications LIMIT 1');
      identityMigrated = true;
    } catch {
      identityMigrated = false;
      // eslint-disable-next-line no-console
      console.warn('[jupeb.identity.api] Skipping: apply migration `004_jupeb_identity.sql`.');
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

  it('POST /identity/nin/verify without auth returns 401', async () => {
    const res = await request(app).post('/identity/nin/verify').send({ nin: '12345678901' });
    expect(res.status).toBe(401);
  });

  it('POST /identity/nin/verify with mock provider returns verification + profile (no raw NIN)', async () => {
    if (!identityMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const nin = `9${String(Date.now()).slice(-10)}`;
    const res = await request(app)
      .post('/identity/nin/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ nin, idempotency_key: `idem-${Date.now()}` });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('verification_id');
    expect(res.body.data.status).toBe('verified');
    expect(res.body.data.profile).toBeDefined();
    expect(res.body.data.profile.nin_last4).toBe(nin.slice(-4));
    expect(JSON.stringify(res.body)).not.toMatch(new RegExp(nin));

    const getRes = await request(app)
      .get(`/identity/nin/verifications/${res.body.data.verification_id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.status).toBe('verified');
  });

  it('rejects invalid NIN format', async () => {
    if (!identityMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const res = await request(app)
      .post('/identity/nin/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ nin: '123' });
    expect(res.status).toBe(422);
  });
});
