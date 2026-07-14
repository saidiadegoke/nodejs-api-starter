const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  buildCatalogUniversityPayload,
} = require('./jupeb-session-test-helpers');

describe('Admin RBAC — institution-scoped lists', () => {
  let dbReady = false;
  let rolesOwnershipMigrated = false;

  const password = 'ScopeTest@12';
  const passwordHash = bcrypt.hashSync(password, 10);

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM roles LIMIT 1');
      dbReady = true;
    } catch {
      dbReady = false;
    }
    try {
      await pool.query('SELECT created_by FROM roles LIMIT 1');
      rolesOwnershipMigrated = true;
    } catch {
      rolesOwnershipMigrated = false;
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

  async function createUniversity(adminToken, suffix) {
    const res = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        buildCatalogUniversityPayload(String(suffix).slice(-3), {
          name: `Scope Test Uni ${suffix}`,
        })
      );
    expect(res.status).toBe(201);
    return res.body.data.id;
  }

  async function createInstitutionAdmin({ email, universityId }) {
    const ins = await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active') RETURNING id`,
      [email, `+2348${String(Date.now()).slice(-9)}`, passwordHash]
    );
    const userId = ins.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name, jupeb_university_id)
       VALUES ($1, 'Inst', 'Admin', 'Inst Admin', $2)`,
      [userId, universityId]
    );
    const roleRow = await pool.query(`SELECT id FROM roles WHERE name = 'institution_admin' LIMIT 1`);
    await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
      userId,
      roleRow.rows[0].id,
    ]);
    return userId;
  }

  async function createScopedUser({ email, universityId, roleName = null }) {
    const ins = await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active') RETURNING id`,
      [email, `+2349${String(Date.now()).slice(-9)}`, passwordHash]
    );
    const userId = ins.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name, jupeb_university_id)
       VALUES ($1, 'Scoped', 'User', 'Scoped User', $2)`,
      [userId, universityId]
    );
    if (roleName) {
      const roleRow = await pool.query(`SELECT id FROM roles WHERE name = $1 LIMIT 1`, [roleName]);
      if (roleRow.rows[0]) {
        await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
          userId,
          roleRow.rows[0].id,
        ]);
      }
    }
    return userId;
  }

  async function login(email) {
    const res = await request(app).post('/auth/login').send({ identifier: email, password });
    return res.body.data?.access_token || null;
  }

  it('seed includes candidate.* and payments.pay_fees permissions', async () => {
    if (!dbReady) return;
    const res = await pool.query(
      `SELECT name FROM permissions
       WHERE name IN (
         'candidate.view', 'candidate.create', 'candidate.update', 'candidate.delete',
         'payments.pay_fees'
       )
       ORDER BY name`
    );
    const names = res.rows.map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'candidate.view',
        'candidate.create',
        'candidate.update',
        'candidate.delete',
        'payments.pay_fees',
      ])
    );
  });

  it('institution admin sees only same-university users', async () => {
    if (!dbReady || !rolesOwnershipMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniA = await createUniversity(adminToken, `${suffix}a`);
    const uniB = await createUniversity(adminToken, `${suffix}b`);

    const instEmail = `inst_admin_${suffix}@example.com`;
    await createInstitutionAdmin({ email: instEmail, universityId: uniA });

    const userAId = await createScopedUser({
      email: `user_a_${suffix}@example.com`,
      universityId: uniA,
    });
    const userBId = await createScopedUser({
      email: `user_b_${suffix}@example.com`,
      universityId: uniB,
    });

    const instToken = await login(instEmail);
    if (!instToken) return;

    const list = await request(app)
      .get('/admin/users?limit=100')
      .set('Authorization', `Bearer ${instToken}`);
    expect(list.status).toBe(200);
    const ids = list.body.data.map((u) => u.id);
    expect(ids).toContain(userAId);
    expect(ids).not.toContain(userBId);

    const outOfScope = await request(app)
      .get(`/admin/users/${userBId}`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(outOfScope.status).toBe(403);
  });

  it('any user with jupeb_university_id sees only same-university users', async () => {
    if (!dbReady || !rolesOwnershipMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniA = await createUniversity(adminToken, `${suffix}a`);
    const uniB = await createUniversity(adminToken, `${suffix}b`);

    const agentEmail = `agent_scope_${suffix}@example.com`;
    await createScopedUser({ email: agentEmail, universityId: uniA, roleName: 'agent' });
    const userAId = await createScopedUser({
      email: `agent_user_a_${suffix}@example.com`,
      universityId: uniA,
    });
    const userBId = await createScopedUser({
      email: `agent_user_b_${suffix}@example.com`,
      universityId: uniB,
    });

    const agentToken = await login(agentEmail);
    if (!agentToken) return;

    const list = await request(app)
      .get('/admin/users?limit=100')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(list.status).toBe(200);
    const ids = list.body.data.map((u) => u.id);
    expect(ids).toContain(userAId);
    expect(ids).not.toContain(userBId);
  });

  it('full-access role with jupeb_university_id still has full user visibility', async () => {
    if (!dbReady || !rolesOwnershipMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniA = await createUniversity(adminToken, `${suffix}a`);
    const uniB = await createUniversity(adminToken, `${suffix}b`);

    const registrarEmail = `registrar_scope_${suffix}@example.com`;
    const registrarId = await createScopedUser({
      email: registrarEmail,
      universityId: uniA,
      roleName: 'registrar',
    });
    const usersViewPerm = await pool.query(
      `SELECT id FROM permissions WHERE name = 'users.view' LIMIT 1`
    );
    await pool.query(
      `INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2)
       ON CONFLICT (user_id, permission_id) DO NOTHING`,
      [registrarId, usersViewPerm.rows[0].id]
    );
    const userBId = await createScopedUser({
      email: `registrar_user_b_${suffix}@example.com`,
      universityId: uniB,
    });

    const registrarToken = await login(registrarEmail);
    if (!registrarToken) return;

    const list = await request(app)
      .get('/admin/users?limit=100')
      .set('Authorization', `Bearer ${registrarToken}`);
    expect(list.status).toBe(200);
    const ids = list.body.data.map((u) => u.id);
    expect(ids).toContain(userBId);
  });

  it('institution admin sees system roles and own custom roles only', async () => {
    if (!dbReady || !rolesOwnershipMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniId = await createUniversity(adminToken, suffix);
    const instEmail = `inst_roles_${suffix}@example.com`;
    await createInstitutionAdmin({ email: instEmail, universityId: uniId });
    const instToken = await login(instEmail);
    if (!instToken) return;

    const registrarRoleName = unique('registrar_role');
    const regCreate = await request(app)
      .post('/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: registrarRoleName, display_name: 'Registrar Custom' });
    expect(regCreate.status).toBe(201);
    const registrarRoleId = regCreate.body.data.id;

    const ownRoleName = unique('inst_own_role');
    const ownCreate = await request(app)
      .post('/admin/roles')
      .set('Authorization', `Bearer ${instToken}`)
      .send({ name: ownRoleName, display_name: 'Institution Custom' });
    expect(ownCreate.status).toBe(201);
    const ownRoleId = ownCreate.body.data.id;

    const list = await request(app)
      .get('/admin/roles?limit=200')
      .set('Authorization', `Bearer ${instToken}`);
    expect(list.status).toBe(200);
    const names = list.body.data.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['institution_admin', ownRoleName]));
    expect(names).not.toContain(registrarRoleName);
    expect(names).not.toContain('registrar');
    expect(names).not.toContain('admin');
    expect(names).not.toContain('super_admin');

    const foreignGet = await request(app)
      .get(`/admin/roles/${registrarRoleId}`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(foreignGet.status).toBe(403);

    const ownGet = await request(app)
      .get(`/admin/roles/${ownRoleId}`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(ownGet.status).toBe(200);

    await request(app).delete(`/admin/roles/${ownRoleId}`).set('Authorization', `Bearer ${instToken}`);
    await request(app).delete(`/admin/roles/${registrarRoleId}`).set('Authorization', `Bearer ${adminToken}`);
  });

  it('POST /admin/users accepts custom roles from the roles table', async () => {
    if (!dbReady || !rolesOwnershipMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniId = await createUniversity(adminToken, suffix);
    const instEmail = `inst_custom_role_${suffix}@example.com`;
    await createInstitutionAdmin({ email: instEmail, universityId: uniId });
    const instToken = await login(instEmail);
    if (!instToken) return;

    const customRoleName = unique('inst_staff_role');
    const roleCreate = await request(app)
      .post('/admin/roles')
      .set('Authorization', `Bearer ${instToken}`)
      .send({ name: customRoleName, display_name: 'Institution Staff' });
    expect(roleCreate.status).toBe(201);

    const targetEmail = `custom_role_user_${suffix}@example.com`;
    const created = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${instToken}`)
      .send({
        email: targetEmail,
        password: 'Password@12',
        first_name: 'Custom',
        last_name: 'Role',
        role: customRoleName,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.user.role).toBe(customRoleName);
    expect(created.body.data.university.id).toBe(uniId);
  });

  it('POST /admin/users rejects custom roles outside institution scope', async () => {
    if (!dbReady || !rolesOwnershipMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniId = await createUniversity(adminToken, suffix);
    const instEmail = `inst_foreign_role_${suffix}@example.com`;
    await createInstitutionAdmin({ email: instEmail, universityId: uniId });
    const instToken = await login(instEmail);
    if (!instToken) return;

    const foreignRoleName = unique('foreign_role');
    const foreignCreate = await request(app)
      .post('/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: foreignRoleName, display_name: 'Foreign Custom Role' });
    expect(foreignCreate.status).toBe(201);

    const denied = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${instToken}`)
      .send({
        email: `foreign_role_user_${suffix}@example.com`,
        password: 'Password@12',
        first_name: 'Foreign',
        last_name: 'Role',
        role: foreignRoleName,
      });
    expect(denied.status).toBe(403);

    await request(app)
      .delete(`/admin/roles/${foreignCreate.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  it('institution admin cannot assign registrar role via POST /admin/users', async () => {
    if (!dbReady || !rolesOwnershipMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniId = await createUniversity(adminToken, suffix);
    const instEmail = `inst_no_reg_${suffix}@example.com`;
    await createInstitutionAdmin({ email: instEmail, universityId: uniId });
    const instToken = await login(instEmail);
    if (!instToken) return;

    const res = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${instToken}`)
      .send({
        email: `registrar_user_${suffix}@example.com`,
        password: 'Password@12',
        first_name: 'No',
        last_name: 'Registrar',
        role: 'registrar',
      });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/registrar/i);
  });

  it('POST /admin/roles with existing system role name returns helpful message', async () => {
    if (!dbReady) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const res = await request(app)
      .post('/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'institution_admin', display_name: 'Duplicate Institution Admin' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/POST \/admin\/users/);
  });

  it('POST /admin/users rejects wrong university_id for institution admin', async () => {
    if (!dbReady || !rolesOwnershipMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniA = await createUniversity(adminToken, `${suffix}a`);
    const uniB = await createUniversity(adminToken, `${suffix}b`);
    const instEmail = `inst_create_${suffix}@example.com`;
    await createInstitutionAdmin({ email: instEmail, universityId: uniA });
    const instToken = await login(instEmail);
    if (!instToken) return;

    const bad = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${instToken}`)
      .send({
        email: `wrong_uni_${suffix}@example.com`,
        password: 'Password@12',
        first_name: 'Wrong',
        last_name: 'Uni',
        role: 'program_director',
        university_id: uniB,
      });
    expect(bad.status).toBe(403);
  });

  it('POST /admin/users without university_id defaults to institution scope', async () => {
    if (!dbReady || !rolesOwnershipMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniA = await createUniversity(adminToken, `${suffix}a`);
    const instEmail = `inst_nouni_${suffix}@example.com`;
    await createInstitutionAdmin({ email: instEmail, universityId: uniA });
    const instToken = await login(instEmail);
    if (!instToken) return;

    const targetEmail = `scoped_default_${suffix}@example.com`;
    const created = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${instToken}`)
      .send({
        email: targetEmail,
        password: 'Password@12',
        first_name: 'Scoped',
        last_name: 'Default',
        role: 'program_director',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.university.id).toBe(uniA);
    expect(created.body.data.binding).toBeDefined();
  });

  it('POST /admin/users without university_id allows full admin role-only create', async () => {
    if (!dbReady) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const targetEmail = `role_only_${suffix}@example.com`;
    const created = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: targetEmail,
        password: 'Password@12',
        first_name: 'Role',
        last_name: 'Only',
        role: 'agent',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.user.email).toBe(targetEmail);
    expect(created.body.data.university).toBeNull();
    expect(created.body.data.binding).toBeNull();
  });
});
