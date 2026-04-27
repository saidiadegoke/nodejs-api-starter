const router = require('express').Router();
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');
const SessionController = require('../controllers/session.controller');

const sessionRead = [requireAuth];
const sessionWrite = [requireAuth, requireRole('admin', 'super_admin', 'registrar')];
const superAdminOnly = [requireAuth, requireRole('super_admin')];

router.get('/', sessionRead, SessionController.list);
router.post('/', sessionWrite, SessionController.create);

router.get('/:sessionId/stats', sessionRead, SessionController.stats);
router.post('/:sessionId/open', sessionWrite, SessionController.open);
router.post('/:sessionId/close', sessionWrite, SessionController.close);
router.post('/:sessionId/reopen', superAdminOnly, SessionController.reopen);
router.post('/:sessionId/finalize-candidate-numbers', sessionWrite, SessionController.finalize);

router.get('/:sessionId', sessionRead, SessionController.getById);
router.patch('/:sessionId', sessionWrite, SessionController.patch);

module.exports = router;
