const router = require('express').Router();
const { requireAuth, requireRole, requireRoleOrPermission } = require('../../../utils/middleware/rbac.middleware');
const { jupebStudentMiddleware } = require('../middleware/jupeb-student.middleware');
const ResultsReleaseController = require('../controllers/results-release.controller');
const StudentDashboardController = require('../controllers/student-dashboard.controller');

const registrarOrSendResult = [
  requireAuth,
  requireRoleOrPermission(
    ['registrar', 'super_admin', 'admin'],
    ['results.send', 'send.result', 'jupeb.academic.manage', 'system.admin']
  ),
];

const institutionStaffOrResultView = [
  requireAuth,
  requireRoleOrPermission(
    ['program_director', 'institution_admin', 'registrar', 'admin', 'super_admin'],
    ['results.view', 'results.send', 'send.result']
  ),
];

const institutionStaffOrSendResult = [
  requireAuth,
  requireRoleOrPermission(
    ['program_director', 'institution_admin', 'registrar', 'admin', 'super_admin'],
    ['results.send', 'send.result']
  ),
];

const jupebStudent = jupebStudentMiddleware();

// Tier 1: Registrar releases session results to institutions
router.post('/admin/results/release-to-institutions', registrarOrSendResult, ResultsReleaseController.releaseToInstitutions);
router.post('/results/release-to-institutions', registrarOrSendResult, ResultsReleaseController.releaseToInstitutions);
router.post('/sessions/:sessionId/release-results-to-institutions', registrarOrSendResult, ResultsReleaseController.releaseToInstitutions);

// Tier 2: Institution views results and releases to students
router.get('/institution/results', institutionStaffOrResultView, ResultsReleaseController.getInstitutionResults);
router.get('/institution/sessions/:sessionId/results', institutionStaffOrResultView, ResultsReleaseController.getInstitutionResults);
router.post('/institution/results/release-to-students', institutionStaffOrSendResult, ResultsReleaseController.releaseToStudents);
router.post('/institution/sessions/:sessionId/results/release-to-students', institutionStaffOrSendResult, ResultsReleaseController.releaseToStudents);

// Direct student route alias (alongside /dashboard/results)
router.get('/students/me/results', jupebStudent, StudentDashboardController.getResults);

module.exports = router;
