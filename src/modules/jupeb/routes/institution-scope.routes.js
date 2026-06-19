const router = require('express').Router();
const { requireAuth, requirePermission } = require('../../../shared/middleware/rbac.middleware');
const InstitutionScopeController = require('../controllers/institution-scope.controller');

const jupebScopeAdmin = [
  requireAuth,
  requirePermission('profiles.jupeb_university_id'),
];

router.patch('/admin/users/:userId/jupeb-university', jupebScopeAdmin, InstitutionScopeController.patchUserJupebUniversity);

module.exports = router;
