const router = require('express').Router();
const { requireAuth, requirePermission } = require('../../../shared/middleware/rbac.middleware');
const SessionController = require('../controllers/session.controller');

const sessionRead = [requireAuth];
const sessionWrite = [requireAuth, requirePermission('sessions.update')];
const superAdminOnly = [requireAuth, requirePermission('system.admin')];

router.get('/', sessionRead, SessionController.list);
router.get('/export', sessionWrite, SessionController.exportCsv);
router.post('/', sessionWrite, SessionController.create);

// Bulk finalize across every closed session — declared BEFORE the
// `:sessionId/...` block so Express doesn't capture
// `finalize-all-closed` as a session id.
router.post('/finalize-all-closed', sessionWrite, SessionController.finalizeAllClosed);

router.get('/:sessionId/stats', sessionRead, SessionController.stats);
router.post('/:sessionId/open', sessionWrite, SessionController.open);
router.post('/:sessionId/close', sessionWrite, SessionController.close);
router.post('/:sessionId/reopen', superAdminOnly, SessionController.reopen);
router.post('/:sessionId/finalize-candidate-numbers', sessionWrite, SessionController.finalize);

router.get('/:sessionId', sessionRead, SessionController.getById);
router.patch('/:sessionId', sessionWrite, SessionController.patch);

module.exports = router;
