const router = require('express').Router();
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');
const { jupebStudentMiddleware } = require('../middleware/jupeb-student.middleware');
const RegistrationController = require('../controllers/registration.controller');
const NextOfKinController = require('../controllers/next-of-kin.controller');

const finalizeRole = [requireAuth, requireRole('admin', 'super_admin', 'registrar')];
const instReg = [requireAuth, requireRole('program_director', 'institution_admin', 'admin', 'super_admin')];
const jupebStudent = jupebStudentMiddleware();

router.get('/sessions/:sessionId/numbering-preview', finalizeRole, RegistrationController.numberingPreview);

router.post('/institution/registrations', instReg, RegistrationController.institutionCreate);
router.patch('/institution/registrations/:registrationId', instReg, RegistrationController.institutionPatch);
router.patch('/institution/registrations/:registrationId/candidate', instReg, RegistrationController.institutionPatchCandidate);
router.post('/institution/registrations/:registrationId/resend-code', instReg, RegistrationController.institutionResendCode);
router.delete('/institution/registrations/:registrationId', instReg, RegistrationController.institutionDelete);
router.get('/institution/registrations', instReg, RegistrationController.institutionList);
router.get('/institution/registrations/export', instReg, RegistrationController.institutionExportCsv);
// NOTE: must come AFTER the literal /export route above, otherwise
// Express matches `:registrationId === "export"`.
router.get('/institution/registrations/:registrationId', instReg, RegistrationController.institutionGetCandidate);
router.get('/institution/overview/stats', instReg, RegistrationController.institutionStats);
router.get('/institution/overview/by-university', instReg, RegistrationController.institutionByUniversity);
router.post('/institution/registrations/batch', instReg, RegistrationController.institutionBatchAction);
router.post('/institution/registrations/:registrationId/approve', instReg, RegistrationController.institutionApprove);
router.post('/institution/registrations/:registrationId/reject', instReg, RegistrationController.institutionReject);
router.post('/institution/registrations/:registrationId/withdraw', instReg, RegistrationController.institutionWithdraw);

router.get('/me/code-status', jupebStudent, RegistrationController.getCodeStatus);
router.post('/me/claim-code', jupebStudent, RegistrationController.claimCode);
router.get('/me/current', jupebStudent, RegistrationController.getMeCurrent);
router.get('/me/profile', jupebStudent, RegistrationController.getMeProfile);
router.get('/me/submission-preview', jupebStudent, RegistrationController.getMeSubmissionPreview);
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
