const router = require('express').Router();
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');
const { jupebStudentMiddleware } = require('../middleware/jupeb-student.middleware');
const SubmissionController = require('../controllers/submission.controller');

const manageReq = [requireAuth, requireRole('admin', 'super_admin', 'registrar')];
const jupebStudent = jupebStudentMiddleware();

router.get('/requirements', manageReq, SubmissionController.listRequirementsAdmin);
router.post('/requirements', manageReq, SubmissionController.createRequirement);
router.patch('/requirements/:requirementId', manageReq, SubmissionController.patchRequirement);
router.post('/requirements/:requirementId/activate', manageReq, SubmissionController.activateRequirement);
router.post('/requirements/:requirementId/deactivate', manageReq, SubmissionController.deactivateRequirement);

router.get('/me/requirements', jupebStudent, SubmissionController.getMeRequirements);
router.get('/me/documents', jupebStudent, SubmissionController.listMeDocuments);
router.post('/me/documents', jupebStudent, SubmissionController.attachMeDocument);
router.patch('/me/documents/:documentId', jupebStudent, SubmissionController.patchMeDocument);
router.post('/me/validate-completeness', jupebStudent, SubmissionController.validateCompleteness);

router.get(
  '/institution/registrations/:registrationId/documents',
  jupebStudent,
  SubmissionController.institutionListDocuments
);
router.post(
  '/institution/documents/:documentId/accept',
  jupebStudent,
  SubmissionController.institutionAccept
);
router.post(
  '/institution/documents/:documentId/reject',
  jupebStudent,
  SubmissionController.institutionReject
);

module.exports = router;
