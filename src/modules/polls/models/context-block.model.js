/**
 * Context Block Model
 *
 * Data access layer for context blocks (presentation blocks)
 * Handles database operations for context_blocks table
 */

const pool = require('../../../db/pool');

class ContextBlockModel {
  /**
   * Create a new context block
   *
   * @param {Object} blockData - Block data
   * @returns {Promise<Object>} Created block
   */
  static async create(blockData) {
    const {
      source_id,
      block_type,
      content,
      media_url,
      citation,
      order_index = 0,
      display_config = {}
    } = blockData;

    const result = await pool.query(
      `INSERT INTO context_blocks (
        source_id, block_type, content, media_url, citation,
        order_index, display_config
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [source_id, block_type, content, media_url, citation,
       order_index, JSON.stringify(display_config)]
    );

    return result.rows[0];
  }

  /**
   * Create multiple blocks at once
   *
   * @param {string} sourceId - Source UUID
   * @param {Array} blocks - Array of block data
   * @returns {Promise<Array>} Created blocks
   */
  static async createBulk(sourceId, blocks) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const createdBlocks = [];
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const result = await client.query(
          `INSERT INTO context_blocks (
            source_id, block_type, content, media_url, citation,
            order_index, display_config
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [
            sourceId,
            block.block_type,
            block.content || null,
            block.media_url || null,
            block.citation || null,
            block.order_index !== undefined ? block.order_index : i,
            JSON.stringify(block.display_config || {})
          ]
        );
        createdBlocks.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return createdBlocks;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get blocks by source ID
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<Array>} Array of blocks
   */
  static async getBySourceId(sourceId) {
    const result = await pool.query(
      `SELECT * FROM context_blocks
       WHERE source_id = $1
       ORDER BY order_index ASC`,
      [sourceId]
    );

    return result.rows;
  }

  /**
   * Get block by ID
   *
   * @param {string} blockId - Block UUID
   * @returns {Promise<Object|null>} Block object or null
   */
  static async getById(blockId) {
    const result = await pool.query(
      'SELECT * FROM context_blocks WHERE id = $1',
      [blockId]
    );

    return result.rows[0] || null;
  }

  /**
   * Update block
   *
   * @param {string} blockId - Block UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated block
   */
  static async update(blockId, updates) {
    const allowedFields = ['block_type', 'content', 'media_url', 'citation',
                           'order_index', 'display_config'];
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(key === 'display_config' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(blockId);

    const query = `
      UPDATE context_blocks
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete block
   *
   * @param {string} blockId - Block UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(blockId) {
    const result = await pool.query(
      'DELETE FROM context_blocks WHERE id = $1',
      [blockId]
    );

    return result.rowCount > 0;
  }

  /**
   * Delete all blocks for a source
   *
   * @param {string} sourceId - Source UUID
   * @returns {Promise<number>} Number of deleted blocks
   */
  static async deleteBySourceId(sourceId) {
    const result = await pool.query(
      'DELETE FROM context_blocks WHERE source_id = $1',
      [sourceId]
    );

    return result.rowCount;
  }

  /**
   * Reorder blocks for a source
   *
   * @param {string} sourceId - Source UUID
   * @param {Array} blockOrder - Array of {id, order_index} objects
   * @returns {Promise<boolean>} Success status
   */
  static async reorder(sourceId, blockOrder) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const { id, order_index } of blockOrder) {
        await client.query(
          `UPDATE context_blocks
           SET order_index = $1, updated_at = NOW()
           WHERE id = $2 AND source_id = $3`,
          [order_index, id, sourceId]
        );
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = ContextBlockModel;
