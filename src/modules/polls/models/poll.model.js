/**
 * Poll Model
 *
 * Data access layer for polls
 * Handles all database operations for the polls table
 */

const pool = require('../../../db/pool');

class PollModel {
  /**
   * Create a new poll
   *
   * @param {Object} pollData - Poll data
   * @returns {Promise<Object>} Created poll
   */
  static async create(pollData) {
    const {
      user_id,
      title,
      description,
      question,
      category,
      poll_type,
      config = {},
      status = 'active',
      visibility = 'public',
      cover_image,
      duration,
      expires_at
    } = pollData;

    const result = await pool.query(
      `INSERT INTO polls (
        user_id, title, description, question, category, poll_type,
        config, status, visibility, cover_image, duration, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [user_id, title, description, question, category, poll_type,
       JSON.stringify(config), status, visibility, cover_image, duration, expires_at]
    );

    return result.rows[0];
  }

  /**
   * Get poll by ID
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object|null>} Poll object or null
   */
  static async getById(pollId) {
    const result = await pool.query(
      'SELECT * FROM polls WHERE id = $1 AND deleted_at IS NULL',
      [pollId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get poll with author information
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object|null>} Poll with author details
   */
  static async getByIdWithAuthor(pollId) {
    const result = await pool.query(
      `SELECT
        p.*,
        s.responses,
        s.comments,
        s.likes,
        s.shares,
        s.reposts,
        s.views,
        u.id as author_id,
        prof.first_name,
        prof.last_name,
        u.email,
        prof.profile_photo_url as profile_photo
      FROM polls p
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [pollId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get polls by user ID
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of polls
   */
  static async getByUserId(userId, { page = 1, limit = 20, status } = {}) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT
        p.*,
        p.id as id,
        s.responses,
        s.comments,
        s.likes,
        s.shares,
        s.reposts,
        s.views,
        u.id as author_id,
        u.email,
        prof.first_name,
        prof.last_name,
        prof.profile_photo_url as profile_photo
      FROM polls p
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE p.user_id = $1 AND p.deleted_at IS NULL
    `;
    const params = [userId];

    if (status) {
      query += ` AND p.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get polls feed (paginated with filters)
   *
   * @param {Object} options - Filter and pagination options
   * @returns {Promise<Array>} Array of polls
   */
  static async getFeed({ page = 1, limit = 20, category, poll_type, status = 'active' } = {}) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT
        p.*,
        p.id as id,
        s.responses,
        s.comments,
        s.likes,
        s.shares,
        s.reposts,
        s.views,
        u.id as author_id,
        u.email,
        prof.first_name,
        prof.last_name,
        prof.profile_photo_url as profile_photo
      FROM polls p
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE p.deleted_at IS NULL
        AND p.visibility = 'public'
        AND p.status = $1
        AND (p.expires_at IS NULL OR p.expires_at > NOW())
    `;
    const params = [status];

    if (category) {
      query += ` AND p.category = $${params.length + 1}`;
      params.push(category);
    }

    if (poll_type) {
      query += ` AND p.poll_type = $${params.length + 1}`;
      params.push(poll_type);
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get trending polls
   *
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of trending polls
   */
  static async getTrending({ page = 1, limit = 10 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
        p.*,
        p.id as id,
        s.responses,
        s.comments,
        s.likes,
        s.shares,
        s.reposts,
        s.views,
        u.id as author_id,
        u.email,
        prof.first_name,
        prof.last_name,
        prof.profile_photo_url as profile_photo,
        (COALESCE(s.responses, 0) + COALESCE(s.comments, 0) + COALESCE(s.likes, 0) + COALESCE(s.shares, 0) * 2) as engagement_score
      FROM polls p
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE p.deleted_at IS NULL
        AND p.visibility = 'public'
        AND p.status = 'active'
        AND p.created_at > NOW() - INTERVAL '7 days'
      ORDER BY engagement_score DESC, p.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  }

  /**
   * Update poll
   *
   * @param {string} pollId - Poll UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated poll
   */
  static async update(pollId, updates) {
    const allowedFields = ['title', 'description', 'question', 'category', 'status',
                           'visibility', 'cover_image', 'config'];
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(key === 'config' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(pollId);

    const query = `
      UPDATE polls
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Close poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Updated poll
   */
  static async close(pollId) {
    const result = await pool.query(
      `UPDATE polls
       SET status = 'closed', closed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [pollId]
    );

    return result.rows[0];
  }

  /**
   * Soft delete poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(pollId) {
    const result = await pool.query(
      `UPDATE polls
       SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [pollId]
    );

    return result.rowCount > 0;
  }

  /**
   * Get total count for pagination
   *
   * @param {Object} filters - Filter options
   * @returns {Promise<number>} Total count
   */
  static async getCount({ category, poll_type, status = 'active' } = {}) {
    let query = `
      SELECT COUNT(*)
      FROM polls
      WHERE deleted_at IS NULL
        AND visibility = 'public'
        AND status = $1
    `;
    const params = [status];

    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    if (poll_type) {
      query += ` AND poll_type = $${params.length + 1}`;
      params.push(poll_type);
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count);
  }

  /**
   * Check if user owns poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} Ownership status
   */
  static async isOwner(pollId, userId) {
    const result = await pool.query(
      'SELECT id FROM polls WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [pollId, userId]
    );

    return result.rowCount > 0;
  }
}

module.exports = PollModel;
