const router = require('express').Router();
const AdminErrorLogController = require('./controllers/adminErrorLog.controller');
const AdminSettingsController = require('./controllers/adminSettings.controller');
const AdminAuditController = require('./controllers/adminAudit.controller');
const RbacController = require('./controllers/rbac.controller');
const AdminUsersController = require('./controllers/adminUsers.controller');
const UserController = require('../users/controllers/user.controller');
const {
  requireAuth,
  requirePermission,
} = require('../../shared/middleware/rbac.middleware');

// ============================================================================
// Error / Request logs
// ============================================================================

/** GET /admin/error-logs/stats — aggregate error + traffic stats */
router.get('/error-logs/stats', requireAuth, requirePermission('system.logs'), AdminErrorLogController.getStats);

/** GET /admin/error-logs — paginated list (filter by type/method/path/from/to) */
router.get('/error-logs', requireAuth, requirePermission('system.logs'), AdminErrorLogController.list);

/** GET /admin/error-logs/:id — full log entry with bodies */
router.get('/error-logs/:id', requireAuth, requirePermission('system.logs'), AdminErrorLogController.getById);

// ============================================================================
// Platform settings (runtime config / feature flags)
// ============================================================================

/** GET /admin/settings — list all settings */
router.get('/settings', requireAuth, requirePermission('system.config'), AdminSettingsController.getAll);

/** PUT /admin/settings — upsert a setting (body: { key, value, description? }) */
router.put('/settings', requireAuth, requirePermission('system.config'), AdminSettingsController.update);

// ============================================================================
// Audit log
// ============================================================================

/** GET /admin/audit — paginated audit log */
router.get('/audit', requireAuth, requirePermission('activity_logs.view'), AdminAuditController.list);

// ============================================================================
// RBAC: roles, permissions, user-role assignment
// ============================================================================

router.get('/roles', requireAuth, requirePermission('roles.view'), RbacController.listRoles);
router.post('/roles', requireAuth, requirePermission('roles.create'), RbacController.createRole);
router.get('/roles/:roleId', requireAuth, requirePermission('roles.view'), RbacController.getRole);
router.patch('/roles/:roleId', requireAuth, requirePermission('roles.update'), RbacController.patchRole);
router.delete('/roles/:roleId', requireAuth, requirePermission('roles.delete'), RbacController.deleteRole);

router.get('/roles/:roleId/permissions', requireAuth, requirePermission('roles.view'), RbacController.listRolePermissions);
router.post(
  '/roles/:roleId/permissions/:permissionId',
  requireAuth,
  requirePermission('roles.update'),
  RbacController.attachPermission
);
router.delete(
  '/roles/:roleId/permissions/:permissionId',
  requireAuth,
  requirePermission('roles.update'),
  RbacController.detachPermission
);

router.get('/permissions', requireAuth, requirePermission('permissions.view'), RbacController.listPermissions);
router.post('/permissions', requireAuth, requirePermission('system.admin'), RbacController.createPermission);
router.get('/permissions/:permissionId', requireAuth, requirePermission('permissions.view'), RbacController.getPermission);
router.patch('/permissions/:permissionId', requireAuth, requirePermission('system.admin'), RbacController.patchPermission);
router.delete('/permissions/:permissionId', requireAuth, requirePermission('system.admin'), RbacController.deletePermission);

/** GET /admin/users/stats — aggregate user + role management stats */
router.get('/users/stats', requireAuth, requirePermission('users.view'), AdminUsersController.getStats);

router.get('/users/:userId/roles', requireAuth, requirePermission('roles.view'), RbacController.listUserRoles);
router.patch('/users/:userId/roles', requireAuth, requirePermission('roles.update'), RbacController.setUserRoles);

// ============================================================================
// Admin users
// ============================================================================

/** GET /admin/users/:userId — single user detail (requires users.view) */
router.get(
  '/users/:userId',
  requireAuth,
  requirePermission('users.view'),
  UserController.getUserById
);

/** PATCH /admin/users/:userId — update a user (requires users.update) */
router.patch(
  '/users/:userId',
  requireAuth,
  requirePermission('users.update'),
  UserController.updateUser
);

/** DELETE /admin/users/:userId — soft-delete a user (requires users.delete) */
router.delete(
  '/users/:userId',
  requireAuth,
  requirePermission('users.delete'),
  UserController.deleteUser
);

/** GET /admin/users — paginated user list (requires users.view) */
router.get(
  '/users',
  requireAuth,
  requirePermission('users.view'),
  UserController.getAllUsers
);

// ============================================================================
// Admin user creation (with university association)
// ============================================================================

/**
 * POST /admin/users
 * Create a user and atomically bind them to a JUPEB university.
 * Gated by the `users.create` permission (granted to admin/super_admin
 * via roles; can also be granted directly to any other user via
 * user_permissions). Single-uni-per-user is enforced by
 * user_universities' partial unique index on (user_id, is_primary=true).
 */
router.post(
  '/users',
  requireAuth,
  requirePermission('users.create'),
  AdminUsersController.createUserWithUniversity
);

module.exports = router;
