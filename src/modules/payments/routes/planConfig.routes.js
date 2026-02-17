const express = require('express');
const router = express.Router();
const PlanConfigController = require('../controllers/planConfig.controller');
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');

// All routes require authentication and admin role
router.use(requireAuth);
router.use((req, res, next) => requireRole('admin', 'super_admin')(req, res, next));

// Get all plan configurations
router.get('/', PlanConfigController.getAll);

// Get plan configuration by type
router.get('/:planType', PlanConfigController.getByType);

// Create plan configuration
router.post('/', PlanConfigController.create);

// Update plan configuration
router.put('/:planType', PlanConfigController.update);

// Toggle plan active status
router.patch('/:planType/toggle-active', PlanConfigController.toggleActive);

// Delete plan configuration
router.delete('/:planType', PlanConfigController.delete);

// Clear cache
router.post('/clear-cache', PlanConfigController.clearCache);

module.exports = router;

