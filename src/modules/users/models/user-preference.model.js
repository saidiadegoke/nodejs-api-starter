/**
 * User Preference Model
 *
 * Data access layer for user preferences and interests
 */

const pool = require('../../../db/pool');

class UserPreferenceModel {
  /**
   * Get or create user preferences
   *
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} User preferences
   */
  static async getOrCreate(userId) {
    // Try to get existing preferences
    let result = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Create default preferences
      result = await pool.query(
        `INSERT INTO user_preferences (user_id) 
         VALUES ($1) 
         RETURNING *`,
        [userId]
      );
    }

    return result.rows[0];
  }

  /**
   * Update user preferences
   *
   * @param {string} userId - User UUID
   * @param {Object} preferences - Preference updates
   * @returns {Promise<Object>} Updated preferences
   */
  static async update(userId, preferences) {
    const {
      preferred_categories,
      blocked_categories,
      preferred_poll_types,
      blocked_poll_types,
      show_controversial,
      show_trending,
      show_new,
      show_followed_users,
      feed_algorithm,
      content_freshness,
      min_responses,
      min_comments,
      preferred_languages
    } = preferences;

    const result = await pool.query(
      `UPDATE user_preferences SET
        preferred_categories = COALESCE($2, preferred_categories),
        blocked_categories = COALESCE($3, blocked_categories),
        preferred_poll_types = COALESCE($4, preferred_poll_types),
        blocked_poll_types = COALESCE($5, blocked_poll_types),
        show_controversial = COALESCE($6, show_controversial),
        show_trending = COALESCE($7, show_trending),
        show_new = COALESCE($8, show_new),
        show_followed_users = COALESCE($9, show_followed_users),
        feed_algorithm = COALESCE($10, feed_algorithm),
        content_freshness = COALESCE($11, content_freshness),
        min_responses = COALESCE($12, min_responses),
        min_comments = COALESCE($13, min_comments),
        preferred_languages = COALESCE($14, preferred_languages),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *`,
      [
        userId, preferred_categories, blocked_categories, preferred_poll_types,
        blocked_poll_types, show_controversial, show_trending, show_new,
        show_followed_users, feed_algorithm, content_freshness,
        min_responses, min_comments, preferred_languages
      ]
    );

    return result.rows[0];
  }

  /**
   * Get user's feed preferences with interests
   *
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} Complete feed preferences
   */
  static async getFeedPreferences(userId) {
    const result = await pool.query(
      'SELECT * FROM user_feed_preferences WHERE user_id = $1',
      [userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Update user interest based on interaction
   *
   * @param {string} userId - User UUID
   * @param {string} interestType - Type of interest (category, poll_type, author, keyword)
   * @param {string} interestValue - Value of the interest
   * @param {number} scoreIncrement - Score to add (default 1.0)
   * @returns {Promise<void>}
   */
  static async updateInterest(userId, interestType, interestValue, scoreIncrement = 1.0) {
    await pool.query(
      'SELECT update_user_interest($1, $2, $3, $4)',
      [userId, interestType, interestValue, scoreIncrement]
    );
  }

  /**
   * Get user's top interests by type
   *
   * @param {string} userId - User UUID
   * @param {string} interestType - Type of interest
   * @param {number} limit - Number of interests to return
   * @returns {Promise<Array>} Top interests
   */
  static async getTopInterests(userId, interestType, limit = 10) {
    const result = await pool.query(
      `SELECT interest_value, score, interaction_count, last_interaction_at
       FROM user_interests
       WHERE user_id = $1 AND interest_type = $2
       ORDER BY score DESC
       LIMIT $3`,
      [userId, interestType, limit]
    );

    return result.rows;
  }

  /**
   * Record poll shown in feed
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {number} position - Position in feed
   * @param {string} algorithm - Algorithm used
   * @returns {Promise<Object>} Feed history record
   */
  static async recordFeedView(userId, pollId, position, algorithm) {
    const result = await pool.query(
      `INSERT INTO user_feed_history (user_id, poll_id, feed_position, feed_algorithm)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, poll_id) 
       DO UPDATE SET shown_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, pollId, position, algorithm]
    );

    return result.rows[0];
  }

  /**
   * Record poll click in feed
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @returns {Promise<void>}
   */
  static async recordFeedClick(userId, pollId) {
    await pool.query(
      `UPDATE user_feed_history 
       SET clicked = true, clicked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND poll_id = $2`,
      [userId, pollId]
    );
  }

  /**
   * Get polls user has already seen
   *
   * @param {string} userId - User UUID
   * @param {number} days - Days to look back (default 7)
   * @returns {Promise<Array>} Array of poll IDs
   */
  static async getSeenPolls(userId, days = 7) {
    const result = await pool.query(
      `SELECT poll_id 
       FROM user_feed_history 
       WHERE user_id = $1 
         AND shown_at > NOW() - INTERVAL '1 day' * $2`,
      [userId, days]
    );

    return result.rows.map(row => row.poll_id);
  }

  /**
   * Decay interest scores (should be run periodically)
   *
   * @returns {Promise<void>}
   */
  static async decayInterests() {
    await pool.query('SELECT decay_user_interests()');
  }

  /**
   * Get user's category distribution from their activity
   *
   * @param {string} userId - User UUID
   * @returns {Promise<Array>} Category distribution
   */
  static async getCategoryDistribution(userId) {
    const result = await pool.query(
      `SELECT 
        p.category,
        COUNT(*) as interaction_count,
        AVG(CASE WHEN pr.id IS NOT NULL THEN 3 ELSE 0 END +
            CASE WHEN pe.engagement_type = 'like' THEN 2 ELSE 0 END +
            CASE WHEN pe.engagement_type = 'comment' THEN 4 ELSE 0 END +
            CASE WHEN pe.engagement_type = 'share' THEN 3 ELSE 0 END) as avg_engagement_score
       FROM polls p
       LEFT JOIN poll_responses pr ON p.id = pr.poll_id AND pr.user_id = $1
       LEFT JOIN poll_engagements pe ON p.id = pe.poll_id AND pe.user_id = $1
       WHERE (pr.id IS NOT NULL OR pe.id IS NOT NULL)
         AND p.category IS NOT NULL
       GROUP BY p.category
       ORDER BY interaction_count DESC, avg_engagement_score DESC`,
      [userId]
    );

    return result.rows;
  }
}

module.exports = UserPreferenceModel;