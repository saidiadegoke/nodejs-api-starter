const router = require('express').Router();
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');
const { jupebStudentMiddleware } = require('../middleware/jupeb-student.middleware');
const RegistrationController = require('../controllers/registration.controller');

const finalizeRole = [requireAuth, requireRole('admin', 'super_admin', 'registrar')];
const instReg = [requireAuth, requireRole('program_director', 'institution_admin', 'admin', 'super_admin')];
const jupebStudent = jupebStudentMiddleware();

router.get('/sessions/:sessionId/numbering-preview', finalizeRole, RegistrationController.numberingPreview);

router.post('/institution/registrations', instReg, RegistrationController.institutionCreate);
router.patch('/institution/registrations/:registrationId', instReg, RegistrationController.institutionPatch);
router.get('/institution/registrations', instReg, RegistrationController.institutionList);
router.post('/institution/registrations/:registrationId/approve', instReg, RegistrationController.institutionApprove);
router.post('/institution/registrations/:registrationId/reject', instReg, RegistrationController.institutionReject);

router.post('/me/claim-code', jupebStudent, RegistrationController.claimCode);
router.get('/me/current', jupebStudent, RegistrationController.getMeCurrent);
router.post('/me/confirm-subjects', jupebStudent, RegistrationController.confirmSubjects);
router.post('/me/submit', jupebStudent, RegistrationController.submit);
router.get('/me/dashboard-access', jupebStudent, RegistrationController.dashboardAccess);

module.exports = router;
