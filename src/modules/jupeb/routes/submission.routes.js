const router = require('express').Router();
const { requireAuth, requirePermission } = require('../../../shared/middleware/rbac.middleware');
const { jupebStudentMiddleware } = require('../middleware/jupeb-student.middleware');
const SubmissionController = require('../controllers/submission.controller');
const ResultEntriesController = require('../controllers/result-entries.controller');

const manageReq = [requireAuth, requirePermission('jupeb.submission.manage')];
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
router.delete('/me/documents/:documentId', jupebStudent, SubmissionController.deleteMeDocument);
router.post('/me/validate-completeness', jupebStudent, SubmissionController.validateCompleteness);

// M.11 — short-lived signed download URL for the candidate's own document
router.get('/me/documents/:documentId/download-url', jupebStudent, SubmissionController.downloadUrlMine);

// M.8c — manual subject + grade entries (the figma `log in 18` table)
router.get('/me/result-entries', jupebStudent, ResultEntriesController.listMine);
router.post('/me/result-entries', jupebStudent, ResultEntriesController.upsertMine);
router.patch('/me/result-entries/:entryId', jupebStudent, ResultEntriesController.patchMine);

router.get(
  '/institution/registrations/:registrationId/documents',
  jupebStudent,
  SubmissionController.institutionListDocuments
);

// M.13 — registrar review + override of OCR-extracted result entries
router.get(
  '/institution/registrations/:registrationId/result-entries',
  jupebStudent,
  ResultEntriesController.listForInstitution
);
router.patch(
  '/institution/result-entries/:entryId',
  jupebStudent,
  ResultEntriesController.patchInstitutionEntry
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
