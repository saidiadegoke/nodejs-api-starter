/**
 * Poll Engagement Model
 *
 * Data access layer for poll engagements
 * Handles likes, bookmarks, shares, reposts, views
 */

const pool = require('../../../db/pool');

class PollEngagementModel {
  /**
   * Create or toggle engagement
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @param {string} engagementType - Type (like, bookmark, share, repost, view)
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Engagement result with action taken
   */
  static async toggleEngagement(pollId, userId, engagementType, metadata = {}) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if engagement exists
      const existing = await client.query(
        `SELECT id FROM poll_engagements
         WHERE poll_id = $1 AND user_id = $2 AND engagement_type = $3`,
        [pollId, userId, engagementType]
      );

      let action;
      let engagement;

      if (existing.rowCount > 0) {
        // Remove engagement
        await client.query(
          `DELETE FROM poll_engagements
           WHERE poll_id = $1 AND user_id = $2 AND engagement_type = $3`,
          [pollId, userId, engagementType]
        );
        action = 'removed';
        engagement = null;
      } else {
        // Add engagement
        const result = await client.query(
          `INSERT INTO poll_engagements (poll_id, user_id, engagement_type, metadata)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [pollId, userId, engagementType, JSON.stringify(metadata)]
        );
        action = 'added';
        engagement = result.rows[0];
      }

      await client.query('COMMIT');
      return { action, engagement };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create engagement (always create, don't toggle)
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @param {string} engagementType - Type
   * @param {Object} metadata - Metadata
   * @returns {Promise<Object>} Created engagement
   */
  static async create(pollId, userId, engagementType, metadata = {}) {
    const result = await pool.query(
      `INSERT INTO poll_engagements (poll_id, user_id, engagement_type, metadata)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (poll_id, user_id, engagement_type) DO NOTHING
       RETURNING *`,
      [pollId, userId, engagementType, JSON.stringify(metadata)]
    );

    return result.rows[0];
  }

  /**
   * Check if user has engaged with poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @param {string} engagementType - Type
   * @returns {Promise<boolean>} Engagement status
   */
  static async hasEngaged(pollId, userId, engagementType) {
    const result = await pool.query(
      `SELECT id FROM poll_engagements
       WHERE poll_id = $1 AND user_id = $2 AND engagement_type = $3`,
      [pollId, userId, engagementType]
    );

    return result.rowCount > 0;
  }

  /**
   * Get user's engagements for a poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @returns {Promise<Array>} Array of engagement types
   */
  static async getUserEngagements(pollId, userId) {
    const result = await pool.query(
      `SELECT engagement_type FROM poll_engagements
       WHERE poll_id = $1 AND user_id = $2`,
      [pollId, userId]
    );

    return result.rows.map(row => row.engagement_type);
  }

  /**
   * Get polls bookmarked by user
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Bookmarked polls
   */
  static async getUserBookmarks(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
        p.*,
        s.*,
        pe.created_at as bookmarked_at
      FROM poll_engagements pe
      JOIN polls p ON pe.poll_id = p.id
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      WHERE pe.user_id = $1
        AND pe.engagement_type = 'bookmark'
        AND p.deleted_at IS NULL
      ORDER BY pe.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get engagement counts for a poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Engagement counts by type
   */
  static async getCountsByType(pollId) {
    const result = await pool.query(
      `SELECT
        engagement_type,
        COUNT(*) as count
      FROM poll_engagements
      WHERE poll_id = $1
      GROUP BY engagement_type`,
      [pollId]
    );

    const counts = {
      likes: 0,
      bookmarks: 0,
      shares: 0,
      reposts: 0,
      views: 0
    };

    result.rows.forEach(row => {
      counts[row.engagement_type + 's'] = parseInt(row.count);
    });

    return counts;
  }

  /**
   * Remove engagement
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @param {string} engagementType - Type
   * @returns {Promise<boolean>} Success status
   */
  static async remove(pollId, userId, engagementType) {
    const result = await pool.query(
      `DELETE FROM poll_engagements
       WHERE poll_id = $1 AND user_id = $2 AND engagement_type = $3`,
      [pollId, userId, engagementType]
    );

    return result.rowCount > 0;
  }

  /**
   * Record view engagement
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID (null for anonymous)
   * @param {Object} metadata - View metadata (IP, user agent, etc.)
   * @returns {Promise<Object|null>} Created engagement or null
   */
  static async recordView(pollId, userId, metadata = {}) {
    if (!userId) {
      // For anonymous views, just increment the counter in poll_stats
      await pool.query(
        `UPDATE poll_stats SET views = views + 1 WHERE poll_id = $1`,
        [pollId]
      );
      return null;
    }

    return this.create(pollId, userId, 'view', metadata);
  }

  /**
   * Get users who engaged with poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} engagementType - Type
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Users with engagements
   */
  static async getUsersByEngagement(pollId, engagementType, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
        u.id,
        prof.first_name,
        prof.last_name,
        prof.profile_photo_url as profile_photo,
        pe.created_at as engaged_at
      FROM poll_engagements pe
      JOIN users u ON pe.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE pe.poll_id = $1 AND pe.engagement_type = $2
      ORDER BY pe.created_at DESC
      LIMIT $3 OFFSET $4`,
      [pollId, engagementType, limit, offset]
    );

    return result.rows;
  }
}

module.exports = PollEngagementModel;
