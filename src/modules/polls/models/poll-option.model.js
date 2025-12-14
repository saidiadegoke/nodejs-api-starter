/**
 * Poll Option Model
 *
 * Data access layer for poll options
 * Handles database operations for poll_options table
 */

const pool = require('../../../db/pool');

class PollOptionModel {
  /**
   * Create poll option
   *
   * @param {Object} optionData - Option data
   * @returns {Promise<Object>} Created option
   */
  static async create(optionData) {
    const {
      poll_id,
      label,
      description,
      image_url,
      value,
      position = 0,
      variant_name,
      variant_content
    } = optionData;

    const result = await pool.query(
      `INSERT INTO poll_options (
        poll_id, label, description, image_url, value,
        position, variant_name, variant_content
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [poll_id, label, description, image_url, value, position, variant_name, variant_content]
    );

    return result.rows[0];
  }

  /**
   * Create multiple options at once
   *
   * @param {string} pollId - Poll UUID
   * @param {Array} options - Array of option data
   * @returns {Promise<Array>} Created options
   */
  static async createBulk(pollId, options) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const createdOptions = [];
      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        const result = await client.query(
          `INSERT INTO poll_options (
            poll_id, label, description, image_url, value,
            position, variant_name, variant_content
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            pollId,
            option.label,
            option.description || null,
            option.image_url || null,
            option.value || null,
            option.position || i,
            option.variant_name || null,
            option.variant_content || null
          ]
        );
        createdOptions.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return createdOptions;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get options by poll ID
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Array>} Array of options
   */
  static async getByPollId(pollId) {
    const result = await pool.query(
      `SELECT * FROM poll_options
       WHERE poll_id = $1
       ORDER BY position ASC`,
      [pollId]
    );

    return result.rows;
  }

  /**
   * Get option by ID
   *
   * @param {string} optionId - Option UUID
   * @returns {Promise<Object|null>} Option object or null
   */
  static async getById(optionId) {
    const result = await pool.query(
      'SELECT * FROM poll_options WHERE id = $1',
      [optionId]
    );

    return result.rows[0] || null;
  }

  /**
   * Update option
   *
   * @param {string} optionId - Option UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated option
   */
  static async update(optionId, updates) {
    const allowedFields = ['label', 'description', 'image_url', 'value', 'position'];
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
    values.push(optionId);

    const query = `
      UPDATE poll_options
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete option
   *
   * @param {string} optionId - Option UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(optionId) {
    const result = await pool.query(
      'DELETE FROM poll_options WHERE id = $1',
      [optionId]
    );

    return result.rowCount > 0;
  }

  /**
   * Delete all options for a poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<number>} Number of deleted options
   */
  static async deleteByPollId(pollId) {
    const result = await pool.query(
      'DELETE FROM poll_options WHERE poll_id = $1',
      [pollId]
    );

    return result.rowCount;
  }

  /**
   * Get options with vote counts (from pre-computed analytics)
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Array>} Options with vote counts
   */
  static async getWithVoteCounts(pollId) {
    const result = await pool.query(
      `SELECT
        po.*,
        po.vote_count
      FROM poll_options po
      WHERE po.poll_id = $1
      ORDER BY po.position ASC`,
      [pollId]
    );

    return result.rows;
  }
}

module.exports = PollOptionModel;
