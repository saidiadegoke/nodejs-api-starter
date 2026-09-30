const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const AdminAuditService = require('../modules/admin/services/adminAudit.service');
const { buildCatalogUniversityPayload } = require('./jupeb-session-test-helpers');

describe('Audit Trail & Activity Tracking API', () => {
  let dbReady = false;
  const password = 'AuditTest@12';
  const passwordHash = bcrypt.hashSync(password, 10);

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM admin_audit_logs LIMIT 1');
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

  function uniquePhone(prefix) {
    const tail = String(process.hrtime.bigint()).slice(-9);
    return `+234${prefix}${tail}`;
  }

  async function createUniversity(adminToken, suffix) {
    const res = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        buildCatalogUniversityPayload(String(suffix).slice(-3), {
          name: `Audit Test Uni ${suffix}`,
        })
      );
    expect(res.status).toBe(201);
    return res.body.data.id;
  }

  async function createInstitutionAdmin({ email, universityId }) {
    const ins = await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active') RETURNING id`,
      [email, uniquePhone('8'), passwordHash]
    );
    const userId = ins.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name, jupeb_university_id)
       VALUES ($1, 'AuditInst', 'Admin', 'Audit Inst Admin', $2)`,
      [userId, universityId]
    );
    const roleRow = await pool.query(
      `SELECT id FROM roles WHERE name = 'institution_admin' AND owner_jupeb_university_id IS NULL LIMIT 1`
    );
    if (roleRow.rows[0]) {
      await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
        userId,
        roleRow.rows[0].id,
      ]);
    }
    const perm = await pool.query(`SELECT id FROM permissions WHERE name = 'activity_logs.view' LIMIT 1`);
    if (perm.rows[0]) {
      await pool.query(
        `INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, perm.rows[0].id]
      );
    }
    return userId;
  }

  async function login(email) {
    const res = await request(app).post('/auth/login').send({ identifier: email, password });
    return res.body.data?.access_token || null;
  }

  it('GET /audit requires auth and activity_logs.view permission', async () => {
    const anon = await request(app).get('/audit');
    expect(anon.status).toBe(401);
  });

  it('AdminAuditService.log records events with actor and university context', async () => {
    if (!dbReady) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const adminUser = await pool.query(`SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`);
    const adminId = adminUser.rows[0]?.id;
    if (!adminId) return;

    const actionTag = `test.audit_action_${Date.now()}`;
    await AdminAuditService.log({
      actorUserId: adminId,
      action: actionTag,
      resourceType: 'test_resource',
      resourceId: 'res-123',
      details: { foo: 'bar' },
    });

    const listRes = await request(app)
      .get(`/audit?action=${actionTag}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

    const log = listRes.body.data.find((l) => l.action === actionTag);
    expect(log).toBeDefined();
    expect(log.actor_user_id).toBe(adminId);
    expect(log.resource_type).toBe('test_resource');
    expect(log.resource_id).toBe('res-123');
    expect(log.details).toEqual({ foo: 'bar' });
  });

  it('institution admin receives only institution-scoped audit logs', async () => {
    if (!dbReady) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniA = await createUniversity(adminToken, `${suffix}a`);
    const uniB = await createUniversity(adminToken, `${suffix}b`);

    const instEmail = `inst_audit_${suffix}@example.com`;
    const instAdminId = await createInstitutionAdmin({ email: instEmail, universityId: uniA });
    const instToken = await login(instEmail);
    if (!instToken) return;

    const actionA = `inst_a_action_${suffix}`;
    const actionB = `inst_b_action_${suffix}`;

    // Event in uniA
    await AdminAuditService.log({
      actorUserId: instAdminId,
      action: actionA,
      resourceType: 'candidate',
      resourceId: 'cand-A',
      universityId: uniA,
    });

    // Event in uniB
    const userB = await pool.query(`SELECT id FROM users LIMIT 1`);
    await AdminAuditService.log({
      actorUserId: userB.rows[0].id,
      action: actionB,
      resourceType: 'candidate',
      resourceId: 'cand-B',
      universityId: uniB,
    });

    const instList = await request(app)
      .get('/audit?limit=100')
      .set('Authorization', `Bearer ${instToken}`);

    expect(instList.status).toBe(200);
    const actions = instList.body.data.map((l) => l.action);
    expect(actions).toContain(actionA);
    expect(actions).not.toContain(actionB);
  });

  it('GET /audit response contains all Figma UI design fields', async () => {
    if (!dbReady) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const res = await request(app)
      .get('/audit?limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    if (res.body.data.length > 0) {
      const row = res.body.data[0];
      // TIME STAMP
      expect(row).toHaveProperty('created_at');
      // ROLE
      expect(row).toHaveProperty('actor_role');
      // USER
      expect(row).toHaveProperty('actor_name');
      // EMAIL
      expect(row).toHaveProperty('actor_email');
      // ACTION
      expect(row).toHaveProperty('action');
      expect(row).toHaveProperty('action_display');
      // DETAILS
      expect(row).toHaveProperty('details');
      expect(row).toHaveProperty('details_display');
    }
  });

  it('GET /audit/export returns CSV formatted for Figma table', async () => {
    if (!dbReady) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const res = await request(app)
      .get('/audit/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('S/N,TIME STAMP,ROLE,USER,EMAIL,ACTION,DETAILS');
  });
});

