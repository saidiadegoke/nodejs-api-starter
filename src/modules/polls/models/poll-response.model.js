/**
 * Poll Response Model
 *
 * Data access layer for poll responses
 * Handles database operations for poll_responses table
 */

const pool = require('../../../db/pool');

class PollResponseModel {
  /**
   * Create or update poll response
   *
   * @param {Object} responseData - Response data
   * @returns {Promise<Object>} Created/updated response
   */
  static async createOrUpdate(responseData) {
    const {
      poll_id,
      user_id,
      option_id,
      option_ids,
      numeric_value,
      text_value,
      ranking_data,
      metadata = {},
      explanation,
      referral_code
    } = responseData;

    const result = await pool.query(
      `INSERT INTO poll_responses (
        poll_id, user_id, option_id, option_ids, numeric_value,
        text_value, ranking_data, metadata, explanation, referral_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (poll_id, user_id)
      DO UPDATE SET
        option_id = EXCLUDED.option_id,
        option_ids = EXCLUDED.option_ids,
        numeric_value = EXCLUDED.numeric_value,
        text_value = EXCLUDED.text_value,
        ranking_data = EXCLUDED.ranking_data,
        metadata = EXCLUDED.metadata,
        explanation = EXCLUDED.explanation,
        updated_at = NOW()
      RETURNING *`,
      [
        poll_id, user_id, option_id, option_ids,
        numeric_value, text_value,
        ranking_data ? JSON.stringify(ranking_data) : null,
        JSON.stringify(metadata),
        explanation, referral_code
      ]
    );

    return result.rows[0];
  }

  /**
   * Get response by user and poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @returns {Promise<Object|null>} Response or null
   */
  static async getByUserAndPoll(pollId, userId) {
    const result = await pool.query(
      'SELECT * FROM poll_responses WHERE poll_id = $1 AND user_id = $2',
      [pollId, userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all responses for a poll
   *
   * @param {string} pollId - Poll UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of responses
   */
  static async getByPollId(pollId, { page = 1, limit = 50 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
        pr.*,
        prof.first_name,
        prof.last_name,
        prof.profile_photo_url as profile_photo
      FROM poll_responses pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE pr.poll_id = $1
      ORDER BY pr.created_at DESC
      LIMIT $2 OFFSET $3`,
      [pollId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get response count for a poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<number>} Total responses
   */
  static async getCountByPollId(pollId) {
    const result = await pool.query(
      'SELECT COUNT(*) FROM poll_responses WHERE poll_id = $1',
      [pollId]
    );

    return parseInt(result.rows[0].count);
  }

  /**
   * Get response count by option
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Array>} Option counts
   */
  static async getCountsByOption(pollId) {
    const result = await pool.query(
      `SELECT
        option_id,
        COUNT(*) as count
      FROM poll_responses
      WHERE poll_id = $1 AND option_id IS NOT NULL
      GROUP BY option_id`,
      [pollId]
    );

    return result.rows;
  }

  /**
   * Get numeric response statistics
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Statistics (avg, min, max)
   */
  static async getNumericStats(pollId) {
    const result = await pool.query(
      `SELECT
        AVG(numeric_value) as average,
        MIN(numeric_value) as minimum,
        MAX(numeric_value) as maximum,
        COUNT(*) as count
      FROM poll_responses
      WHERE poll_id = $1 AND numeric_value IS NOT NULL`,
      [pollId]
    );

    return result.rows[0];
  }

  /**
   * Get text responses with pagination
   *
   * @param {string} pollId - Poll UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Text responses
   */
  static async getTextResponses(pollId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
        pr.id,
        pr.text_value,
        pr.metadata,
        pr.created_at,
        prof.first_name,
        prof.last_name,
        prof.profile_photo_url as profile_photo
      FROM poll_responses pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE pr.poll_id = $1 AND pr.text_value IS NOT NULL
      ORDER BY pr.created_at DESC
      LIMIT $2 OFFSET $3`,
      [pollId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get ranking aggregated data
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Array>} Ranking statistics per option
   */
  static async getRankingStats(pollId) {
    const result = await pool.query(
      `SELECT
        jsonb_array_elements(ranking_data)->>'option_id' as option_id,
        AVG((jsonb_array_elements(ranking_data)->>'rank')::int) as avg_rank,
        COUNT(*) as vote_count
      FROM poll_responses
      WHERE poll_id = $1 AND ranking_data IS NOT NULL
      GROUP BY option_id
      ORDER BY avg_rank ASC`,
      [pollId]
    );

    return result.rows;
  }

  /**
   * Check if user has responded to poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} Response status
   */
  static async hasUserResponded(pollId, userId) {
    const result = await pool.query(
      'SELECT id FROM poll_responses WHERE poll_id = $1 AND user_id = $2',
      [pollId, userId]
    );

    return result.rowCount > 0;
  }

  /**
   * Delete response
   *
   * @param {string} responseId - Response UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(responseId) {
    const result = await pool.query(
      'DELETE FROM poll_responses WHERE id = $1',
      [responseId]
    );

    return result.rowCount > 0;
  }

  /**
   * Get user's poll responses with pagination
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} User's responses
   */
  static async getByUserId(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
        pr.*,
        p.title as poll_title,
        p.question as poll_question,
        p.poll_type
      FROM poll_responses pr
      JOIN polls p ON pr.poll_id = p.id
      WHERE pr.user_id = $1 AND p.deleted_at IS NULL
      ORDER BY pr.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }
}

module.exports = PollResponseModel;
