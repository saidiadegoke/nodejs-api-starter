/**
 * Poll Rating Model
 *
 * Handles database operations for poll ratings
 */

const pool = require('../../../db/pool');

class PollRatingModel {
  /**
   * Create or update a rating
   *
   * @param {Object} ratingData - Rating data
   * @returns {Promise<Object>} Created/updated rating
   */
  static async upsert({ poll_id, user_id, rating }) {
    const result = await pool.query(
      `INSERT INTO poll_ratings (poll_id, user_id, rating)
       VALUES ($1, $2, $3)
       ON CONFLICT (poll_id, user_id)
       DO UPDATE SET rating = $3, updated_at = NOW()
       RETURNING *`,
      [poll_id, user_id, rating]
    );

    return result.rows[0];
  }

  /**
   * Get user's rating for a poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @returns {Promise<Object|null>} Rating or null
   */
  static async getUserRating(pollId, userId) {
    const result = await pool.query(
      `SELECT * FROM poll_ratings
       WHERE poll_id = $1 AND user_id = $2`,
      [pollId, userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get rating statistics for a poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Rating statistics
   */
  static async getStats(pollId) {
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_ratings,
        AVG(rating)::NUMERIC(3,2) as avg_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
       FROM poll_ratings
       WHERE poll_id = $1`,
      [pollId]
    );

    const stats = result.rows[0];

    return {
      total_ratings: parseInt(stats.total_ratings),
      avg_rating: parseFloat(stats.avg_rating) || 0,
      distribution: {
        5: parseInt(stats.five_star),
        4: parseInt(stats.four_star),
        3: parseInt(stats.three_star),
        2: parseInt(stats.two_star),
        1: parseInt(stats.one_star)
      }
    };
  }

  /**
   * Delete a rating
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(pollId, userId) {
    const result = await pool.query(
      `DELETE FROM poll_ratings
       WHERE poll_id = $1 AND user_id = $2`,
      [pollId, userId]
    );

    return result.rowCount > 0;
  }

  /**
   * Get user's rating history
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} User's ratings
   */
  static async getByUserId(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
        r.*,
        p.question,
        p.poll_type
       FROM poll_ratings r
       JOIN polls p ON r.poll_id = p.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }
}

module.exports = PollRatingModel;
