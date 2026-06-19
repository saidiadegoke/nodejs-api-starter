const rbacModel = require('../models/rbac.model');
const pool = require('../../../db/pool');

function httpError(status, message, details) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

class RbacService {
  // ---------- helpers ----------
  async _enrichRolesWithPermissions(roles) {
    if (!roles.length) return roles;
    const ids = roles.map((r) => r.id);
    const permMap = await rbacModel.getPermissionsForRoles(ids);
    return roles.map((r) => ({ ...r, permissions: permMap.get(r.id) || [] }));
  }

  async _enrichRoleWithPermissions(role) {
    const perms = await rbacModel.listRolePermissions(role.id);
    return { ...role, permissions: perms };
  }

  // ---------- Roles ----------
  async listRoles({ page, limit, q, status, is_system }) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (safePage - 1) * safeLimit;
    const searchTerm = q ? String(q).trim() : null;

    let statusFilter = null;
    if (status !== undefined && status !== null && String(status).trim() !== '') {
      const s = String(status).trim().toLowerCase();
      if (!['active', 'inactive'].includes(s)) {
        throw httpError(422, 'status must be one of: active, inactive');
      }
      statusFilter = s;
    }

    let isSystemFilter = null;
    if (is_system !== undefined && is_system !== null && String(is_system).trim() !== '') {
      const v = String(is_system).trim().toLowerCase();
      if (v === 'true') isSystemFilter = true;
      else if (v === 'false') isSystemFilter = false;
      else throw httpError(422, 'is_system must be true or false');
    }

