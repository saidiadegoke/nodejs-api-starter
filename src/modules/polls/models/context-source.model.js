/**
 * Context Source Model
 *
 * Data access layer for context sources (research, articles, reports)
 * Handles database operations for context_sources table
 */

const pool = require('../../../db/pool');

class ContextSourceModel {
  /**
   * Create a new context source
   *
   * @param {Object} sourceData - Source data
   * @returns {Promise<Object>} Created source
   */
  static async create(sourceData) {
    const {
      source_type,
      title,
      summary,
      author,
      publisher,
      source_url,
      publication_date,
      credibility_score,
      tags = [],
      created_by
    } = sourceData;

    const result = await pool.query(
      `INSERT INTO context_sources (
        source_type, title, summary, author, publisher, source_url,
        publication_date, credibility_score, tags, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [source_type, title, summary, author, publisher, source_url,
       publication_date, credibility_score, tags, created_by]
    );

    return result.rows[0];
  }

  /**
   * Get source by ID
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<Object|null>} Source object or null
   */
  static async getById(sourceId) {
    const result = await pool.query(
      'SELECT * FROM context_sources WHERE id = $1 AND deleted_at IS NULL',
      [sourceId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get source with blocks
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<Object|null>} Source with blocks
   */
  static async getByIdWithBlocks(sourceId) {
    const sourceResult = await pool.query(
      'SELECT * FROM context_sources WHERE id = $1 AND deleted_at IS NULL',
      [sourceId]
    );

    if (sourceResult.rowCount === 0) return null;

    const blocksResult = await pool.query(
      `SELECT * FROM context_blocks
       WHERE source_id = $1
       ORDER BY order_index ASC`,
      [sourceId]
    );

    return {
      ...sourceResult.rows[0],
      blocks: blocksResult.rows
    };
  }

  /**
   * Get sources by type
   *
   * @param {string} sourceType - Source type
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of sources
   */
  static async getByType(sourceType, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT * FROM context_sources
       WHERE source_type = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [sourceType, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get sources by tags
   *
   * @param {Array} tags - Tags to filter by
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of sources
   */
  static async getByTags(tags, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT * FROM context_sources
       WHERE tags && $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tags, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get sources by creator
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of sources
   */
  static async getByCreator(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT * FROM context_sources
       WHERE created_by = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Search sources
   *
   * @param {string} searchQuery - Search query
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of matching sources
   */
  static async search(searchQuery, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT * FROM context_sources
       WHERE (
         title ILIKE $1 OR
         summary ILIKE $1 OR
         author ILIKE $1 OR
         publisher ILIKE $1
       )
       AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${searchQuery}%`, limit, offset]
    );

    return result.rows;
  }

  /**
   * Update source
   *
   * @param {string} sourceId - Source UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated source
   */
  static async update(sourceId, updates) {
    const allowedFields = ['title', 'summary', 'author', 'publisher', 'source_url',
                           'publication_date', 'credibility_score', 'tags'];
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(sourceId);

    const query = `
      UPDATE context_sources
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Soft delete source
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(sourceId) {
    const result = await pool.query(
      `UPDATE context_sources
       SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [sourceId]
    );

    return result.rowCount > 0;
  }

  /**
   * Get total count
   *
   * @param {Object} filters - Filter options
   * @returns {Promise<number>} Total count
   */
  static async getCount({ source_type, tags } = {}) {
    let query = 'SELECT COUNT(*) FROM context_sources WHERE deleted_at IS NULL';
    const params = [];

    if (source_type) {
      params.push(source_type);
      query += ` AND source_type = $${params.length}`;
    }

    if (tags && tags.length > 0) {
      params.push(tags);
      query += ` AND tags && $${params.length}`;
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count);
  }
}

module.exports = ContextSourceModel;
