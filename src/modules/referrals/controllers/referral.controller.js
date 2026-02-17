const ReferralCodeService = require('../services/referralCode.service');
const ReferralService = require('../services/referral.service');
const ReferralRewardModel = require('../models/referralReward.model');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

/** Base URL for share link (register page with ref param) */
const getRegisterBaseUrl = () => {
  const base = process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')[0] || 'https://smartstore.ng';
  return base.replace(/\/$/, '');
};

class ReferralController {
  /**
   * GET /referrals/me
   * Current user's referral code, link, and stats
   */
  static async getMe(req, res) {
    try {
      const userId = req.user.user_id;
      const codeRow = await ReferralCodeService.getOrCreateCode(userId);
      const stats = await ReferralService.getStats(userId);
      const registerPath = '/register';
      const referralLink = `${getRegisterBaseUrl()}${registerPath}?ref=${encodeURIComponent(codeRow.code)}`;

      const rewardTotals = await ReferralService.getRewardTotals(userId);

      return sendSuccess(res, {
        code: codeRow.code,
        referral_link: referralLink,
        signup_count: stats.signup_count,
        milestone_count: stats.milestone_count,
        rewards_total_pending: rewardTotals.pending,
        rewards_total_paid: rewardTotals.paid,
      }, 'Referral info retrieved', OK);
    } catch (error) {
      return sendError(res, error.message || 'Failed to get referral info', BAD_REQUEST);
    }
  }

  /**
   * GET /referrals/me/rewards
   * List rewards (pending/paid) for current user
   */
  static async getMyRewards(req, res) {
    try {
      const userId = req.user.user_id;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const offset = parseInt(req.query.offset, 10) || 0;
      const status = req.query.status || null; // 'pending' | 'paid' | null for all

      const rewards = await ReferralService.listRewards(userId, { limit, offset, status });
      const totals = await ReferralService.getRewardTotals(userId);

      return sendSuccess(res, {
        rewards,
        totals: { pending: totals.pending, paid: totals.paid },
      }, 'Rewards retrieved', OK);
    } catch (error) {
      return sendError(res, error.message || 'Failed to get rewards', BAD_REQUEST);
    }
  }

  /**
   * GET /public/referrals/resolve?code=ABC123
   * Public: resolve referral code to referrer display name (for signup page "Referred by X").
   */
  static async resolveCodePublic(req, res) {
    try {
      const code = (req.query && req.query.code) ? String(req.query.code).trim() : '';
      if (!code) {
        return sendSuccess(res, { display_name: null }, 'OK', OK);
      }
      const displayName = await ReferralCodeService.resolveCodeToDisplayName(code);
      return sendSuccess(res, { display_name: displayName }, 'OK', OK);
    } catch (error) {
      return sendSuccess(res, { display_name: null }, 'OK', OK);
    }
  }

  /**
   * PATCH /referrals/admin/rewards/:rewardId
   * Admin: mark a reward as paid (or cancelled). Body: { status: 'paid' | 'cancelled' }
   */
  static async markRewardPaidAdmin(req, res) {
    try {
      const { rewardId } = req.params;
      const status = (req.body && req.body.status) || 'paid';
      if (!['paid', 'cancelled'].includes(status)) {
        return sendError(res, 'status must be paid or cancelled', BAD_REQUEST);
      }

      const existing = await ReferralRewardModel.findById(rewardId);
      if (!existing) return sendError(res, 'Reward not found', NOT_FOUND);

      const updated = await ReferralRewardModel.updateStatus(rewardId, status);
      return sendSuccess(res, updated, status === 'paid' ? 'Reward marked as paid' : 'Reward cancelled', OK);
    } catch (error) {
      return sendError(res, error.message || 'Failed to update reward', BAD_REQUEST);
    }
  }
}

module.exports = ReferralController;
