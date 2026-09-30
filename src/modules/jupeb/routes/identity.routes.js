const router = require('express').Router();
const { requireAuth, requirePermission } = require('../../../utils/middleware/rbac.middleware');
const IdentityController = require('../controllers/identity.controller');

const ninVerifyRoles = [
  requireAuth,
  requirePermission('jupeb.identity.verify'),
];

router.post('/nin/verify', ninVerifyRoles, IdentityController.verifyNin);
router.patch('/nin/verifications/:verificationId/intake', ninVerifyRoles, IdentityController.patchNinIntake);
router.post('/nin/verifications/:verificationId/retry', ninVerifyRoles, IdentityController.retryVerification);
router.get('/nin/verifications/:verificationId', requireAuth, IdentityController.getVerification);

router.delete('/biometrics/:captureId', requireAuth, IdentityController.deleteBiometric);
router.put('/biometrics/:captureId', requireAuth, IdentityController.replaceBiometric);
router.post('/biometrics', requireAuth, IdentityController.createBiometric);
router.get('/registrations/:registrationId/biometrics', requireAuth, IdentityController.listBiometrics);
router.post('/registrations/:registrationId/biometrics/skip', requireAuth, IdentityController.skipBiometric);
router.get('/registrations/:registrationId/photo', requireAuth, IdentityController.getRegistrationPhoto);

module.exports = router;
