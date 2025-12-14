/**
 * Poll Comment Model
 *
 * Handles database operations for poll comments
 */

const pool = require('../../../db/pool');

class PollCommentModel {
  /**
   * Create a new comment
   *
   * @param {Object} commentData - Comment data
   * @returns {Promise<Object>} Created comment
   */
  static async create({ poll_id, user_id, comment, parent_comment_id = null }) {
    const result = await pool.query(
      `INSERT INTO poll_comments (poll_id, user_id, comment, parent_comment_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [poll_id, user_id, comment, parent_comment_id]
    );

    return result.rows[0];
  }

  /**
   * Get comment by ID
   *
   * @param {string} commentId - Comment UUID
   * @returns {Promise<Object|null>} Comment or null
   */
  static async getById(commentId) {
    const result = await pool.query(
      `SELECT
        c.*,
        u.id as author_id,
        u.email,
        prof.first_name,
        prof.last_name,
        prof.profile_photo_url as profile_photo,
        (SELECT COUNT(*) FROM poll_comments WHERE parent_comment_id = c.id AND deleted_at IS NULL) as reply_count
      FROM poll_comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE c.id = $1 AND c.deleted_at IS NULL AND c.is_hidden = FALSE`,
      [commentId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get comments for a poll
   *
   * @param {string} pollId - Poll UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of comments
   */
  static async getByPollId(pollId, { page = 1, limit = 20, parent_comment_id = null } = {}) {
    const offset = (page - 1) * limit;

    const parentCondition = parent_comment_id
      ? 'AND c.parent_comment_id = $2'
      : 'AND c.parent_comment_id IS NULL';

    const params = parent_comment_id
      ? [pollId, parent_comment_id, limit, offset]
      : [pollId, limit, offset];

    const paramOffset = parent_comment_id ? 3 : 2;

    const result = await pool.query(
      `SELECT
        c.*,
        u.id as author_id,
        u.email,
        prof.first_name,
        prof.last_name,
        prof.profile_photo_url as profile_photo,
        (SELECT COUNT(*) FROM poll_comments WHERE parent_comment_id = c.id AND deleted_at IS NULL) as reply_count,
        0 as likes_count
      FROM poll_comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE c.poll_id = $1 ${parentCondition}
        AND c.deleted_at IS NULL
        AND c.is_hidden = FALSE
      ORDER BY c.created_at DESC
      LIMIT $${paramOffset} OFFSET $${paramOffset + 1}`,
      params
    );

    return result.rows;
  }

  /**
   * Get comment count for a poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<number>} Comment count
   */
  static async getCountByPollId(pollId) {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM poll_comments
       WHERE poll_id = $1 AND deleted_at IS NULL AND is_hidden = FALSE`,
      [pollId]
    );

    return parseInt(result.rows[0].count);
  }

  /**
   * Update a comment
   *
   * @param {string} commentId - Comment UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated comment
   */
  static async update(commentId, updates) {
    const allowedFields = ['comment', 'is_flagged', 'is_hidden'];
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(commentId);

    const result = await pool.query(
      `UPDATE poll_comments
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Soft delete a comment
   *
   * @param {string} commentId - Comment UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(commentId) {
    const result = await pool.query(
      `UPDATE poll_comments
       SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [commentId]
    );

    return result.rowCount > 0;
  }

  /**
   * Check if user owns the comment
   *
   * @param {string} commentId - Comment UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} True if owner
   */
  static async isOwner(commentId, userId) {
    const result = await pool.query(
      `SELECT EXISTS(
        SELECT 1 FROM poll_comments
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      ) as is_owner`,
      [commentId, userId]
    );

    return result.rows[0].is_owner;
  }

  /**
   * Get user's comments
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} User's comments
   */
  static async getByUserId(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
        c.*,
        p.question as poll_question,
        (SELECT COUNT(*) FROM poll_comments WHERE parent_comment_id = c.id AND deleted_at IS NULL) as reply_count,
        0 as likes_count
      FROM poll_comments c
      JOIN polls p ON c.poll_id = p.id
      WHERE c.user_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }
}

module.exports = PollCommentModel;
