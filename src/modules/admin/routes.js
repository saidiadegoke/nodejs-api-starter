const router = require('express').Router();
const AdminErrorLogController = require('./controllers/adminErrorLog.controller');
const AdminSettingsController = require('./controllers/adminSettings.controller');
const AdminAuditController = require('./controllers/adminAudit.controller');
const RbacController = require('./controllers/rbac.controller');
const { requireAuth, requireRole } = require('../../shared/middleware/rbac.middleware');

const requireAdmin = requireRole('admin', 'super_admin');

// ============================================================================
// Error / Request logs
// ============================================================================

/** GET /admin/error-logs/stats — aggregate error + traffic stats */
router.get('/error-logs/stats', requireAuth, requireAdmin, AdminErrorLogController.getStats);

/** GET /admin/error-logs — paginated list (filter by type/method/path/from/to) */
router.get('/error-logs', requireAuth, requireAdmin, AdminErrorLogController.list);

/** GET /admin/error-logs/:id — full log entry with bodies */
router.get('/error-logs/:id', requireAuth, requireAdmin, AdminErrorLogController.getById);

// ============================================================================
// Platform settings (runtime config / feature flags)
// ============================================================================

/** GET /admin/settings — list all settings */
router.get('/settings', requireAuth, requireAdmin, AdminSettingsController.getAll);

/** PUT /admin/settings — upsert a setting (body: { key, value, description? }) */
router.put('/settings', requireAuth, requireAdmin, AdminSettingsController.update);

// ============================================================================
// Audit log
// ============================================================================

/** GET /admin/audit — paginated audit log */
router.get('/audit', requireAuth, requireAdmin, AdminAuditController.list);

// ============================================================================
// RBAC: roles, permissions, user-role assignment
// ============================================================================

router.get('/roles', requireAuth, requireAdmin, RbacController.listRoles);
router.post('/roles', requireAuth, requireAdmin, RbacController.createRole);
router.get('/roles/:roleId', requireAuth, requireAdmin, RbacController.getRole);
router.patch('/roles/:roleId', requireAuth, requireAdmin, RbacController.patchRole);
router.delete('/roles/:roleId', requireAuth, requireAdmin, RbacController.deleteRole);

router.get('/roles/:roleId/permissions', requireAuth, requireAdmin, RbacController.listRolePermissions);
router.post(
  '/roles/:roleId/permissions/:permissionId',
  requireAuth,
  requireAdmin,
  RbacController.attachPermission
);
router.delete(
  '/roles/:roleId/permissions/:permissionId',
  requireAuth,
  requireAdmin,
  RbacController.detachPermission
);

router.get('/permissions', requireAuth, requireAdmin, RbacController.listPermissions);
router.post('/permissions', requireAuth, requireAdmin, RbacController.createPermission);
router.get('/permissions/:permissionId', requireAuth, requireAdmin, RbacController.getPermission);
router.patch('/permissions/:permissionId', requireAuth, requireAdmin, RbacController.patchPermission);
router.delete('/permissions/:permissionId', requireAuth, requireAdmin, RbacController.deletePermission);

router.get('/users/:userId/roles', requireAuth, requireAdmin, RbacController.listUserRoles);
router.patch('/users/:userId/roles', requireAuth, requireAdmin, RbacController.setUserRoles);

module.exports = router;
