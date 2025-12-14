/**
 * Context Engagement Model
 *
 * Data access layer for context engagement tracking
 * Handles database operations for context_engagements table
 */

const pool = require('../../../db/pool');

class ContextEngagementModel {
  /**
   * Record a context engagement
   *
   * @param {Object} engagementData - Engagement data
   * @returns {Promise<Object>} Created engagement
   */
  static async create(engagementData) {
    const {
      source_id,
      poll_id,
      user_id,
      engagement_type,
      duration_seconds,
      scroll_percentage,
      metadata = {}
    } = engagementData;

    const result = await pool.query(
      `INSERT INTO context_engagements (
        source_id, poll_id, user_id, engagement_type,
        duration_seconds, scroll_percentage, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [source_id, poll_id, user_id, engagement_type,
       duration_seconds, scroll_percentage, JSON.stringify(metadata)]
    );

    return result.rows[0];
  }

  /**
   * Get engagements for a source
   *
   * @param {string} sourceId - Source UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of engagements
   */
  static async getBySourceId(sourceId, { page = 1, limit = 50 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT * FROM context_engagements
       WHERE source_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [sourceId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get engagements for a poll's contexts
   *
   * @param {string} pollId - Poll UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of engagements
   */
  static async getByPollId(pollId, { page = 1, limit = 50 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT * FROM context_engagements
       WHERE poll_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [pollId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get user's engagements with a source
   *
   * @param {string} userId - User UUID
   * @param {string} sourceId - Source UUID
   * @returns {Promise<Array>} Array of engagements
   */
  static async getByUserAndSource(userId, sourceId) {
    const result = await pool.query(
      `SELECT * FROM context_engagements
       WHERE user_id = $1 AND source_id = $2
       ORDER BY created_at DESC`,
      [userId, sourceId]
    );

    return result.rows;
  }

  /**
   * Get engagement summary for a source
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<Object>} Engagement summary
   */
  static async getSummaryBySourceId(sourceId) {
    const result = await pool.query(
      `SELECT
        COUNT(DISTINCT user_id) as unique_viewers,
        COUNT(*) as total_engagements,
        AVG(duration_seconds) as avg_duration_seconds,
        AVG(scroll_percentage) as avg_scroll_percentage,
        COUNT(CASE WHEN engagement_type = 'scroll_complete' THEN 1 END) as complete_reads,
        COUNT(CASE WHEN engagement_type = 'click_source' THEN 1 END) as source_clicks,
        COUNT(CASE WHEN engagement_type = 'share' THEN 1 END) as shares,
        COUNT(CASE WHEN engagement_type = 'download' THEN 1 END) as downloads
      FROM context_engagements
      WHERE source_id = $1`,
      [sourceId]
    );

    return result.rows[0];
  }

  /**
   * Get engagement summary for a poll's contexts
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Engagement summary
   */
  static async getSummaryByPollId(pollId) {
    const result = await pool.query(
      `SELECT
        COUNT(DISTINCT user_id) as unique_viewers,
        COUNT(*) as total_engagements,
        AVG(duration_seconds) as avg_duration_seconds,
        AVG(scroll_percentage) as avg_scroll_percentage,
        COUNT(CASE WHEN engagement_type = 'scroll_complete' THEN 1 END) as complete_reads,
        COUNT(CASE WHEN engagement_type = 'click_source' THEN 1 END) as source_clicks
      FROM context_engagements
      WHERE poll_id = $1`,
      [pollId]
    );

    return result.rows[0];
  }

  /**
   * Check if user has viewed a source
   *
   * @param {string} userId - User UUID
   * @param {string} sourceId - Source UUID
   * @returns {Promise<boolean>} Has viewed
   */
  static async hasUserViewed(userId, sourceId) {
    const result = await pool.query(
      `SELECT COUNT(*) FROM context_engagements
       WHERE user_id = $1 AND source_id = $2 AND engagement_type = 'view'`,
      [userId, sourceId]
    );

    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Check if user completed reading a source
   *
   * @param {string} userId - User UUID
   * @param {string} sourceId - Source UUID
   * @returns {Promise<boolean>} Has completed
   */
  static async hasUserCompleted(userId, sourceId) {
    const result = await pool.query(
      `SELECT COUNT(*) FROM context_engagements
       WHERE user_id = $1 AND source_id = $2 AND engagement_type = 'scroll_complete'`,
      [userId, sourceId]
    );

    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Get engagement breakdown by type for a source
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<Array>} Engagement breakdown
   */
  static async getBreakdownBySourceId(sourceId) {
    const result = await pool.query(
      `SELECT
        engagement_type,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
      FROM context_engagements
      WHERE source_id = $1
      GROUP BY engagement_type
      ORDER BY count DESC`,
      [sourceId]
    );

    return result.rows;
  }

  /**
   * Delete engagements for a source
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<number>} Number of deleted engagements
   */
  static async deleteBySourceId(sourceId) {
    const result = await pool.query(
      'DELETE FROM context_engagements WHERE source_id = $1',
      [sourceId]
    );

    return result.rowCount;
  }
}

module.exports = ContextEngagementModel;
