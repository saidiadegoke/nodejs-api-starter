const pool = require('../../../db/pool');
const crypto = require('crypto');

class ReferralCodeModel {
  /**
   * Create a referral code for a user
   */
  static async create(userId, code) {
    const result = await pool.query(
      `INSERT INTO referral_codes (user_id, code)
       VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING
       RETURNING *`,
      [userId, code]
    );
    return result.rows[0];
  }

  /**
   * Find by code (for resolving ref= at signup)
   */
  static async findByCode(code) {
    if (!code || typeof code !== 'string') return null;
    const normalized = code.trim().toUpperCase();
    if (!normalized) return null;
    const result = await pool.query(
      'SELECT * FROM referral_codes WHERE code = $1',
      [normalized]
    );
    return result.rows[0];
  }

  /**
   * Find by user id
   */
  static async findByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM referral_codes WHERE user_id = $1',
      [userId]
    );
    return result.rows[0];
  }

  /**
   * Generate a unique code (alphanumeric, 8 chars)
   */
  static generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      code += chars[bytes[i] % chars.length];
    }
    return code;
  }
}

module.exports = ReferralCodeModel;
