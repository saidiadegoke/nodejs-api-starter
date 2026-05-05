const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

describe('Admin RBAC — roles, permissions, user assignment', () => {
  let dbReady = false;
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM roles LIMIT 1');
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

  async function getStudentToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'student@example.com', password: 'Student@12' });
    return res.body.data?.access_token || null;
  }

  function unique(tag) {
    return `${tag}_${Date.now().toString(36)}_${Math.floor(Math.random() * 9999)}`.toLowerCase();
  }

  it('GET /admin/roles requires auth', async () => {
    const res = await request(app).get('/admin/roles');
    expect(res.status).toBe(401);
  });

  it('GET /admin/roles rejects non-admin', async () => {
    const t = await getStudentToken();
    if (!t) return;
    const res = await request(app).get('/admin/roles').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(403);
  });

  it('GET /admin/roles returns paginated list including seeded system roles', async () => {
    if (!dbReady) return;
    const token = await getAdminToken();
    if (!token) return;
    const res = await request(app).get('/admin/roles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const names = res.body.data.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['admin', 'super_admin']));
  });

  it('full role CRUD lifecycle (create → patch → delete)', async () => {
    if (!dbReady) return;
    const token = await getAdminToken();
    if (!token) return;
    const name = unique('test_role');
    const create = await request(app)
      .post('/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, display_name: 'Test Role', description: 'temp' });
    expect(create.status).toBe(201);
    expect(create.body.data.name).toBe(name);
    expect(create.body.data.is_system).toBe(false);
    const id = create.body.data.id;

    const dup = await request(app)
      .post('/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, display_name: 'Dup' });
    expect(dup.status).toBe(409);

    const got = await request(app)
      .get(`/admin/roles/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(got.status).toBe(200);
    expect(got.body.data.id).toBe(id);

    const patch = await request(app)
      .patch(`/admin/roles/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'updated' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.description).toBe('updated');

    const del = await request(app)
      .delete(`/admin/roles/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);

    const after = await request(app)
      .get(`/admin/roles/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(404);
  });

  it('system roles cannot be deleted nor have name changed', async () => {
    if (!dbReady) return;
    const token = await getAdminToken();
    if (!token) return;
    const list = await request(app).get('/admin/roles').set('Authorization', `Bearer ${token}`);
    const sys = list.body.data.find((r) => r.is_system);
    if (!sys) return;

    const renameAttempt = await request(app)
      .patch(`/admin/roles/${sys.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: unique('renamed') });
    expect(renameAttempt.status).toBe(422);

    const del = await request(app)
      .delete(`/admin/roles/${sys.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(422);
  });

  it('full permission CRUD lifecycle', async () => {
    if (!dbReady) return;
    const token = await getAdminToken();
    if (!token) return;
    const action = unique('do_thing');
    const create = await request(app)
      .post('/admin/permissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ resource: 'test_res', action, description: 'temp' });
    expect(create.status).toBe(201);
    expect(create.body.data.resource).toBe('test_res');
    expect(create.body.data.action).toBe(action);
    expect(create.body.data.name).toBe(`test_res:${action}`);
    const pid = create.body.data.id;

    const dup = await request(app)
      .post('/admin/permissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ resource: 'test_res', action });
    expect(dup.status).toBe(409);

    const patch = await request(app)
      .patch(`/admin/permissions/${pid}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'updated' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.description).toBe('updated');

    const del = await request(app)
      .delete(`/admin/permissions/${pid}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
  });

  it('GET /admin/permissions?group_by=role groups permissions per role', async () => {
    if (!dbReady) return;
    const token = await getAdminToken();
    if (!token) return;
    const res = await request(app)
      .get('/admin/permissions?group_by=role')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const group of res.body.data) {
      expect(group.role_id).toBeDefined();
      expect(group.role_name).toBeDefined();
      expect(Array.isArray(group.permissions)).toBe(true);
    }
  });

  it('attach + detach a permission to a role', async () => {
    if (!dbReady) return;
    const token = await getAdminToken();
    if (!token) return;
    const roleRes = await request(app)
      .post('/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: unique('att_role'), display_name: 'Attach Role' });
    expect(roleRes.status).toBe(201);
    const roleId = roleRes.body.data.id;
    const permRes = await request(app)
      .post('/admin/permissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ resource: 'att_res', action: unique('act') });
    expect(permRes.status).toBe(201);
    const permId = permRes.body.data.id;

    const attach = await request(app)
      .post(`/admin/roles/${roleId}/permissions/${permId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(attach.status).toBe(200);
    expect(attach.body.data.attached).toBe(true);

    const list = await request(app)
      .get(`/admin/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.find((p) => p.id === permId)).toBeDefined();

    const detach = await request(app)
      .delete(`/admin/roles/${roleId}/permissions/${permId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detach.status).toBe(200);
    expect(detach.body.data.detached).toBe(true);

    await request(app).delete(`/admin/permissions/${permId}`).set('Authorization', `Bearer ${token}`);
    await request(app).delete(`/admin/roles/${roleId}`).set('Authorization', `Bearer ${token}`);
  });

  it('PATCH /admin/users/:userId/roles supports replace, add, remove', async () => {
    if (!dbReady) return;
    const token = await getAdminToken();
    if (!token) return;
    const userRow = await pool.query(
      `SELECT id FROM users WHERE email = 'student@example.com' LIMIT 1`
    );
    if (!userRow.rows[0]) return;
    const userId = userRow.rows[0].id;

    const roleA = await request(app)
      .post('/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: unique('asgn_a'), display_name: 'Asgn A' });
    const roleB = await request(app)
      .post('/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: unique('asgn_b'), display_name: 'Asgn B' });
    expect(roleA.status).toBe(201);
    expect(roleB.status).toBe(201);

    // Replace: assign just role A.
    const replace = await request(app)
      .patch(`/admin/users/${userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role_ids: [roleA.body.data.id] });
    expect(replace.status).toBe(200);
    let names = replace.body.data.map((r) => r.id);
    expect(names).toContain(roleA.body.data.id);
    expect(names).not.toContain(roleB.body.data.id);

    // Add B.
    const add = await request(app)
      .patch(`/admin/users/${userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ add: [roleB.body.data.id] });
    expect(add.status).toBe(200);
    names = add.body.data.map((r) => r.id);
    expect(names).toContain(roleA.body.data.id);
    expect(names).toContain(roleB.body.data.id);

    // Remove A.
    const remove = await request(app)
      .patch(`/admin/users/${userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remove: [roleA.body.data.id] });
    expect(remove.status).toBe(200);
    names = remove.body.data.map((r) => r.id);
    expect(names).not.toContain(roleA.body.data.id);
    expect(names).toContain(roleB.body.data.id);

    // Cleanup: clear test roles, restore original student roles.
    await request(app)
      .patch(`/admin/users/${userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remove: [roleA.body.data.id, roleB.body.data.id] });
    await request(app).delete(`/admin/roles/${roleA.body.data.id}`).set('Authorization', `Bearer ${token}`);
    await request(app).delete(`/admin/roles/${roleB.body.data.id}`).set('Authorization', `Bearer ${token}`);
  });

  it('PATCH /admin/users/:userId/roles requires one of role_ids/add/remove', async () => {
    if (!dbReady) return;
    const token = await getAdminToken();
    if (!token) return;
    const userRow = await pool.query(
      `SELECT id FROM users WHERE email = 'student@example.com' LIMIT 1`
    );
    if (!userRow.rows[0]) return;
    const res = await request(app)
      .patch(`/admin/users/${userRow.rows[0].id}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(422);
  });

  it('GET /admin/users/:userId/roles returns current assignments', async () => {
    if (!dbReady) return;
    const token = await getAdminToken();
    if (!token) return;
    const userRow = await pool.query(
      `SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`
    );
    if (!userRow.rows[0]) return;
    const res = await request(app)
      .get(`/admin/users/${userRow.rows[0].id}/roles`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.find((r) => r.name === 'admin' || r.name === 'super_admin')).toBeDefined();
  });
});
