/**
 * Polymorphic Comment Model
 *
 * Handles database operations for comments on multiple entity types
 * Supports polls, context sources, and other commentable entities
 */

const pool = require('../../db/pool');

class CommentModel {
  /**
   * Create a new comment
   *
   * @param {Object} commentData - Comment data
   * @returns {Promise<Object>} Created comment
   */
  static async create({ commentable_type, commentable_id, user_id, comment, parent_comment_id = null }) {
    const result = await pool.query(
      `INSERT INTO comments (commentable_type, commentable_id, user_id, comment, parent_comment_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [commentable_type, commentable_id, user_id, comment, parent_comment_id]
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
        (SELECT COUNT(*) FROM comments WHERE parent_comment_id = c.id AND deleted_at IS NULL) as reply_count
      FROM comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE c.id = $1 AND c.deleted_at IS NULL AND c.is_hidden = FALSE`,
      [commentId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get comments for a specific entity
   *
   * @param {string} commentableType - Type of entity ('poll', 'context_source', etc.)
   * @param {string} commentableId - Entity UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of comments
   */
  static async getByEntity(commentableType, commentableId, { page = 1, limit = 20, parent_comment_id = null } = {}) {
    const offset = (page - 1) * limit;

    const parentCondition = parent_comment_id
      ? 'AND c.parent_comment_id = $3'
      : 'AND c.parent_comment_id IS NULL';

    const params = parent_comment_id
      ? [commentableType, commentableId, parent_comment_id, limit, offset]
      : [commentableType, commentableId, limit, offset];

    const paramOffset = parent_comment_id ? 4 : 3;

    const result = await pool.query(
      `SELECT
        c.*,
        u.id as author_id,
        u.email,
        prof.first_name,
        prof.last_name,
        prof.profile_photo_url as profile_photo,
        (SELECT COUNT(*) FROM comments WHERE parent_comment_id = c.id AND deleted_at IS NULL) as reply_count,
        0 as likes_count
      FROM comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE c.commentable_type = $1 
        AND c.commentable_id = $2 
        ${parentCondition}
        AND c.deleted_at IS NULL
        AND c.is_hidden = FALSE
      ORDER BY c.created_at DESC
      LIMIT $${paramOffset} OFFSET $${paramOffset + 1}`,
      params
    );

    return result.rows;
  }

  /**
   * Get comment count for a specific entity
   *
   * @param {string} commentableType - Type of entity
   * @param {string} commentableId - Entity UUID
   * @returns {Promise<number>} Comment count
   */
  static async getCountByEntity(commentableType, commentableId) {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM comments
       WHERE commentable_type = $1 
         AND commentable_id = $2 
         AND deleted_at IS NULL 
         AND is_hidden = FALSE`,
      [commentableType, commentableId]
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
    const allowedFields = ['comment', 'is_flagged', 'is_hidden', 'flagged_reason'];
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
      `UPDATE comments
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
      `UPDATE comments
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
        SELECT 1 FROM comments
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
   * @param {Object} options - Pagination and filtering options
   * @returns {Promise<Array>} User's comments
   */
  static async getByUserId(userId, { page = 1, limit = 20, commentable_type = null } = {}) {
    const offset = (page - 1) * limit;
    
    let typeCondition = '';
    let params = [userId, limit, offset];
    
    if (commentable_type) {
      typeCondition = 'AND c.commentable_type = $4';
      params.push(commentable_type);
    }

    const result = await pool.query(
      `SELECT
        c.*,
        CASE 
          WHEN c.commentable_type = 'poll' THEN p.question
          WHEN c.commentable_type = 'context_source' THEN cs.title
          ELSE 'Unknown Entity'
        END as entity_title,
        (SELECT COUNT(*) FROM comments WHERE parent_comment_id = c.id AND deleted_at IS NULL) as reply_count,
        0 as likes_count
      FROM comments c
      LEFT JOIN polls p ON c.commentable_type = 'poll' AND c.commentable_id = p.id
      LEFT JOIN context_sources cs ON c.commentable_type = 'context_source' AND c.commentable_id = cs.id
      WHERE c.user_id = $1 AND c.deleted_at IS NULL ${typeCondition}
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3`,
      params
    );

    return result.rows;
  }

  /**
   * Get comments with replies (nested structure)
   *
   * @param {string} commentableType - Type of entity
   * @param {string} commentableId - Entity UUID
   * @param {Object} options - Options
   * @returns {Promise<Array>} Array of comments with nested replies
   */
  static async getWithReplies(commentableType, commentableId, { page = 1, limit = 20 } = {}) {
    // Get top-level comments
    const topLevelComments = await this.getByEntity(commentableType, commentableId, { page, limit });

    // Get replies for each top-level comment
    for (const comment of topLevelComments) {
      comment.replies = await this.getByEntity(
        commentableType, 
        commentableId, 
        { parent_comment_id: comment.id, limit: 10 }
      );
    }

    return topLevelComments;
  }
}

module.exports = CommentModel;