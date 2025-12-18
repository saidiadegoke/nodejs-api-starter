/**
 * User Activity Model
 *
 * Data access layer for user activities
 */

const pool = require('../../../db/pool');

class UserActivityModel {
  /**
   * Create a user activity
   *
   * @param {Object} data - Activity data
   * @returns {Promise<Object>} Created activity
   */
  static async create(data) {
    const {
      user_id,
      activity_type,
      poll_id = null,
      comment_id = null,
      context_source_id = null,
      target_user_id = null,
      title,
      description = null,
      metadata = {}
    } = data;

    const result = await pool.query(
      `INSERT INTO user_activities (user_id, activity_type, poll_id, comment_id, context_source_id, target_user_id, title, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [user_id, activity_type, poll_id, comment_id, context_source_id, target_user_id, title, description, JSON.stringify(metadata)]
    );

    return result.rows[0];
  }

  /**
   * Get user's activities with pagination
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Activities
   */
  static async getByUser(userId, { page = 1, limit = 20, activity_type = null } = {}) {
    const offset = (page - 1) * limit;

    let whereClause = 'ua.user_id = $1';
    const params = [userId, limit, offset];

    if (activity_type) {
      whereClause += ' AND ua.activity_type = $4';
      params.push(activity_type);
    }

    const result = await pool.query(
      `SELECT
        ua.*,
        p.question as poll_question,
        p.title as poll_title,
        p.status as poll_status,
        pc.comment as comment_text,
        target_user.email as target_user_email,
        target_prof.first_name as target_user_first_name,
        target_prof.last_name as target_user_last_name
      FROM user_activities ua
      LEFT JOIN polls p ON ua.poll_id = p.id
      LEFT JOIN poll_comments pc ON ua.comment_id = pc.id
      LEFT JOIN users target_user ON ua.target_user_id = target_user.id
      LEFT JOIN profiles target_prof ON target_user.id = target_prof.user_id
      WHERE ${whereClause}
      ORDER BY ua.created_at DESC
      LIMIT $2 OFFSET $3`,
      params
    );

    return result.rows;
  }

  /**
   * Get activity count for user
   *
   * @param {string} userId - User UUID
   * @param {string} activityType - Optional activity type filter
   * @returns {Promise<number>} Activity count
   */
  static async getCountByUser(userId, activityType = null) {
    let whereClause = 'user_id = $1';
    const params = [userId];

    if (activityType) {
      whereClause += ' AND activity_type = $2';
      params.push(activityType);
    }

    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM user_activities
       WHERE ${whereClause}`,
      params
    );

    return parseInt(result.rows[0].count) || 0;
  }

  /**
   * Delete activity
   *
   * @param {string} activityId - Activity UUID
   * @param {string} userId - User UUID (for verification)
   * @returns {Promise<boolean>} Success status
   */
  static async delete(activityId, userId) {
    const result = await pool.query(
      `DELETE FROM user_activities
       WHERE id = $1 AND user_id = $2`,
      [activityId, userId]
    );

    return result.rowCount > 0;
  }

  /**
   * Check if activity exists for specific action
   *
   * @param {string} userId - User UUID
   * @param {string} activityType - Activity type
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object|null>} Existing activity or null
   */
  static async findExisting(userId, activityType, pollId) {
    const result = await pool.query(
      `SELECT * FROM user_activities
       WHERE user_id = $1 AND activity_type = $2 AND poll_id = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, activityType, pollId]
    );

    return result.rows[0] || null;
  }

  /**
   * Update activity timestamp (for repeated actions)
   *
   * @param {string} activityId - Activity UUID
   * @returns {Promise<Object>} Updated activity
   */
  static async updateTimestamp(activityId) {
    const result = await pool.query(
      `UPDATE user_activities
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [activityId]
    );

    return result.rows[0];
  }
}

module.exports = UserActivityModel;