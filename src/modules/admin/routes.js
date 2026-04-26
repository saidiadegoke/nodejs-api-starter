const router = require('express').Router();
const AdminErrorLogController = require('./controllers/adminErrorLog.controller');
const AdminSettingsController = require('./controllers/adminSettings.controller');
const AdminAuditController = require('./controllers/adminAudit.controller');
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

module.exports = router;
