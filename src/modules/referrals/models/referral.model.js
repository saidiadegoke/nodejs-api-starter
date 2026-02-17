const pool = require('../../../db/pool');

class ReferralModel {
  /**
   * Create a referral (referrer -> referred). Idempotent per referred_id.
   */
  static async create(referrerId, referredId, referralCodeId = null) {
    const result = await pool.query(
      `INSERT INTO referrals (referrer_id, referred_id, referral_code_id, status)
       VALUES ($1, $2, $3, 'signed_up')
       ON CONFLICT (referred_id) DO NOTHING
       RETURNING *`,
      [referrerId, referredId, referralCodeId]
    );
    return result.rows[0];
  }

  /**
   * Get referral by referred user id
   */
  static async getByReferredId(referredId) {
    const result = await pool.query(
      'SELECT * FROM referrals WHERE referred_id = $1',
      [referredId]
    );
    return result.rows[0];
  }

  /**
   * Count referrals by referrer (signups)
   */
  static async countByReferrer(referrerId) {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM referrals WHERE referrer_id = $1',
      [referrerId]
    );
    return result.rows[0].count;
  }

  /**
   * Count referrals by referrer that reached milestone (for Phase 2)
   */
  static async countMilestonesByReferrer(referrerId) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM referrals
       WHERE referrer_id = $1 AND status IN ('milestone_reached', 'rewarded')`,
      [referrerId]
    );
    return result.rows[0].count;
  }

  /**
   * Mark referral as milestone reached (first paid plan, etc.)
   */
  static async updateMilestoneReached(referralId) {
    const result = await pool.query(
      `UPDATE referrals
       SET status = 'milestone_reached', milestone_reached_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'signed_up'
       RETURNING *`,
      [referralId]
    );
    return result.rows[0];
  }
}

module.exports = ReferralModel;
