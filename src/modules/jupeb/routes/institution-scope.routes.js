const router = require('express').Router();
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');
const InstitutionScopeController = require('../controllers/institution-scope.controller');

const jupebScopeAdmin = [
  requireAuth,
  requireRole('admin', 'super_admin', 'registrar'),
];

router.patch('/admin/users/:userId/jupeb-university', jupebScopeAdmin, InstitutionScopeController.patchUserJupebUniversity);

module.exports = router;
