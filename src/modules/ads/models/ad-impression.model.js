/**
 * Ad Impression Model
 *
 * Data access layer for ad impressions and clicks tracking
 * Handles all database operations for the ad_impressions table
 */

const pool = require('../../../db/pool');

class AdImpressionModel {
  /**
   * Record an ad impression or click
   *
   * @param {Object} impressionData - Impression data
   * @returns {Promise<Object>} Created impression record
   */
  static async record(impressionData) {
    const {
      ad_id,
      placement_key,
      user_id,
      page_url,
      action_type = 'impression',
      session_id,
      user_agent,
      ip_address
    } = impressionData;

    const result = await pool.query(
      `INSERT INTO ad_impressions (
        ad_id, placement_key, user_id, page_url, action_type,
        session_id, user_agent, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [ad_id, placement_key, user_id, page_url, action_type, session_id, user_agent, ip_address]
    );

    return result.rows[0];
  }

  /**
   * Get impressions for a specific ad
   *
   * @param {string} adId - Ad UUID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of impressions
   */
  static async getByAdId(adId, options = {}) {
    const { startDate, endDate, actionType, limit = 100, offset = 0 } = options;

    let query = `SELECT * FROM ad_impressions WHERE ad_id = $1`;
    const values = [adId];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      values.push(endDate);
      paramIndex++;
    }

    if (actionType) {
      query += ` AND action_type = $${paramIndex}`;
      values.push(actionType);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get impressions for a specific placement
   *
   * @param {string} placementKey - Placement key
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of impressions
   */
  static async getByPlacementKey(placementKey, options = {}) {
    const { startDate, endDate, actionType, limit = 100, offset = 0 } = options;

    let query = `SELECT * FROM ad_impressions WHERE placement_key = $1`;
    const values = [placementKey];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      values.push(endDate);
      paramIndex++;
    }

    if (actionType) {
      query += ` AND action_type = $${paramIndex}`;
      values.push(actionType);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get analytics for a specific ad
   *
   * @param {string} adId - Ad UUID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Analytics data
   */
  static async getAdAnalytics(adId, options = {}) {
    const { startDate, endDate } = options;

    let query = `
      SELECT
        COUNT(*) FILTER (WHERE action_type = 'impression') as total_impressions,
        COUNT(*) FILTER (WHERE action_type = 'click') as total_clicks,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND action_type = 'impression') as unique_users,
        COUNT(DISTINCT session_id) FILTER (WHERE action_type = 'impression') as unique_sessions,
        CASE
          WHEN COUNT(*) FILTER (WHERE action_type = 'impression') > 0
          THEN ROUND((COUNT(*) FILTER (WHERE action_type = 'click')::numeric / COUNT(*) FILTER (WHERE action_type = 'impression')::numeric) * 100, 2)
          ELSE 0
        END as ctr
      FROM ad_impressions
      WHERE ad_id = $1
    `;

    const values = [adId];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      values.push(endDate);
    }

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Get analytics for a specific placement
   *
   * @param {string} placementKey - Placement key
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Analytics data
   */
  static async getPlacementAnalytics(placementKey, options = {}) {
    const { startDate, endDate } = options;

    let query = `
      SELECT
        COUNT(*) FILTER (WHERE action_type = 'impression') as total_impressions,
        COUNT(*) FILTER (WHERE action_type = 'click') as total_clicks,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND action_type = 'impression') as unique_users,
        COUNT(DISTINCT session_id) FILTER (WHERE action_type = 'impression') as unique_sessions,
        CASE
          WHEN COUNT(*) FILTER (WHERE action_type = 'impression') > 0
          THEN ROUND((COUNT(*) FILTER (WHERE action_type = 'click')::numeric / COUNT(*) FILTER (WHERE action_type = 'impression')::numeric) * 100, 2)
          ELSE 0
        END as ctr
      FROM ad_impressions
      WHERE placement_key = $1
    `;

    const values = [placementKey];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      values.push(endDate);
    }

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Get overall ad analytics
   *
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Overall analytics data
   */
  static async getOverallAnalytics(options = {}) {
    const { startDate, endDate } = options;

    let query = `
      SELECT
        COUNT(*) FILTER (WHERE action_type = 'impression') as total_impressions,
        COUNT(*) FILTER (WHERE action_type = 'click') as total_clicks,
        COUNT(DISTINCT ad_id) as total_ads,
        COUNT(DISTINCT placement_key) as total_placements,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users,
        CASE
          WHEN COUNT(*) FILTER (WHERE action_type = 'impression') > 0
          THEN ROUND((COUNT(*) FILTER (WHERE action_type = 'click')::numeric / COUNT(*) FILTER (WHERE action_type = 'impression')::numeric) * 100, 2)
          ELSE 0
        END as ctr
      FROM ad_impressions
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      values.push(endDate);
    }

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete old impressions (for cleanup)
   *
   * @param {number} daysOld - Delete impressions older than this many days
   * @returns {Promise<number>} Number of deleted records
   */
  static async deleteOld(daysOld = 90) {
    const result = await pool.query(
      `DELETE FROM ad_impressions WHERE created_at < NOW() - INTERVAL '${daysOld} days'`
    );
    return result.rowCount;
  }
}

module.exports = AdImpressionModel;
