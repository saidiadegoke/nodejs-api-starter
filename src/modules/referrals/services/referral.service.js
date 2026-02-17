const pool = require('../../../db/pool');
const ReferralModel = require('../models/referral.model');
const ReferralRewardModel = require('../models/referralReward.model');
const ReferralCodeService = require('./referralCode.service');
const { logger } = require('../../../shared/utils/logger');

const CURRENCY_SYMBOLS = { NGN: '₦', USD: '$', EUR: '€', GBP: '£' };
const MILESTONE_LABELS = { first_paid_plan: 'First paid plan' };
const DEFAULT_DASHBOARD_REFERRALS_URL = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'https://smartstore.ng').split(',')[0].trim().replace(/\/$/, '') + '/dashboard/referrals';

/**
 * Send "reward earned" email to referrer (non-blocking; call .catch() from caller).
 */
async function sendReferralRewardEarnedEmail(referrerId, reward) {
  const userRow = await pool.query(
    `SELECT u.email, p.first_name, p.display_name
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [referrerId]
  );
  const row = userRow.rows[0];
  if (!row || !row.email || !row.email.trim()) return;

  const referrerName = row.first_name || row.display_name || 'there';
  const sym = CURRENCY_SYMBOLS[reward.currency] || reward.currency + ' ';
  const amountFormatted = `${sym}${Number(reward.reward_value).toLocaleString()}`;
  const milestoneLabel = MILESTONE_LABELS[reward.milestone_type] || reward.milestone_type.replace(/_/g, ' ');

  const sendEmail = require('../../../shared/utils/sendEmail');
  await sendEmail({
    to: row.email.trim(),
    subject: 'You earned a referral reward – SmartStore',
    templateFile: 'referral-reward-earned.html',
    placeholders: [referrerName, amountFormatted, milestoneLabel, DEFAULT_DASHBOARD_REFERRALS_URL, row.email.trim()],
  });
}

/** Reward config for first_paid_plan (env or defaults) */
const getFirstPaidPlanRewardConfig = () => ({
  reward_type: process.env.REFERRAL_REWARD_FIRST_PLAN_TYPE || 'credit',
  reward_value: parseFloat(process.env.REFERRAL_REWARD_FIRST_PLAN_VALUE || '5', 10) || 5,
  currency: (process.env.REFERRAL_REWARD_CURRENCY || 'NGN').toUpperCase(),
});

class ReferralService {
  /**
   * Create referral (referrer -> referred). Called at signup.
   * Idempotent: first referrer wins; no self-referral.
   */
  static async createReferral(referrerId, referredId, referralCode = null) {
    if (referrerId === referredId) return null;

    let referralCodeId = null;
    if (referralCode) {
      const codeRow = await require('../models/referralCode.model').findByCode(referralCode);
      if (codeRow) referralCodeId = codeRow.id;
    }

    const referral = await ReferralModel.create(referrerId, referredId, referralCodeId);
    return referral;
  }

  /**
   * Record that a referred user completed a milestone (e.g. first paid plan).
   * Updates referral status and creates a pending reward for the referrer.
   * Idempotent: only runs once per referral (status must be signed_up).
   */
  static async recordMilestone(referredUserId, milestoneType) {
    const referral = await ReferralModel.getByReferredId(referredUserId);
    if (!referral || referral.status !== 'signed_up') return null;

    const updated = await ReferralModel.updateMilestoneReached(referral.id);
    if (!updated) return null;

    let rewardConfig = {};
    if (milestoneType === 'first_paid_plan') {
      rewardConfig = getFirstPaidPlanRewardConfig();
    }
    if (!rewardConfig.reward_type) return updated;

    const reward = await ReferralRewardModel.create({
      referral_id: referral.id,
      referrer_id: referral.referrer_id,
      milestone_type: milestoneType,
      reward_type: rewardConfig.reward_type,
      reward_value: rewardConfig.reward_value,
      currency: rewardConfig.currency,
      status: 'pending',
    });

    logger.info('[Referral] Milestone recorded', {
      referral_id: referral.id,
      referrer_id: referral.referrer_id,
      referred_id: referredUserId,
      milestone_type: milestoneType,
      reward_id: reward?.id,
    });

    // Notify referrer by email (non-blocking)
    if (reward) {
      sendReferralRewardEarnedEmail(referral.referrer_id, reward).catch((err) => {
        logger.warn('[Referral] Failed to send reward-earned email', { referrer_id: referral.referrer_id, error: err.message });
      });
    }

    return updated;
  }

  /**
   * Get stats for referrer (signup count, milestone count)
   */
  static async getStats(referrerId) {
    const signupCount = await ReferralModel.countByReferrer(referrerId);
    const milestoneCount = await ReferralModel.countMilestonesByReferrer(referrerId);
    return {
      signup_count: signupCount,
      milestone_count: milestoneCount,
    };
  }

  /**
   * List rewards for referrer (pending/paid)
   */
  static async listRewards(referrerId, options = {}) {
    return ReferralRewardModel.listByReferrerId(referrerId, options);
  }

  /**
   * Get reward totals by status for referrer
   */
  static async getRewardTotals(referrerId) {
    const rows = await ReferralRewardModel.sumByReferrerId(referrerId);
    const totals = { pending: 0, paid: 0 };
    rows.forEach((r) => {
      if (r.status in totals) totals[r.status] = parseFloat(r.total, 10);
    });
    return totals;
  }
}

module.exports = ReferralService;
