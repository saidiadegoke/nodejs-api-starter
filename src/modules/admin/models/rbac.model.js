const pool = require('../../../db/pool');
const { INSTITUTION_ASSIGNABLE_SYSTEM_ROLES } = require('../utils/admin-rbac-scope');

class RbacModel {
  // ---------- Roles ----------
  _roleListFilters({ q, status, is_system, scope } = {}) {
    const conditions = [];
    const values = [];
    let idx = 1;
    if (q) {
      conditions.push(
        `(name ILIKE $${idx} OR display_name ILIKE $${idx} OR COALESCE(description, '') ILIKE $${idx})`
      );
      values.push(`%${q}%`);
      idx++;
    }
    if (status) {
      conditions.push(`status = $${idx}`);
      values.push(status);
      idx++;
    }
    if (is_system !== null && is_system !== undefined) {
      conditions.push(`is_system = $${idx}`);
      values.push(is_system);
      idx++;
    }
    if (scope && scope.mode === 'institution') {
      const assignable = [...INSTITUTION_ASSIGNABLE_SYSTEM_ROLES];
      conditions.push(
        `(
          owner_jupeb_university_id = $${idx}
          OR created_by = $${idx + 1}
          OR (is_system = true AND name = ANY($${idx + 2}::text[]))
        )`
      );
      values.push(scope.universityId, scope.actorId, assignable);
      idx += 3;
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, values, nextIdx: idx };
  }

  async listRoles({ limit, offset, q, status, is_system, scope }) {
    const { whereClause, values, nextIdx } = this._roleListFilters({ q, status, is_system, scope });
    values.push(limit, offset);
    const r = await pool.query(
      `SELECT id, name, display_name, description, is_system, status,
              created_by, owner_jupeb_university_id, created_at, updated_at
       FROM roles
       ${whereClause}
       ORDER BY is_system DESC, name ASC
       LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      values
    );
    return r.rows;
  }

  async countRoles({ q, status, is_system, scope } = {}) {
    const { whereClause, values } = this._roleListFilters({ q, status, is_system, scope });
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM roles ${whereClause}`, values);
    return r.rows[0].c;
  }

  async findRoleById(id) {
    const r = await pool.query(`SELECT * FROM roles WHERE id = $1`, [id]);
    return r.rows[0] || null;
  }

  async findRoleByName(name) {
    const r = await pool.query(`SELECT * FROM roles WHERE LOWER(name) = LOWER($1)`, [String(name).trim()]);
    return r.rows[0] || null;
  }

  async findRoleByNameForScope(name, scope = { mode: 'full' }) {
    const normalized = String(name).trim();
    if (scope && scope.mode === 'institution') {
      const r = await pool.query(
        `SELECT *
           FROM roles
          WHERE LOWER(name) = LOWER($1)
          ORDER BY
            CASE
              WHEN owner_jupeb_university_id = $2 THEN 0
              WHEN created_by = $3 AND is_system = false THEN 1
              WHEN is_system = true THEN 2
              ELSE 3
            END,
            created_at ASC
          LIMIT 1`,
        [normalized, scope.universityId, scope.actorId]
      );
      return r.rows[0] || null;
    }

    const r = await pool.query(
      `SELECT *
         FROM roles
        WHERE LOWER(name) = LOWER($1)
          AND owner_jupeb_university_id IS NULL
        ORDER BY is_system DESC, created_at ASC
        LIMIT 1`,
      [normalized]
    );
    return r.rows[0] || null;
  }

  async findRoleNameConflictForScope(name, scope = { mode: 'full' }) {
    const normalized = String(name).trim();
    if (scope && scope.mode === 'institution') {
      const r = await pool.query(
        `SELECT *
           FROM roles
          WHERE LOWER(name) = LOWER($1)
            AND (
              owner_jupeb_university_id = $2
              OR (owner_jupeb_university_id IS NULL AND created_by = $3)
            )
          LIMIT 1`,
        [normalized, scope.universityId, scope.actorId]
      );
      return r.rows[0] || null;
    }

    const r = await pool.query(
      `SELECT *
         FROM roles
        WHERE LOWER(name) = LOWER($1)
          AND owner_jupeb_university_id IS NULL
        LIMIT 1`,
      [normalized]
    );
    return r.rows[0] || null;
  }

