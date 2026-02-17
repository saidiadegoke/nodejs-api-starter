const pool = require('../../../db/pool');

class ReferralRewardModel {
  /**
   * Create a reward record (pending)
   */
  static async create(data) {
    const {
      referral_id,
      referrer_id,
      milestone_type,
      reward_type = 'credit',
      reward_value,
      currency = 'NGN',
      status = 'pending',
    } = data;

    const result = await pool.query(
      `INSERT INTO referral_rewards (referral_id, referrer_id, milestone_type, reward_type, reward_value, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [referral_id, referrer_id, milestone_type, reward_type, reward_value, currency, status]
    );
    return result.rows[0];
  }

  /**
   * List rewards for a referrer (optional status filter)
   */
  static async listByReferrerId(referrerId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    let query = `
      SELECT rr.*, r.referred_id
      FROM referral_rewards rr
      JOIN referrals r ON r.id = rr.referral_id
      WHERE rr.referrer_id = $1
    `;
    const params = [referrerId];

    if (status) {
      params.push(status);
      query += ` AND rr.status = $${params.length}`;
    }
    query += ` ORDER BY rr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Find reward by id (for admin update)
   */
  static async findById(rewardId) {
    const result = await pool.query(
      'SELECT * FROM referral_rewards WHERE id = $1',
      [rewardId]
    );
    return result.rows[0];
  }

  /**
   * Update reward status (e.g. pending -> paid for payouts)
   */
  static async updateStatus(rewardId, status) {
    const valid = ['pending', 'paid', 'cancelled'];
    if (!valid.includes(status)) return null;
    const result = await pool.query(
      `UPDATE referral_rewards SET status = $1, paid_at = CASE WHEN $1 = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END WHERE id = $2 RETURNING *`,
      [status, rewardId]
    );
    return result.rows[0];
  }

  /**
   * Sum reward values by status for referrer (e.g. total pending, total paid)
   */
  static async sumByReferrerId(referrerId, statusFilter = null) {
    let query = `
      SELECT status, COALESCE(SUM(reward_value), 0)::decimal AS total
      FROM referral_rewards
      WHERE referrer_id = $1
    `;
    const params = [referrerId];
    if (statusFilter) {
      params.push(statusFilter);
      query += ` AND status = $${params.length}`;
    }
    query += ` GROUP BY status`;

    const result = await pool.query(query, params);
    return result.rows;
  }
}

module.exports = ReferralRewardModel;
