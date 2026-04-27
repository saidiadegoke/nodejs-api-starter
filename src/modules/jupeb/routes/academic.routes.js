const router = require('express').Router();
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');
const AcademicController = require('../controllers/academic.controller');

const courseWrite = [requireAuth, requireRole('registrar', 'admin', 'super_admin')];
const resultEntry = [requireAuth, requireRole('registrar', 'institution_admin', 'admin', 'super_admin')];
const recompute = [requireAuth, requireRole('registrar', 'admin', 'super_admin')];
const readAuth = [requireAuth];

router.get('/courses', AcademicController.listCourses);
router.post('/courses', courseWrite, AcademicController.createCourse);

router.get('/registrations/:registrationId/results', readAuth, AcademicController.listResults);
router.post('/registrations/:registrationId/results', resultEntry, AcademicController.upsertResults);
router.get('/registrations/:registrationId/score', readAuth, AcademicController.getScore);
router.post('/registrations/:registrationId/recompute-score', recompute, AcademicController.recomputeScore);

module.exports = router;
