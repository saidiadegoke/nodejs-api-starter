const rbacService = require('../services/rbac.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../shared/utils/response');
const { CREATED, INTERNAL_SERVER_ERROR } = require('../../../shared/constants/statusCodes');

class RbacController {
  // Roles
  static async listRoles(req, res) {
    try {
      const { rows, page, limit, total } = await rbacService.listRoles({
        page: req.query.page,
        limit: req.query.limit,
      });
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getRole(req, res) {
    try {
      const role = await rbacService.getRoleById(req.params.roleId);
      return sendSuccess(res, role, 'Role retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async createRole(req, res) {
    try {
      const role = await rbacService.createRole(req.body);
      return sendSuccess(res, role, 'Role created', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async patchRole(req, res) {
    try {
      const role = await rbacService.patchRole(req.params.roleId, req.body);
      return sendSuccess(res, role, 'Role updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async deleteRole(req, res) {
    try {
      await rbacService.deleteRole(req.params.roleId);
      return sendSuccess(res, null, 'Role deleted');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // Permissions
  static async listPermissions(req, res) {
    try {
      const result = await rbacService.listPermissions({
        page: req.query.page,
        limit: req.query.limit,
        resource: req.query.resource,
        group_by: req.query.group_by,
      });
      if (result.grouped) {
        return sendSuccess(res, result.rows, 'Permissions grouped by role');
      }
      return sendPaginated(res, result.rows, result.page, result.limit, result.total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getPermission(req, res) {
    try {
      const p = await rbacService.getPermissionById(req.params.permissionId);
      return sendSuccess(res, p, 'Permission retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async createPermission(req, res) {
    try {
      const p = await rbacService.createPermission(req.body);
      return sendSuccess(res, p, 'Permission created', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async patchPermission(req, res) {
    try {
      const p = await rbacService.patchPermission(req.params.permissionId, req.body);
      return sendSuccess(res, p, 'Permission updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async deletePermission(req, res) {
    try {
      await rbacService.deletePermission(req.params.permissionId);
      return sendSuccess(res, null, 'Permission deleted');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // Role <-> Permission
  static async listRolePermissions(req, res) {
    try {
      const rows = await rbacService.listRolePermissions(req.params.roleId);
      return sendSuccess(res, rows, 'Role permissions retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async attachPermission(req, res) {
    try {
      const ok = await rbacService.attachPermission(req.params.roleId, req.params.permissionId);
      return sendSuccess(res, { attached: ok }, ok ? 'Permission attached' : 'Already attached');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async detachPermission(req, res) {
    try {
      const ok = await rbacService.detachPermission(req.params.roleId, req.params.permissionId);
      return sendSuccess(res, { detached: ok }, ok ? 'Permission detached' : 'Was not attached');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // User <-> Role
  static async listUserRoles(req, res) {
    try {
      const rows = await rbacService.listUserRoles(req.params.userId);
      return sendSuccess(res, rows, 'User roles retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async setUserRoles(req, res) {
    try {
      const rows = await rbacService.setUserRoles(req.params.userId, req.body, req.user.user_id);
      return sendSuccess(res, rows, 'User roles updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = RbacController;
