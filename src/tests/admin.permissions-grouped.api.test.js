const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const { buildCatalogUniversityPayload } = require('./jupeb-session-test-helpers');

describe('Admin RBAC — grouped & role-filtered permissions', () => {
  let dbReady = false;
  let adminToken = null;
  let institutionAdminToken = null;
  let universityId = null;

  const password = 'ScopeTest@12';
  const passwordHash = bcrypt.hashSync(password, 10);

  function unique(tag) {
    return `${tag}_${Date.now().toString(36)}_${Math.floor(Math.random() * 9999)}`.toLowerCase();
  }

  function uniquePhone() {
    const tail = String(process.hrtime.bigint()).slice(-9);
    return `+2348${tail}`;
  }

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM roles LIMIT 1');
      dbReady = true;
    } catch {
      dbReady = false;
      return;
    }

    // Login super admin / global admin
    const adminRes = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    adminToken = adminRes.body.data?.access_token || null;

    if (!adminToken) return;

    // Create a test university
    const suffix = unique('perm_uni');
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        buildCatalogUniversityPayload(String(suffix).slice(-3), {
          name: `Perm Test Uni ${suffix}`,
        })
      );
    universityId = uniRes.body?.data?.id;

    if (!universityId) return;

    // Create an institution admin
    const email = `${unique('inst_admin')}@example.com`;
    const userRes = await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active') RETURNING id`,
      [email, uniquePhone(), passwordHash]
    );
    const userId = userRes.rows[0].id;

    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name, jupeb_university_id)
       VALUES ($1, 'Inst', 'Admin', 'Inst Admin', $2)`,
      [userId, universityId]
    );

    const roleRow = await pool.query(
      `SELECT id FROM roles
       WHERE name = 'institution_admin'
         AND owner_jupeb_university_id IS NULL
       ORDER BY is_system DESC
       LIMIT 1`
    );

    if (roleRow.rows[0]) {
      await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
        userId,
        roleRow.rows[0].id,
      ]);
    }

    // Login as institution admin
    const instLoginRes = await request(app)
      .post('/auth/login')
      .send({ identifier: email, password });
    institutionAdminToken = instLoginRes.body.data?.access_token || null;
  });

  it('GET /admin/permissions as super_admin returns all module groups including system & OCR', async () => {
    if (!dbReady || !adminToken) return;

    const res = await request(app)
      .get('/admin/permissions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const moduleKeys = res.body.data.map((m) => m.module);
    expect(moduleKeys).toEqual(expect.arrayContaining(['candidate', 'support', 'results', 'reports']));
    // Super admin can see ocr, system, institutions, posts
    expect(moduleKeys.some((k) => ['ocr', 'institutions', 'system'].includes(k))).toBe(true);

    // Verify module object schema
    const firstGroup = res.body.data[0];
    expect(firstGroup).toHaveProperty('module');
    expect(firstGroup).toHaveProperty('module_name');
    expect(firstGroup).toHaveProperty('total_permissions');
    expect(firstGroup).toHaveProperty('permissions');
    expect(Array.isArray(firstGroup.permissions)).toBe(true);

    // Verify backward-compatibility fields
    expect(Array.isArray(res.body.permissions)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('GET /admin/permissions as institution_admin returns ONLY institution-relevant modules and permissions', async () => {
    if (!dbReady || !institutionAdminToken) return;

    const res = await request(app)
      .get('/admin/permissions')
      .set('Authorization', `Bearer ${institutionAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const moduleKeys = res.body.data.map((m) => m.module);

    // Should NOT contain excluded modules
    expect(moduleKeys).not.toContain('ocr');
    expect(moduleKeys).not.toContain('institutions');
    expect(moduleKeys).not.toContain('system');
    expect(moduleKeys).not.toContain('posts');
    expect(moduleKeys).not.toContain('support');
    expect(moduleKeys).not.toContain('general');

    // Collect all permission names returned in all modules
    const allPermNames = [];
    for (const group of res.body.data) {
      for (const p of group.permissions) {
        allPermNames.push(p.name);
      }
    }

    // Explicitly forbidden permissions must NOT appear
    const forbidden = [
      'ocr.create',
      'ocr.manual_entry',
      'ocr.read',
      'ocr.read.any',
      'ocr.requirement.bind',
      'institutions.create',
      'institutions.delete',
      'institutions.update',
      'institutions.view',
      'system.admin',
      'system.config',
      'system.logs',
      'posts.manage',
      'support.manage',
      'support.view',
      'profiles.jupeb_university_id',
      'jupeb.catalog.manage',
      'jupeb.finance.manage',
    ];
    for (const f of forbidden) {
      expect(allPermNames).not.toContain(f);
    }

    // Check that expected institution permissions are present
    expect(allPermNames).toEqual(
      expect.arrayContaining([
        'candidate.create',
        'candidate.view',
        'results.view',
        'reports.view',
      ])
    );
  });

  it('GET /admin/permissions?role=institution_admin filters permissions even when called by super_admin', async () => {
    if (!dbReady || !adminToken) return;

    const res = await request(app)
      .get('/admin/permissions?role=institution_admin')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const moduleKeys = res.body.data.map((m) => m.module);
    expect(moduleKeys).not.toContain('ocr');
    expect(moduleKeys).not.toContain('institutions');
    expect(moduleKeys).not.toContain('system');
    expect(moduleKeys).not.toContain('posts');

    const allPermNames = res.body.permissions.map((p) => p.name);
    expect(allPermNames).not.toContain('ocr.create');
    expect(allPermNames).not.toContain('institutions.create');
    expect(allPermNames).toContain('candidate.create');
  });

  it('GET /admin/permissions?group_by=flat returns a flat array of permissions for institution_admin', async () => {
    if (!dbReady || !institutionAdminToken) return;

    const res = await request(app)
      .get('/admin/permissions?group_by=flat')
      .set('Authorization', `Bearer ${institutionAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    // Each item in data should be a flat permission object, not a module group
    const first = res.body.data[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('module');

    const names = res.body.data.map((p) => p.name);
    expect(names).not.toContain('ocr.create');
    expect(names).not.toContain('institutions.create');
    expect(names).toContain('candidate.create');
  });

  it('GET /admin/permissions?group_by=role returns role-grouped permissions with filtered permissions for institution_admin', async () => {
    if (!dbReady || !institutionAdminToken) return;

    const res = await request(app)
      .get('/admin/permissions?group_by=role')
      .set('Authorization', `Bearer ${institutionAdminToken}`);

    const roleNames = res.body.data.map((rg) => rg.role_name);
    // Non-registrar roles must not be present
    expect(roleNames).not.toContain('super_admin');
    expect(roleNames).not.toContain('admin');
    expect(roleNames).not.toContain('student');
    expect(roleNames).not.toContain('user');
    expect(roleNames).not.toContain('agent');
    expect(roleNames).not.toContain('financial_admin');

    for (const roleGroup of res.body.data) {
      const pNames = (roleGroup.permissions || []).map((p) => p.name);
      expect(pNames).not.toContain('ocr.create');
      expect(pNames).not.toContain('institutions.create');
      expect(pNames).not.toContain('system.admin');
      expect(pNames).not.toContain('posts.manage');
      expect(pNames).not.toContain('support.manage');
      expect(pNames).not.toContain('support.view');
      expect(pNames).not.toContain('profiles.jupeb_university_id');
    }
  });

  it('GET /admin/permissions?role=registrar filters out OCR, posts, support, general, institutions, and system', async () => {
    if (!dbReady || !adminToken) return;

    const res = await request(app)
      .get('/admin/permissions?role=registrar')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const moduleKeys = res.body.data.map((m) => m.module);
    expect(moduleKeys).not.toContain('ocr');
    expect(moduleKeys).not.toContain('posts');
    expect(moduleKeys).not.toContain('support');
    expect(moduleKeys).not.toContain('general');
    expect(moduleKeys).not.toContain('institutions');
    expect(moduleKeys).not.toContain('system');
  });

  it('GET /permissions alias endpoint behaves identically', async () => {
    if (!dbReady || !institutionAdminToken) return;

    const res = await request(app)
      .get('/permissions')
      .set('Authorization', `Bearer ${institutionAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const moduleKeys = res.body.data.map((m) => m.module);
    expect(moduleKeys).not.toContain('ocr');
    expect(moduleKeys).not.toContain('institutions');
    expect(moduleKeys).not.toContain('posts');
    expect(moduleKeys).not.toContain('support');
    expect(moduleKeys).not.toContain('general');
  });
});
