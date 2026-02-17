const router = require('express').Router();
const ReferralController = require('./controllers/referral.controller');
const { requireAuth, requireRole } = require('../../shared/middleware/rbac.middleware');

router.get('/me', requireAuth, ReferralController.getMe);
router.get('/me/rewards', requireAuth, ReferralController.getMyRewards);

// Admin: mark referral reward as paid (e.g. after manual payout)
router.patch('/admin/rewards/:rewardId', requireAuth, requireRole('admin', 'super_admin'), ReferralController.markRewardPaidAdmin);

module.exports = router;
