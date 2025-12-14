/**
 * Poll Context Model
 *
 * Data access layer for poll-context linking
 * Handles database operations for poll_contexts table
 */

const pool = require('../../../db/pool');

class PollContextModel {
  /**
   * Link context source to poll
   *
   * @param {Object} linkData - Link data
   * @returns {Promise<Object>} Created link
   */
  static async create(linkData) {
    const {
      poll_id,
      source_id,
      display_position = 'pre_poll',
      is_required = false,
      order_index = 0
    } = linkData;

    const result = await pool.query(
      `INSERT INTO poll_contexts (
        poll_id, source_id, display_position, is_required, order_index
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [poll_id, source_id, display_position, is_required, order_index]
    );

    return result.rows[0];
  }

  /**
   * Link multiple sources to a poll
   *
   * @param {string} pollId - Poll UUID
   * @param {Array} sources - Array of source link data
   * @returns {Promise<Array>} Created links
   */
  static async createBulk(pollId, sources) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const createdLinks = [];
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        const result = await client.query(
          `INSERT INTO poll_contexts (
            poll_id, source_id, display_position, is_required, order_index
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING *`,
          [
            pollId,
            source.source_id,
            source.display_position || 'pre_poll',
            source.is_required || false,
            source.order_index !== undefined ? source.order_index : i
          ]
        );
        createdLinks.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return createdLinks;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get contexts for a poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Array>} Array of context sources
   */
  static async getByPollId(pollId) {
    const result = await pool.query(
      `SELECT
        pc.*,
        cs.source_type,
        cs.title,
        cs.summary,
        cs.author,
        cs.publisher,
        cs.source_url,
        cs.publication_date,
        cs.credibility_score,
        cs.tags
      FROM poll_contexts pc
      JOIN context_sources cs ON pc.source_id = cs.id
      WHERE pc.poll_id = $1 AND cs.deleted_at IS NULL
      ORDER BY pc.order_index ASC`,
      [pollId]
    );

    return result.rows;
  }

  /**
   * Get contexts with blocks for a poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Array>} Array of context sources with blocks
   */
  static async getByPollIdWithBlocks(pollId) {
    const contextsResult = await pool.query(
      `SELECT
        pc.*,
        cs.source_type,
        cs.title,
        cs.summary,
        cs.author,
        cs.publisher,
        cs.source_url,
        cs.publication_date,
        cs.credibility_score,
        cs.tags
      FROM poll_contexts pc
      JOIN context_sources cs ON pc.source_id = cs.id
      WHERE pc.poll_id = $1 AND cs.deleted_at IS NULL
      ORDER BY pc.order_index ASC`,
      [pollId]
    );

    const contexts = contextsResult.rows;

    // Get blocks for each context
    for (const context of contexts) {
      const blocksResult = await pool.query(
        `SELECT * FROM context_blocks
         WHERE source_id = $1
         ORDER BY order_index ASC`,
        [context.source_id]
      );
      context.blocks = blocksResult.rows;
    }

    return contexts;
  }

  /**
   * Get required contexts for a poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Array>} Array of required context sources
   */
  static async getRequiredByPollId(pollId) {
    const result = await pool.query(
      `SELECT
        pc.*,
        cs.source_type,
        cs.title,
        cs.summary,
        cs.author,
        cs.publisher,
        cs.source_url,
        cs.publication_date,
        cs.credibility_score,
        cs.tags
      FROM poll_contexts pc
      JOIN context_sources cs ON pc.source_id = cs.id
      WHERE pc.poll_id = $1 AND pc.is_required = TRUE AND cs.deleted_at IS NULL
      ORDER BY pc.order_index ASC`,
      [pollId]
    );

    return result.rows;
  }

  /**
   * Get polls using a source
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<Array>} Array of polls
   */
  static async getPollsBySourceId(sourceId) {
    const result = await pool.query(
      `SELECT
        p.*,
        pc.display_position,
        pc.is_required,
        pc.order_index
      FROM poll_contexts pc
      JOIN polls p ON pc.poll_id = p.id
      WHERE pc.source_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC`,
      [sourceId]
    );

    return result.rows;
  }

  /**
   * Update poll context link
   *
   * @param {string} pollId - Poll UUID
   * @param {string} sourceId - Source UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated link
   */
  static async update(pollId, sourceId, updates) {
    const allowedFields = ['display_position', 'is_required', 'order_index'];
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

    values.push(pollId, sourceId);

    const query = `
      UPDATE poll_contexts
      SET ${fields.join(', ')}
      WHERE poll_id = $${paramCount} AND source_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Remove context from poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} sourceId - Source UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(pollId, sourceId) {
    const result = await pool.query(
      'DELETE FROM poll_contexts WHERE poll_id = $1 AND source_id = $2',
      [pollId, sourceId]
    );

    return result.rowCount > 0;
  }

  /**
   * Remove all contexts from a poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<number>} Number of deleted links
   */
  static async deleteByPollId(pollId) {
    const result = await pool.query(
      'DELETE FROM poll_contexts WHERE poll_id = $1',
      [pollId]
    );

    return result.rowCount;
  }

  /**
   * Check if poll has required contexts
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<boolean>} Has required contexts
   */
  static async hasRequiredContexts(pollId) {
    const result = await pool.query(
      'SELECT COUNT(*) FROM poll_contexts WHERE poll_id = $1 AND is_required = TRUE',
      [pollId]
    );

    return parseInt(result.rows[0].count) > 0;
  }
}

module.exports = PollContextModel;
