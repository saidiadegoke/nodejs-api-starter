const router = require('express').Router();
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');
const DashboardController = require('../controllers/dashboard.controller');

const dashboardRead = [
  requireAuth,
  requireRole('admin', 'super_admin', 'registrar', 'program_director', 'institution_admin'),
];

router.get('/scope', dashboardRead, DashboardController.getScope);
router.get('/stat-cards', dashboardRead, DashboardController.getStatCards);
router.get('/quick-stats', dashboardRead, DashboardController.getQuickStats);
router.get('/students-status', dashboardRead, DashboardController.getStudentsStatus);
router.get('/registration-trends', dashboardRead, DashboardController.getRegistrationTrends);
router.get('/subject-enrollment', dashboardRead, DashboardController.getSubjectEnrollment);
router.get('/recent-registrations', dashboardRead, DashboardController.getRecentRegistrations);

module.exports = router;
