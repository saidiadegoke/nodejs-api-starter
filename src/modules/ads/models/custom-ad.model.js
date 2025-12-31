/**
 * Custom Ad Model
 *
 * Data access layer for custom B2B ads
 * Handles all database operations for the custom_ads table
 */

const pool = require('../../../db/pool');

class CustomAdModel {
  /**
   * Get all custom ads
   *
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of custom ads
   */
  static async getAll(options = {}) {
    const { includeInactive = false } = options;

    let query = `SELECT * FROM custom_ads`;
    const values = [];

    if (!includeInactive) {
      query += ` WHERE is_active = true`;
    }

    query += ` ORDER BY priority DESC, created_at DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get custom ad by ID
   *
   * @param {string} adId - Ad UUID
   * @returns {Promise<Object|null>} Ad object or null
   */
  static async getById(adId) {
    const result = await pool.query(
      `SELECT * FROM custom_ads WHERE id = $1`,
      [adId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get active ads for a specific placement
   *
   * @param {string} placementKey - Placement key
   * @returns {Promise<Array>} Array of active ads
   */
  static async getForPlacement(placementKey) {
    const result = await pool.query(
      `SELECT * FROM custom_ads
       WHERE is_active = true
       AND $1 = ANY(target_placements)
       AND (start_date IS NULL OR start_date <= NOW())
       AND (end_date IS NULL OR end_date >= NOW())
       ORDER BY priority DESC, created_at DESC`,
      [placementKey]
    );
    return result.rows;
  }

  /**
   * Get a random active ad for a placement (for rotation)
   *
   * @param {string} placementKey - Placement key
   * @returns {Promise<Object|null>} Random ad or null
   */
  static async getRandomForPlacement(placementKey) {
    const result = await pool.query(
      `SELECT * FROM custom_ads
       WHERE is_active = true
       AND $1 = ANY(target_placements)
       AND (start_date IS NULL OR start_date <= NOW())
       AND (end_date IS NULL OR end_date >= NOW())
       ORDER BY priority DESC, RANDOM()
       LIMIT 1`,
      [placementKey]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new custom ad
   *
   * @param {Object} adData - Ad data
   * @returns {Promise<Object>} Created ad
   */
  static async create(adData) {
    const {
      ad_name,
      ad_type = 'banner',
      content_html,
      image_url,
      link_url,
      cta_text,
      is_active = true,
      start_date,
      end_date,
      target_placements = [],
      priority = 0,
      created_by
    } = adData;

    const result = await pool.query(
      `INSERT INTO custom_ads (
        ad_name, ad_type, content_html, image_url, link_url, cta_text,
        is_active, start_date, end_date, target_placements, priority, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        ad_name, ad_type, content_html, image_url, link_url, cta_text,
        is_active, start_date, end_date, target_placements, priority, created_by
      ]
    );

    return result.rows[0];
  }

  /**
   * Update custom ad
   *
   * @param {string} adId - Ad UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated ad
   */
  static async update(adId, updates) {
    const allowedFields = [
      'ad_name', 'ad_type', 'content_html', 'image_url', 'link_url', 'cta_text',
      'is_active', 'start_date', 'end_date', 'target_placements', 'priority'
    ];
    const fields = Object.keys(updates).filter(field => allowedFields.includes(field));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = [adId, ...fields.map(field => updates[field])];

    const result = await pool.query(
      `UPDATE custom_ads SET ${setClause} WHERE id = $1 RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Toggle ad active status
   *
   * @param {string} adId - Ad UUID
   * @param {boolean} isActive - Active status
   * @returns {Promise<Object>} Updated ad
   */
  static async toggleActive(adId, isActive) {
    const result = await pool.query(
      `UPDATE custom_ads SET is_active = $2 WHERE id = $1 RETURNING *`,
      [adId, isActive]
    );
    return result.rows[0];
  }

  /**
   * Increment impressions count
   *
   * @param {string} adId - Ad UUID
   * @returns {Promise<void>}
   */
  static async incrementImpressions(adId) {
    await pool.query(
      `UPDATE custom_ads SET impressions_count = impressions_count + 1 WHERE id = $1`,
      [adId]
    );
  }

  /**
   * Increment clicks count
   *
   * @param {string} adId - Ad UUID
   * @returns {Promise<void>}
   */
  static async incrementClicks(adId) {
    await pool.query(
      `UPDATE custom_ads SET clicks_count = clicks_count + 1 WHERE id = $1`,
      [adId]
    );
  }

  /**
   * Delete custom ad
   *
   * @param {string} adId - Ad UUID
   * @returns {Promise<void>}
   */
  static async delete(adId) {
    await pool.query(
      `DELETE FROM custom_ads WHERE id = $1`,
      [adId]
    );
  }

  /**
   * Get ad performance stats
   *
   * @param {string} adId - Ad UUID
   * @returns {Promise<Object>} Performance stats
   */
  static async getStats(adId) {
    const result = await pool.query(
      `SELECT
        id,
        ad_name,
        impressions_count,
        clicks_count,
        CASE
          WHEN impressions_count > 0 THEN ROUND((clicks_count::numeric / impressions_count::numeric) * 100, 2)
          ELSE 0
        END as ctr
      FROM custom_ads
      WHERE id = $1`,
      [adId]
    );
    return result.rows[0] || null;
  }
}

module.exports = CustomAdModel;
