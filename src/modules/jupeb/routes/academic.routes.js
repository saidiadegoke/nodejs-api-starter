const router = require('express').Router();
const { requireAuth, requirePermission } = require('../../../utils/middleware/rbac.middleware');
const AcademicController = require('../controllers/academic.controller');

const courseWrite = [requireAuth, requirePermission('jupeb.academic.manage')];
const resultEntry = [requireAuth, requirePermission('jupeb.academic.manage')];
const recompute = [requireAuth, requirePermission('jupeb.academic.manage')];
const readAuth = [requireAuth];

router.get('/courses', AcademicController.listCourses);
router.post('/courses', courseWrite, AcademicController.createCourse);

router.get('/registrations/:registrationId/results', readAuth, AcademicController.listResults);
router.post('/registrations/:registrationId/results', resultEntry, AcademicController.upsertResults);
router.get('/registrations/:registrationId/score', readAuth, AcademicController.getScore);
router.post('/registrations/:registrationId/recompute-score', recompute, AcademicController.recomputeScore);

module.exports = router;
