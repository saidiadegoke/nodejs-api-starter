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

// Donut chart on the Dashboard Overview screen.
router.get('/institution-distribution', dashboardRead, DashboardController.getInstitutionDistribution);
// Line chart — "Institution onboarding Trends" on the Institution Management screen.
router.get('/institution-trends', dashboardRead, DashboardController.getInstitutionTrends);
// Distribution — enrollment share across subject combinations.
router.get('/subject-combination-distribution', dashboardRead, DashboardController.getSubjectCombinationDistribution);
// Bar — enrollment counted by individual subject.
router.get('/enrollment-by-subject', dashboardRead, DashboardController.getEnrollmentBySubject);
// Registration Timeline card on the Registration Management screen
// (opens_at / closes_at / now / within_window).
router.get('/session-timeline', dashboardRead, DashboardController.getSessionTimeline);

module.exports = router;
