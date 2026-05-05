/**
 * User Activity Model
 *
 * Data access layer for user activities
 */

const pool = require('../../../db/pool');

class UserActivityModel {
  static async create(data) {
    const {
      user_id,
      activity_type,
      target_user_id = null,
      title,
      description = null,
      metadata = {}
    } = data;

    const result = await pool.query(
      `INSERT INTO user_activities (user_id, activity_type, target_user_id, title, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user_id, activity_type, target_user_id, title, description, JSON.stringify(metadata)]
    );

    return result.rows[0];
  }

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
        target_user.email as target_user_email,
        target_prof.first_name as target_user_first_name,
        target_prof.last_name as target_user_last_name
      FROM user_activities ua
      LEFT JOIN users target_user ON ua.target_user_id = target_user.id
      LEFT JOIN profiles target_prof ON target_user.id = target_prof.user_id
      WHERE ${whereClause}
      ORDER BY ua.created_at DESC
      LIMIT $2 OFFSET $3`,
      params
    );

    return result.rows;
  }

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

  static async delete(activityId, userId) {
    const result = await pool.query(
      `DELETE FROM user_activities
       WHERE id = $1 AND user_id = $2`,
      [activityId, userId]
    );

    return result.rowCount > 0;
  }

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
