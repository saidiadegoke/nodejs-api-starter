const router = require('express').Router();
const AdminAuditController = require('./controllers/adminAudit.controller');
const {
  requireAuth,
  requirePermission,
} = require('../../shared/middleware/rbac.middleware');

/** GET /audit/export — CSV export of audit logs (requires activity_logs.view) */
router.get('/export', requireAuth, requirePermission('activity_logs.view'), AdminAuditController.exportCsv);

/** GET /audit — paginated audit log (requires activity_logs.view) */
router.get('/', requireAuth, requirePermission('activity_logs.view'), AdminAuditController.list);

module.exports = router;