  async createRole({
    name,
    display_name,
    description = null,
    is_system = false,
    status = 'active',
    created_by = null,
    owner_jupeb_university_id = null,
  }) {
    const r = await pool.query(
      `INSERT INTO roles (name, display_name, description, is_system, status, created_by, owner_jupeb_university_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name.trim(),
        display_name.trim(),
        description ? String(description).trim() : null,
        is_system,
        status,
        created_by,
        owner_jupeb_university_id,
      ]
    );
    return r.rows[0];
  }

  async updateRole(id, fields) {
    const allowed = ['name', 'display_name', 'description', 'status'];
    const sets = [];
    const values = [];
    let i = 1;
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        sets.push(`${k} = $${i++}`);
        values.push(typeof fields[k] === 'string' ? fields[k].trim() : fields[k]);
      }
    }
    if (!sets.length) return this.findRoleById(id);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const r = await pool.query(
      `UPDATE roles SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return r.rows[0] || null;
  }

  async deleteRole(id) {
    const r = await pool.query(`DELETE FROM roles WHERE id = $1 AND is_system = false RETURNING id`, [id]);
    return r.rowCount > 0;
  }

  // ---------- Permissions ----------
  async listPermissions({ limit, offset, resource }) {
    const values = [];
    let idx = 1;
    let q = `SELECT id, name, resource, action, description, created_at FROM permissions`;
    if (resource) {
      q += ` WHERE resource = $${idx++}`;
      values.push(resource);
    }
    q += ` ORDER BY resource ASC, action ASC LIMIT $${idx++} OFFSET $${idx++}`;
    values.push(limit, offset);
    const r = await pool.query(q, values);
    return r.rows;
  }

  async countPermissions({ resource } = {}) {
    if (resource) {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM permissions WHERE resource = $1`, [resource]);
      return r.rows[0].c;
    }
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM permissions`);
    return r.rows[0].c;
  }

  async findPermissionById(id) {
    const r = await pool.query(`SELECT * FROM permissions WHERE id = $1`, [id]);
    return r.rows[0] || null;
  }

  async findPermissionByName(name) {
    const r = await pool.query(`SELECT * FROM permissions WHERE LOWER(name) = LOWER($1)`, [String(name).trim()]);
    return r.rows[0] || null;
  }

  async createPermission({ name, resource, action, description = null }) {
    const r = await pool.query(
      `INSERT INTO permissions (name, resource, action, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), resource.trim(), action.trim(), description ? String(description).trim() : null]
    );
    return r.rows[0];
  }

  async updatePermission(id, fields) {
    const allowed = ['name', 'resource', 'action', 'description'];
    const sets = [];
    const values = [];
    let i = 1;
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        sets.push(`${k} = $${i++}`);
        values.push(typeof fields[k] === 'string' ? fields[k].trim() : fields[k]);
      }
    }
    if (!sets.length) return this.findPermissionById(id);
    values.push(id);
    const r = await pool.query(
      `UPDATE permissions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return r.rows[0] || null;
  }

  async deletePermission(id) {
    const r = await pool.query(`DELETE FROM permissions WHERE id = $1 RETURNING id`, [id]);
    return r.rowCount > 0;
  }

  // ---------- Role ↔ Permission ----------

  async getPermissionsForRoles(roleIds) {
    if (!roleIds.length) return new Map();
    const r = await pool.query(
      `SELECT rp.role_id, p.id, p.name, p.resource, p.action, p.description
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ANY($1)
       ORDER BY p.resource ASC, p.action ASC`,
      [roleIds]
    );
    const map = new Map();
    for (const id of roleIds) map.set(id, []);
    for (const row of r.rows) {
      map.get(row.role_id).push({
        id: row.id,
        name: row.name,
        resource: row.resource,
        action: row.action,
        description: row.description,
      });
    }
    return map;
  }

  async listRolePermissions(roleId) {
    const r = await pool.query(
      `SELECT p.id, p.name, p.resource, p.action, p.description
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = $1
       ORDER BY p.resource ASC, p.action ASC`,
      [roleId]
    );
    return r.rows;
  }

  async listPermissionsGroupedByRole({ limit, offset, q, scope } = {}) {
    const values = [];
    let idx = 1;

    const conditions = [];
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(`(r.name ILIKE $${idx} OR r.display_name ILIKE $${idx})`);
      values.push(pattern);
      idx++;
    }
    if (scope && scope.mode === 'institution') {
      const assignable = [...INSTITUTION_ASSIGNABLE_SYSTEM_ROLES];
      conditions.push(
        `(
          r.owner_jupeb_university_id = $${idx}
          OR r.created_by = $${idx + 1}
          OR (r.is_system = true AND r.name = ANY($${idx + 2}::text[]))
        )`
      );
      values.push(scope.universityId, scope.actorId, assignable);
      idx += 3;
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const roleIdsResult = await pool.query(
      `SELECT id FROM roles r ${whereClause} ORDER BY r.name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    );
    const roleIds = roleIdsResult.rows.map((row) => row.id);

    if (!roleIds.length) return [];

    const r = await pool.query(
      `SELECT r.id AS role_id, r.name AS role_name, r.display_name,
              p.id AS permission_id, p.name AS permission_name, p.resource, p.action
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.id = ANY($1)
       ORDER BY r.name ASC, p.resource ASC, p.action ASC`,
      [roleIds]
    );

    const grouped = new Map();
    for (const row of r.rows) {
      if (!grouped.has(row.role_id)) {
        grouped.set(row.role_id, {
          role_id: row.role_id,
          role_name: row.role_name,
          display_name: row.display_name,
          permissions: [],
        });
      }
      if (row.permission_id) {
        grouped.get(row.role_id).permissions.push({
          id: row.permission_id,
          name: row.permission_name,
          resource: row.resource,
          action: row.action,
        });
      }
    }
    return [...grouped.values()];
  }

  async countRolesGrouped({ q, scope } = {}) {
    const values = [];
    const conditions = [];
    let idx = 1;
    if (q) {
      conditions.push(`(name ILIKE $${idx} OR display_name ILIKE $${idx})`);
      values.push(`%${q}%`);
      idx++;
    }
    if (scope && scope.mode === 'institution') {
      const assignable = [...INSTITUTION_ASSIGNABLE_SYSTEM_ROLES];
      conditions.push(
        `(
          owner_jupeb_university_id = $${idx}
          OR created_by = $${idx + 1}
          OR (is_system = true AND name = ANY($${idx + 2}::text[]))
        )`
      );
      values.push(scope.universityId, scope.actorId, assignable);
      idx += 3;
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM roles ${whereClause}`, values);
    return r.rows[0].c;
  }

  async attachPermissionToRole(roleId, permissionId) {
    const r = await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [roleId, permissionId]
    );
    return r.rowCount > 0;
  }

  async replaceRolePermissions(roleId, permissionIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
      for (const pid of permissionIds) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [roleId, pid]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  }

  async detachPermissionFromRole(roleId, permissionId) {
    const r = await pool.query(
      `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2 RETURNING id`,
      [roleId, permissionId]
    );
    return r.rowCount > 0;
  }

  // ---------- User ↔ Role ----------
  async listUserRoles(userId) {
    const r = await pool.query(
      `SELECT r.id, r.name, r.display_name, r.description, r.is_system, ur.assigned_at, ur.expires_at
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1
         AND (ur.expires_at IS NULL OR ur.expires_at > CURRENT_TIMESTAMP)
       ORDER BY r.is_system DESC, r.name ASC`,
      [userId]
    );
    return r.rows;
  }

  async setUserRoles(userId, roleIds, assignedBy) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
      for (const rid of roleIds) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `INSERT INTO user_roles (user_id, role_id, assigned_by)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [userId, rid, assignedBy || null]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  }

  async addUserRole(userId, roleId, assignedBy) {
    const r = await pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [userId, roleId, assignedBy || null]
    );
    return r.rowCount > 0;
  }

  async removeUserRole(userId, roleId) {
    const r = await pool.query(
      `DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2 RETURNING id`,
      [userId, roleId]
    );
    return r.rowCount > 0;
  }
}

module.exports = new RbacModel();