    const filters = { q: searchTerm, status: statusFilter, is_system: isSystemFilter };
    const rows = await rbacModel.listRoles({ limit: safeLimit, offset, ...filters });
    const enriched = await this._enrichRolesWithPermissions(rows);
    const total = await rbacModel.countRoles(filters);
    return { rows: enriched, page: safePage, limit: safeLimit, total };
  }

  async getRoleById(id) {
    if (!isUuid(id)) throw httpError(422, 'Invalid role id');
    const row = await rbacModel.findRoleById(id);
    if (!row) throw httpError(404, 'Role not found');
    return this._enrichRoleWithPermissions(row);
  }

  async createRole(body) {
    const name = body && body.name ? String(body.name).trim() : '';
    const display_name = body && body.display_name ? String(body.display_name).trim() : '';
    if (!name || !display_name) throw httpError(422, 'name and display_name are required');
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(name)) {
      throw httpError(422, 'name must be lowercase snake_case, 2-50 chars');
    }
    const existing = await rbacModel.findRoleByName(name);
    if (existing) throw httpError(409, 'Role with this name already exists');
    const validStatuses = ['active', 'inactive'];
    const status = body.status && validStatuses.includes(body.status) ? body.status : 'active';

    const permIds = Array.isArray(body.permission_ids) ? body.permission_ids
      : Array.isArray(body.permissions) ? body.permissions
      : [];

    for (const pid of permIds) {
      if (!isUuid(pid)) throw httpError(422, `Invalid permission id: ${pid}`);
      // eslint-disable-next-line no-await-in-loop
      const perm = await rbacModel.findPermissionById(pid);
      if (!perm) throw httpError(404, `Permission not found: ${pid}`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const roleResult = await client.query(
        `INSERT INTO roles (name, display_name, description, is_system, status)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, display_name, body.description ?? null, false, status]
      );
      const role = roleResult.rows[0];

      for (const pid of permIds) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [role.id, pid]
        );
      }
      await client.query('COMMIT');
      return this._enrichRoleWithPermissions(role);
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  }

  async patchRole(id, body) {
    const role = await this.getRoleById(id);
    if (role.is_system) {
      const allowedSystemKeys = ['description', 'display_name', 'status', 'permission_ids', 'permissions'];
      const onlyAllowed = Object.keys(body || {}).every((k) => allowedSystemKeys.includes(k));
      if (!onlyAllowed) {
        throw httpError(422, 'System roles can only have their display_name, description, status, or permissions updated');
      }
    }
    const fields = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!/^[a-z][a-z0-9_]{1,49}$/.test(name)) {
        throw httpError(422, 'name must be lowercase snake_case, 2-50 chars');
      }
      const dup = await rbacModel.findRoleByName(name);
      if (dup && dup.id !== id) throw httpError(409, 'Another role already uses this name');
      fields.name = name;
    }
    if (body.display_name !== undefined) fields.display_name = String(body.display_name).trim();
    if (body.description !== undefined) fields.description = body.description;
    if (body.status !== undefined) {
      const validStatuses = ['active', 'inactive'];
      if (!validStatuses.includes(body.status)) {
        throw httpError(422, 'status must be one of: active, inactive');
      }
      fields.status = body.status;
    }
    const updated = await rbacModel.updateRole(id, fields);

    const permIds = Array.isArray(body.permission_ids) ? body.permission_ids
      : Array.isArray(body.permissions) ? body.permissions
      : null;
    if (permIds !== null) {
      await rbacModel.replaceRolePermissions(id, permIds);
    }

    return this._enrichRoleWithPermissions(updated);
  }

  async deleteRole(id) {
    const role = await this.getRoleById(id);
    if (role.is_system) throw httpError(422, 'System roles cannot be deleted');
    const ok = await rbacModel.deleteRole(id);
    if (!ok) throw httpError(404, 'Role not found');
  }

  // ---------- Permissions ----------
  async listPermissions({ page, limit, resource, group_by, q }) {
    if (group_by === 'role') {
      const safePage = Math.max(1, parseInt(page, 10) || 1);
      const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
      const offset = (safePage - 1) * safeLimit;
      const searchTerm = q ? String(q).trim() : null;
      const rows = await rbacModel.listPermissionsGroupedByRole({ limit: safeLimit, offset, q: searchTerm });
      const total = await rbacModel.countRolesGrouped({ q: searchTerm });
      return { grouped: true, rows, page: safePage, limit: safeLimit, total };
    }
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 100));
    const offset = (safePage - 1) * safeLimit;
    const rows = await rbacModel.listPermissions({ limit: safeLimit, offset, resource: resource || null });
    const total = await rbacModel.countPermissions({ resource: resource || null });
    return { grouped: false, rows, page: safePage, limit: safeLimit, total };
  }

  async getPermissionById(id) {
    if (!isUuid(id)) throw httpError(422, 'Invalid permission id');
    const row = await rbacModel.findPermissionById(id);
    if (!row) throw httpError(404, 'Permission not found');
    return row;
  }

  async createPermission(body) {
    const resource = body && body.resource ? String(body.resource).trim() : '';
    const action = body && body.action ? String(body.action).trim() : '';
    let name = body && body.name ? String(body.name).trim() : '';
    if (!resource || !action) throw httpError(422, 'resource and action are required');
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(resource) || !/^[a-z][a-z0-9_]{1,49}$/.test(action)) {
      throw httpError(422, 'resource and action must be lowercase snake_case, 2-50 chars');
    }
    if (!name) name = `${resource}:${action}`;
    const existing = await rbacModel.findPermissionByName(name);
    if (existing) throw httpError(409, 'Permission with this name already exists');
    try {
      return await rbacModel.createPermission({
        name,
        resource,
        action,
        description: body.description ?? null,
      });
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'Permission with this resource+action already exists');
      throw e;
    }
  }

  async patchPermission(id, body) {
    await this.getPermissionById(id);
    const fields = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      const dup = await rbacModel.findPermissionByName(name);
      if (dup && dup.id !== id) throw httpError(409, 'Another permission already uses this name');
      fields.name = name;
    }
    if (body.resource !== undefined) fields.resource = body.resource;
    if (body.action !== undefined) fields.action = body.action;
    if (body.description !== undefined) fields.description = body.description;
    try {
      return await rbacModel.updatePermission(id, fields);
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'Resource+action conflict');
      throw e;
    }
  }

  async deletePermission(id) {
    await this.getPermissionById(id);
    const ok = await rbacModel.deletePermission(id);
    if (!ok) throw httpError(404, 'Permission not found');
  }

  // ---------- Role ↔ Permission ----------
  async listRolePermissions(roleId) {
    await this.getRoleById(roleId);
    return rbacModel.listRolePermissions(roleId);
  }

  async attachPermission(roleId, permissionId) {
    const role = await this.getRoleById(roleId);
    await this.getPermissionById(permissionId);
    const attached = await rbacModel.attachPermissionToRole(roleId, permissionId);
    const permissions = await rbacModel.listRolePermissions(roleId);
    return { attached, role: { ...role, permissions } };
  }

  async detachPermission(roleId, permissionId) {
    const role = await this.getRoleById(roleId);
    await this.getPermissionById(permissionId);
    const detached = await rbacModel.detachPermissionFromRole(roleId, permissionId);
    const permissions = await rbacModel.listRolePermissions(roleId);
    return { detached, role: { ...role, permissions } };
  }

  // ---------- User ↔ Role ----------
  async listUserRoles(userId) {
    if (!isUuid(userId)) throw httpError(422, 'Invalid user id');
    const u = await pool.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (!u.rows[0]) throw httpError(404, 'User not found');
    return rbacModel.listUserRoles(userId);
  }

  async setUserRoles(userId, body, actorUserId) {
    if (!isUuid(userId)) throw httpError(422, 'Invalid user id');
    const u = await pool.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (!u.rows[0]) throw httpError(404, 'User not found');

    if (!body) throw httpError(422, 'Body is required');

    // Two semantics: "set" replaces; "add"/"remove" mutates additively.
    const replace = Array.isArray(body.role_ids);
    const add = Array.isArray(body.add);
    const remove = Array.isArray(body.remove);
    if (!replace && !add && !remove) {
      throw httpError(422, 'Provide one of role_ids (replace), add, or remove (each as an array of role UUIDs)');
    }

    if (replace) {
      for (const rid of body.role_ids) {
        if (!isUuid(rid)) throw httpError(422, `Invalid role id: ${rid}`);
        // eslint-disable-next-line no-await-in-loop
        const role = await rbacModel.findRoleById(rid);
        if (!role) throw httpError(404, `Role not found: ${rid}`);
      }
      await rbacModel.setUserRoles(userId, body.role_ids, actorUserId);
    }
    if (add) {
      for (const rid of body.add) {
        if (!isUuid(rid)) throw httpError(422, `Invalid role id: ${rid}`);
        // eslint-disable-next-line no-await-in-loop
        const role = await rbacModel.findRoleById(rid);
        if (!role) throw httpError(404, `Role not found: ${rid}`);
        // eslint-disable-next-line no-await-in-loop
        await rbacModel.addUserRole(userId, rid, actorUserId);
      }
    }
    if (remove) {
      for (const rid of body.remove) {
        if (!isUuid(rid)) throw httpError(422, `Invalid role id: ${rid}`);
        // eslint-disable-next-line no-await-in-loop
        await rbacModel.removeUserRole(userId, rid);
      }
    }
    return rbacModel.listUserRoles(userId);
  }
}

module.exports = new RbacService();
