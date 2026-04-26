const pool = require('../../../db/pool');

/**
 * Platform Settings (runtime config / feature flags).
 * Values are stored as JSONB so you can keep structured data per key.
 */
class AdminSettingsService {
  static async get(key) {
    const result = await pool.query('SELECT * FROM platform_settings WHERE key = $1', [key]);
    return result.rows[0] || null;
  }

  static async getAll() {
    const result = await pool.query('SELECT * FROM platform_settings ORDER BY key');
    return result.rows;
  }

  static async set(key, value, description = null, adminUserId = null) {
    const result = await pool.query(
      `INSERT INTO platform_settings (key, value, description, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = $2,
           description = COALESCE($3, platform_settings.description),
           updated_by = $4,
           updated_at = NOW()
       RETURNING *`,
      [key, JSON.stringify(value), description, adminUserId]
    );
    return result.rows[0];
  }
}

module.exports = AdminSettingsService;
