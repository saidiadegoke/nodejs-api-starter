const router = require('express').Router();
const { requireAuth, requireRole } = require('../../../utils/middleware/rbac.middleware');
const { jupebStudentMiddleware } = require('../middleware/jupeb-student.middleware');
const ResultsReleaseController = require('../controllers/results-release.controller');
const StudentDashboardController = require('../controllers/student-dashboard.controller');

const registrarOnly = [
  requireAuth,
  requireRole('registrar', 'super_admin', 'admin'),
];

const institutionStaff = [
  requireAuth,
  requireRole('program_director', 'institution_admin', 'registrar', 'admin', 'super_admin'),
];

const jupebStudent = jupebStudentMiddleware();

// Tier 1: Registrar releases session results to institutions
router.post('/admin/results/release-to-institutions', registrarOnly, ResultsReleaseController.releaseToInstitutions);
router.post('/results/release-to-institutions', registrarOnly, ResultsReleaseController.releaseToInstitutions);
router.post('/sessions/:sessionId/release-results-to-institutions', registrarOnly, ResultsReleaseController.releaseToInstitutions);

// Tier 2: Institution views results and releases to students
router.get('/institution/results', institutionStaff, ResultsReleaseController.getInstitutionResults);
router.get('/institution/sessions/:sessionId/results', institutionStaff, ResultsReleaseController.getInstitutionResults);
router.post('/institution/results/release-to-students', institutionStaff, ResultsReleaseController.releaseToStudents);
router.post('/institution/sessions/:sessionId/results/release-to-students', institutionStaff, ResultsReleaseController.releaseToStudents);

// Direct student route alias (alongside /dashboard/results)
router.get('/students/me/results', jupebStudent, StudentDashboardController.getResults);

module.exports = router;
