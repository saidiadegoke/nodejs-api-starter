/**
 * AdSense Config Model
 *
 * Data access layer for Google AdSense configuration
 * Handles all database operations for the adsense_config table
 */

const pool = require('../../../db/pool');

class AdSenseConfigModel {
  /**
   * Get all AdSense configurations
   *
   * @returns {Promise<Array>} Array of AdSense configs
   */
  static async getAll() {
    const result = await pool.query(
      `SELECT * FROM adsense_config ORDER BY placement_key`
    );
    return result.rows;
  }

  /**
   * Get active AdSense configurations
   *
   * @returns {Promise<Array>} Array of active AdSense configs
   */
  static async getActive() {
    const result = await pool.query(
      `SELECT * FROM adsense_config WHERE is_active = true ORDER BY placement_key`
    );
    return result.rows;
  }

  /**
   * Get AdSense config by placement key
   *
   * @param {string} placementKey - Placement key
   * @returns {Promise<Object|null>} Config object or null
   */
  static async getByPlacementKey(placementKey) {
    const result = await pool.query(
      `SELECT * FROM adsense_config WHERE placement_key = $1`,
      [placementKey]
    );
    return result.rows[0] || null;
  }

  /**
   * Create AdSense configuration
   *
   * @param {Object} configData - Config data
   * @returns {Promise<Object>} Created config
   */
  static async create(configData) {
    const {
      placement_key,
      ad_client,
      ad_slot,
      ad_format = 'auto',
      ad_style = {},
      is_active = true
    } = configData;

    const result = await pool.query(
      `INSERT INTO adsense_config (
        placement_key, ad_client, ad_slot, ad_format, ad_style, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [placement_key, ad_client, ad_slot, ad_format, JSON.stringify(ad_style), is_active]
    );

    return result.rows[0];
  }

  /**
   * Update AdSense configuration
   *
   * @param {string} placementKey - Placement key
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated config
   */
  static async update(placementKey, updates) {
    const allowedFields = ['ad_client', 'ad_slot', 'ad_format', 'ad_style', 'is_active'];
    const fields = Object.keys(updates).filter(field => allowedFields.includes(field));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = fields.map((field, index) => {
      // Handle JSON fields
      if (field === 'ad_style') {
        return `${field} = $${index + 2}::json`;
      }
      return `${field} = $${index + 2}`;
    }).join(', ');

    const values = [placementKey, ...fields.map(field => {
      if (field === 'ad_style') {
        return JSON.stringify(updates[field]);
      }
      return updates[field];
    })];

    const result = await pool.query(
      `UPDATE adsense_config SET ${setClause} WHERE placement_key = $1 RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Toggle AdSense config active status
   *
   * @param {string} placementKey - Placement key
   * @param {boolean} isActive - Active status
   * @returns {Promise<Object>} Updated config
   */
  static async toggleActive(placementKey, isActive) {
    const result = await pool.query(
      `UPDATE adsense_config SET is_active = $2 WHERE placement_key = $1 RETURNING *`,
      [placementKey, isActive]
    );
    return result.rows[0];
  }

  /**
   * Delete AdSense configuration
   *
   * @param {string} placementKey - Placement key
   * @returns {Promise<void>}
   */
  static async delete(placementKey) {
    await pool.query(
      `DELETE FROM adsense_config WHERE placement_key = $1`,
      [placementKey]
    );
  }

  /**
   * Upsert (insert or update) AdSense configuration
   *
   * @param {Object} configData - Config data
   * @returns {Promise<Object>} Created or updated config
   */
  static async upsert(configData) {
    const {
      placement_key,
      ad_client,
      ad_slot,
      ad_format = 'auto',
      ad_style = {},
      is_active = true
    } = configData;

    const result = await pool.query(
      `INSERT INTO adsense_config (
        placement_key, ad_client, ad_slot, ad_format, ad_style, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (placement_key)
      DO UPDATE SET
        ad_client = EXCLUDED.ad_client,
        ad_slot = EXCLUDED.ad_slot,
        ad_format = EXCLUDED.ad_format,
        ad_style = EXCLUDED.ad_style,
        is_active = EXCLUDED.is_active
      RETURNING *`,
      [placement_key, ad_client, ad_slot, ad_format, JSON.stringify(ad_style), is_active]
    );

    return result.rows[0];
  }
}

module.exports = AdSenseConfigModel;
