/**
 * GET /admin/users must list system users only — candidate/student accounts
 * are not system users and are filtered out unless the caller asks for them.
 */
const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');

const CANDIDATE_ROLE_NAMES = ['user', 'student', 'candidate'];

describe('Admin users list — candidate exclusion', () => {
  let adminToken = null;
  let candidateUserId = null;
  let staffUserId = null;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    if (loginRes.status !== 200 || !loginRes.body.data?.access_token) return;
    adminToken = loginRes.body.data.access_token;

    const candidate = await pool.query(
      `SELECT u.id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id AND r.name = 'user'
        WHERE u.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM user_roles ur2
            JOIN roles r2 ON r2.id = ur2.role_id
            WHERE ur2.user_id = u.id
              AND NOT (r2.name = ANY($1::text[]))
              AND (ur2.expires_at IS NULL OR ur2.expires_at > NOW())
          )
        LIMIT 1`,
      [CANDIDATE_ROLE_NAMES],
    );
    candidateUserId = candidate.rows[0]?.id || null;

    const staff = await pool.query(
      `SELECT u.id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE u.deleted_at IS NULL
          AND r.name IN ('admin', 'super_admin', 'registrar', 'agent')
        LIMIT 1`,
    );
    staffUserId = staff.rows[0]?.id || null;
  });

  it('excludes candidate accounts from the default list', async () => {
    expect(adminToken).toBeTruthy();
    expect(candidateUserId).toBeTruthy();

    const res = await request(app)
      .get('/admin/users?page=1&limit=1000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const ids = res.body.data.map((u) => u.id);
    expect(ids).not.toContain(candidateUserId);

    // No returned account is a candidate-only account.
    for (const row of res.body.data) {
      const roles = row.roles || [];
      const candidateOnly =
        roles.length > 0 && roles.every((r) => CANDIDATE_ROLE_NAMES.includes(r));
      expect(candidateOnly).toBe(false);
    }
  });

  it('keeps staff accounts in the default list', async () => {
    if (!staffUserId) return;

    const res = await request(app)
      .get('/admin/users?page=1&limit=1000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u) => u.id)).toContain(staffUserId);
  });

  it('returns candidate accounts when include_all is requested', async () => {
    const res = await request(app)
      .get('/admin/users?page=1&limit=1000&include_all=true')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u) => u.id)).toContain(candidateUserId);
  });
});
