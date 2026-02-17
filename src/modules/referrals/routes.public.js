const router = require('express').Router();
const ReferralController = require('./controllers/referral.controller');

router.get('/resolve', ReferralController.resolveCodePublic);

module.exports = router;
