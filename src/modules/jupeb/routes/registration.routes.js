const router = require('express').Router();
const { requireAuth, requirePermission } = require('../../../utils/middleware/rbac.middleware');
const { jupebStudentMiddleware } = require('../middleware/jupeb-student.middleware');
const { spreadsheetUpload } = require('../../../utils/middleware/spreadsheet-upload.middleware');
const RegistrationController = require('../controllers/registration.controller');
const NextOfKinController = require('../controllers/next-of-kin.controller');

const finalizeRole = [requireAuth, requirePermission('sessions.update')];
const candidateView = [requireAuth, requirePermission('candidate.view', 'jupeb.registration.manage')];
const candidateCreate = [requireAuth, requirePermission('candidate.create', 'jupeb.registration.manage')];
const candidateUpdate = [requireAuth, requirePermission('candidate.update', 'jupeb.registration.manage')];
const candidateDelete = [requireAuth, requirePermission('candidate.delete', 'jupeb.registration.manage')];
const jupebStudent = jupebStudentMiddleware();

router.get('/sessions/:sessionId/numbering-preview', finalizeRole, RegistrationController.numberingPreview);

router.post(
  '/institution/registrations/bulk-upload',
  candidateCreate,
  spreadsheetUpload,
  RegistrationController.institutionBulkUpload
);
router.post('/institution/registrations', candidateCreate, RegistrationController.institutionCreate);
router.patch('/institution/registrations/:registrationId', candidateUpdate, RegistrationController.institutionPatch);
router.patch('/institution/registrations/:registrationId/candidate', candidateUpdate, RegistrationController.institutionPatchCandidate);
router.post('/institution/registrations/:registrationId/resend-code', candidateUpdate, RegistrationController.institutionResendCode);
router.delete('/institution/registrations/:registrationId', candidateDelete, RegistrationController.institutionDelete);
router.get('/institution/registrations', candidateView, RegistrationController.institutionList);
router.get('/institution/registrations/export', candidateView, RegistrationController.institutionExportCsv);
// NOTE: must come AFTER the literal /export route above, otherwise
// Express matches `:registrationId === "export"`.
router.get('/institution/registrations/:registrationId', candidateView, RegistrationController.institutionGetCandidate);
router.get('/institution/overview/stats', candidateView, RegistrationController.institutionStats);
router.get('/institution/overview/by-university', candidateView, RegistrationController.institutionByUniversity);
router.post('/institution/registrations/batch', candidateUpdate, RegistrationController.institutionBatchAction);
router.post('/institution/registrations/:registrationId/approve', candidateUpdate, RegistrationController.institutionApprove);
router.post('/institution/registrations/:registrationId/reject', candidateUpdate, RegistrationController.institutionReject);
router.post('/institution/registrations/:registrationId/withdraw', candidateUpdate, RegistrationController.institutionWithdraw);

router.get('/me/code-status', jupebStudent, RegistrationController.getCodeStatus);
router.post('/me/claim-code', jupebStudent, RegistrationController.claimCode);
router.get('/me/current', jupebStudent, RegistrationController.getMeCurrent);
router.get('/me/profile', jupebStudent, RegistrationController.getMeProfile);
router.get('/me/submission-preview', jupebStudent, RegistrationController.getMeSubmissionPreview);
router.get('/me/exam-results', jupebStudent, RegistrationController.getMeExamResults);
router.get('/me/slip', jupebStudent, RegistrationController.getMeSlip);
router.get('/me/slip/download', RegistrationController.downloadMeSlip);
router.patch('/me/academic-intake', jupebStudent, RegistrationController.updateAcademicIntake);
router.patch('/me/profile', jupebStudent, RegistrationController.patchMeProfile);
router.get('/me/registration-form.pdf', jupebStudent, RegistrationController.getMeRegistrationFormPdf);
router.post('/me/confirm-subjects', jupebStudent, RegistrationController.confirmSubjects);
router.post('/me/submit', jupebStudent, RegistrationController.submit);
router.get('/me/dashboard-access', jupebStudent, RegistrationController.dashboardAccess);

// M.1 — Next of kin
router.get('/me/next-of-kin', jupebStudent, NextOfKinController.getMe);
router.post('/me/next-of-kin', jupebStudent, NextOfKinController.createMe);
router.put('/me/next-of-kin', jupebStudent, NextOfKinController.replaceMe);
router.get('/me/next-of-kin/history', jupebStudent, NextOfKinController.listHistory);

module.exports = router;
