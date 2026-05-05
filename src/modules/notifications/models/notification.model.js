/**
 * Notification Model
 *
 * Data access layer for notifications
 */

const pool = require('../../../db/pool');

class NotificationModel {
  /**
   * Create a notification
   *
   * @param {Object} data - Notification data
   * @returns {Promise<Object>} Created notification
   */
  static async create(data) {
    const {
      user_id,
      type,
      actor_id = null,
      message,
      metadata = {}
    } = data;

    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, actor_id, message, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, type, actor_id, message, JSON.stringify(metadata)]
    );

    return result.rows[0];
  }

  /**
   * Get user's notifications with pagination
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Notifications
   */
  static async getByUser(userId, { page = 1, limit = 20, unread_only = false } = {}) {
    const offset = (page - 1) * limit;

    let whereClause = 'n.user_id = $1';
    const params = [userId, limit, offset];

    if (unread_only) {
      whereClause += ' AND n.read = false';
    }

    const result = await pool.query(
      `SELECT
        n.*,
        actor.email as actor_email,
        actor_prof.first_name as actor_first_name,
        actor_prof.last_name as actor_last_name,
        actor_prof.profile_photo_url as actor_photo
      FROM notifications n
      LEFT JOIN users actor ON n.actor_id = actor.id
      LEFT JOIN profiles actor_prof ON actor.id = actor_prof.user_id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT $2 OFFSET $3`,
      params
    );

    return result.rows;
  }

  /**
   * Get unread notification count
   *
   * @param {string} userId - User UUID
   * @returns {Promise<number>} Unread count
   */
  static async getUnreadCount(userId) {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE user_id = $1 AND read = false`,
      [userId]
    );

    return parseInt(result.rows[0].count) || 0;
  }

  /**
   * Mark notification as read
   *
   * @param {string} notificationId - Notification UUID
   * @param {string} userId - User UUID (for verification)
   * @returns {Promise<Object>} Updated notification
   */
  static async markAsRead(notificationId, userId) {
    const result = await pool.query(
      `UPDATE notifications
       SET read = true, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );

    return result.rows[0];
  }

  /**
   * Mark all notifications as read for a user
   *
   * @param {string} userId - User UUID
   * @returns {Promise<number>} Number of notifications marked as read
   */
  static async markAllAsRead(userId) {
    const result = await pool.query(
      `UPDATE notifications
       SET read = true, updated_at = NOW()
       WHERE user_id = $1 AND read = false
       RETURNING id`,
      [userId]
    );

    return result.rowCount;
  }

  /**
   * Delete notification
   *
   * @param {string} notificationId - Notification UUID
   * @param {string} userId - User UUID (for verification)
   * @returns {Promise<boolean>} Success status
   */
  static async delete(notificationId, userId) {
    const result = await pool.query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );

    return result.rowCount > 0;
  }

  /**
   * Delete all notifications for a user
   *
   * @param {string} userId - User UUID
   * @returns {Promise<number>} Number of notifications deleted
   */
  static async deleteAll(userId) {
    const result = await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1`,
      [userId]
    );

    return result.rowCount;
  }
}

module.exports = NotificationModel;
