const ReferralCodeModel = require('../models/referralCode.model');

class ReferralCodeService {
  /**
   * Get or create referral code for user. One code per user.
   */
  static async getOrCreateCode(userId) {
    const existing = await ReferralCodeModel.findByUserId(userId);
    if (existing) return existing;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = ReferralCodeModel.generateCode();
      const row = await ReferralCodeModel.create(userId, code);
      if (row) return row;
    }
    throw new Error('Failed to generate unique referral code');
  }

  /**
   * Resolve code to referrer user id (for signup attribution)
   */
  static async resolveCode(code) {
    const row = await ReferralCodeModel.findByCode(code);
    return row ? row.user_id : null;
  }

  /**
   * Resolve code to referrer display name (for public signup page: "Referred by X")
   */
  static async resolveCodeToDisplayName(code) {
    const row = await ReferralCodeModel.findByCode(code);
    if (!row) return null;
    const pool = require('../../../db/pool');
    const result = await pool.query(
      'SELECT p.first_name, p.display_name FROM profiles p WHERE p.user_id = $1',
      [row.user_id]
    );
    const p = result.rows[0];
    if (!p) return null;
    const name = (p.first_name || p.display_name || '').trim();
    return name || null;
  }
}

module.exports = ReferralCodeService;
