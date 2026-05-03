const pool = require('../../../db/pool');

class RbacModel {
  // ---------- Roles ----------
  async listRoles({ limit, offset }) {
    const r = await pool.query(
      `SELECT id, name, display_name, description, is_system, created_at, updated_at
       FROM roles
       ORDER BY is_system DESC, name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return r.rows;
  }

  async countRoles() {
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM roles`);
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

  async createRole({ name, display_name, description = null, is_system = false }) {
    const r = await pool.query(
      `INSERT INTO roles (name, display_name, description, is_system)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), display_name.trim(), description ? String(description).trim() : null, is_system]
    );
    return r.rows[0];
  }

  async updateRole(id, fields) {
    const allowed = ['name', 'display_name', 'description'];
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

  async listPermissionsGroupedByRole() {
    const r = await pool.query(
      `SELECT r.id AS role_id, r.name AS role_name, r.display_name,
              p.id AS permission_id, p.name AS permission_name, p.resource, p.action
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       ORDER BY r.name ASC, p.resource ASC, p.action ASC`
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
