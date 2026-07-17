const pool = require('../../../db/pool');

const DEFAULTS = {
  push_notifications_enabled: true,
  biometric_login_enabled: false,
};

class UserPreferencesModel {
  static defaults() {
    return { ...DEFAULTS };
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT push_notifications_enabled, biometric_login_enabled
         FROM user_preferences
        WHERE user_id = $1`,
      [userId]
    );
    if (!result.rows[0]) return null;
    return {
      push_notifications_enabled: Boolean(result.rows[0].push_notifications_enabled),
      biometric_login_enabled: Boolean(result.rows[0].biometric_login_enabled),
    };
  }

  static async upsert(userId, fields) {
    const current = (await this.findByUserId(userId)) || this.defaults();
    const push =
      fields.push_notifications_enabled !== undefined
        ? Boolean(fields.push_notifications_enabled)
        : current.push_notifications_enabled;
    const biometric =
      fields.biometric_login_enabled !== undefined
        ? Boolean(fields.biometric_login_enabled)
        : current.biometric_login_enabled;

    const result = await pool.query(
      `INSERT INTO user_preferences (
         user_id, push_notifications_enabled, biometric_login_enabled
       ) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         push_notifications_enabled = EXCLUDED.push_notifications_enabled,
         biometric_login_enabled = EXCLUDED.biometric_login_enabled,
         updated_at = NOW()
       RETURNING push_notifications_enabled, biometric_login_enabled`,
      [userId, push, biometric]
    );

    return {
      push_notifications_enabled: Boolean(result.rows[0].push_notifications_enabled),
      biometric_login_enabled: Boolean(result.rows[0].biometric_login_enabled),
    };
  }
}

module.exports = UserPreferencesModel;
