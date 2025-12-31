/**
 * Ad Placement Model
 *
 * Data access layer for ad placements
 * Handles all database operations for the ad_placements table
 */

const pool = require('../../../db/pool');

class AdPlacementModel {
  /**
   * Get all ad placements
   *
   * @returns {Promise<Array>} Array of ad placements
   */
  static async getAll() {
    const result = await pool.query(
      `SELECT * FROM ad_placements ORDER BY location_type, placement_key`
    );
    return result.rows;
  }

  /**
   * Get ad placement by key
   *
   * @param {string} placementKey - Placement key
   * @returns {Promise<Object|null>} Placement object or null
   */
  static async getByKey(placementKey) {
    const result = await pool.query(
      `SELECT * FROM ad_placements WHERE placement_key = $1`,
      [placementKey]
    );
    return result.rows[0] || null;
  }

  /**
   * Get ad placements by location type
   *
   * @param {string} locationType - Location type (e.g., 'feed', 'poll_detail')
   * @returns {Promise<Array>} Array of ad placements
   */
  static async getByLocationType(locationType) {
    const result = await pool.query(
      `SELECT * FROM ad_placements WHERE location_type = $1 ORDER BY placement_key`,
      [locationType]
    );
    return result.rows;
  }

  /**
   * Get enabled ad placements
   *
   * @returns {Promise<Array>} Array of enabled ad placements
   */
  static async getEnabled() {
    const result = await pool.query(
      `SELECT * FROM ad_placements WHERE is_enabled = true ORDER BY location_type, placement_key`
    );
    return result.rows;
  }

  /**
   * Get enabled ad placements for a specific location
   *
   * @param {string} locationType - Location type
   * @returns {Promise<Array>} Array of enabled ad placements
   */
  static async getEnabledByLocation(locationType) {
    const result = await pool.query(
      `SELECT * FROM ad_placements WHERE location_type = $1 AND is_enabled = true ORDER BY placement_key`,
      [locationType]
    );
    return result.rows;
  }

  /**
   * Create a new ad placement
   *
   * @param {Object} placementData - Placement data
   * @returns {Promise<Object>} Created placement
   */
  static async create(placementData) {
    const {
      placement_key,
      placement_name,
      placement_description,
      location_type,
      is_enabled = false,
      ad_type = 'google_adsense',
      frequency = 1
    } = placementData;

    const result = await pool.query(
      `INSERT INTO ad_placements (
        placement_key, placement_name, placement_description,
        location_type, is_enabled, ad_type, frequency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [placement_key, placement_name, placement_description, location_type, is_enabled, ad_type, frequency]
    );

    return result.rows[0];
  }

  /**
   * Update ad placement
   *
   * @param {string} placementKey - Placement key
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated placement
   */
  static async update(placementKey, updates) {
    const allowedFields = ['placement_name', 'placement_description', 'is_enabled', 'ad_type', 'frequency'];
    const fields = Object.keys(updates).filter(field => allowedFields.includes(field));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = [placementKey, ...fields.map(field => updates[field])];

    const result = await pool.query(
      `UPDATE ad_placements SET ${setClause} WHERE placement_key = $1 RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Toggle ad placement enabled status
   *
   * @param {string} placementKey - Placement key
   * @param {boolean} isEnabled - Enabled status
   * @returns {Promise<Object>} Updated placement
   */
  static async toggleEnabled(placementKey, isEnabled) {
    const result = await pool.query(
      `UPDATE ad_placements SET is_enabled = $2 WHERE placement_key = $1 RETURNING *`,
      [placementKey, isEnabled]
    );
    return result.rows[0];
  }

  /**
   * Delete ad placement
   *
   * @param {string} placementKey - Placement key
   * @returns {Promise<void>}
   */
  static async delete(placementKey) {
    await pool.query(
      `DELETE FROM ad_placements WHERE placement_key = $1`,
      [placementKey]
    );
  }
}

module.exports = AdPlacementModel;
