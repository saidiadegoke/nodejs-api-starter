/**
 * Poll Collection Model
 *
 * Data access layer for poll collections
 * Handles database operations for grouping polls together for sharing
 */

const pool = require('../../../db/pool');
const { nanoid } = require('nanoid');

class PollCollectionModel {
  /**
   * Generate a unique slug for collection
   *
   * @param {string} title - Collection title
   * @returns {Promise<string>} Unique slug
   */
  static async generateSlug(title) {
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    const randomSuffix = nanoid(8);
    return `${baseSlug}-${randomSuffix}`;
  }

  /**
   * Create a new poll collection
   *
   * @param {Object} collectionData - Collection data
   * @param {Array} pollIds - Array of poll IDs to include
   * @returns {Promise<Object>} Created collection with polls
   */
  static async create(collectionData, pollIds = []) {
    const {
      user_id,
      title,
      description,
      is_public = true
    } = collectionData;

    // Generate unique slug
    const slug = await this.generateSlug(title);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create collection
      const collectionResult = await client.query(
        `INSERT INTO poll_collections (user_id, title, description, slug, is_public)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [user_id, title, description, slug, is_public]
      );

      const collection = collectionResult.rows[0];

      // Add polls to collection
      if (pollIds.length > 0) {
        const values = pollIds.map((pollId, index) =>
          `('${collection.id}', '${pollId}', ${index})`
        ).join(', ');

        await client.query(
          `INSERT INTO poll_collection_items (collection_id, poll_id, order_index)
           VALUES ${values}`
        );
      }

      await client.query('COMMIT');

      // Fetch full collection with polls
      return await this.getByIdWithPolls(collection.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get collection by ID
   *
   * @param {string} collectionId - Collection UUID
   * @returns {Promise<Object|null>} Collection object or null
   */
  static async getById(collectionId) {
    const result = await pool.query(
      'SELECT * FROM poll_collections WHERE id = $1 AND deleted_at IS NULL',
      [collectionId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get collection by slug
   *
   * @param {string} slug - Collection slug
   * @returns {Promise<Object|null>} Collection object or null
   */
  static async getBySlug(slug) {
    const result = await pool.query(
      'SELECT * FROM poll_collections WHERE slug = $1 AND deleted_at IS NULL',
      [slug]
    );

    return result.rows[0] || null;
  }

  /**
   * Get collection with all polls
   *
   * @param {string} collectionId - Collection UUID
   * @param {string} userId - User UUID (optional, for checking user responses)
   * @returns {Promise<Object|null>} Collection with polls
   */
  static async getByIdWithPolls(collectionId, userId = null) {
    const collection = await this.getById(collectionId);
    if (!collection) return null;

    // Get polls in collection with their data
    const pollsQuery = `
      SELECT
        p.*,
        pci.order_index,
        s.responses as total_votes,
        s.comments,
        s.likes,
        u.id as author_id,
        prof.first_name,
        prof.last_name,
        u.email,
        prof.profile_photo_url as profile_photo
      FROM poll_collection_items pci
      JOIN polls p ON pci.poll_id = p.id
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE pci.collection_id = $1
      AND p.deleted_at IS NULL
      ORDER BY pci.order_index ASC
    `;

    const pollsResult = await pool.query(pollsQuery, [collectionId]);

    collection.polls = pollsResult.rows;
    collection.total_polls = pollsResult.rows.length;

    // If userId provided, get user progress
    if (userId) {
      const pollIds = collection.polls.map(p => p.id);

      if (pollIds.length > 0) {
        const responsesQuery = `
          SELECT poll_id
          FROM poll_responses
          WHERE user_id = $1
          AND poll_id = ANY($2)
        `;

        const responsesResult = await pool.query(responsesQuery, [userId, pollIds]);
        const completedPollIds = responsesResult.rows.map(r => r.poll_id);

        collection.user_progress = {
          completed_count: completedPollIds.length,
          total_count: collection.total_polls,
          completed_poll_ids: completedPollIds
        };
      } else {
        collection.user_progress = {
          completed_count: 0,
          total_count: 0,
          completed_poll_ids: []
        };
      }
    }

    return collection;
  }

  /**
   * Get collection by slug with all polls
   *
   * @param {string} slug - Collection slug
   * @param {string} userId - User UUID (optional)
   * @returns {Promise<Object|null>} Collection with polls
   */
  static async getBySlugWithPolls(slug, userId = null) {
    const collection = await this.getBySlug(slug);
    if (!collection) return null;

    return await this.getByIdWithPolls(collection.id, userId);
  }

  /**
   * Get collections by user ID
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of collections
   */
  static async getByUserId(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT c.*,
        COUNT(pci.id) as poll_count
       FROM poll_collections c
       LEFT JOIN poll_collection_items pci ON c.id = pci.collection_id
       WHERE c.user_id = $1 AND c.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Add poll to collection
   *
   * @param {string} collectionId - Collection UUID
   * @param {string} pollId - Poll UUID
   * @param {number} orderIndex - Order in collection
   * @returns {Promise<Object>} Created collection item
   */
  static async addPoll(collectionId, pollId, orderIndex = null) {
    // If no orderIndex provided, append to end
    if (orderIndex === null) {
      const countResult = await pool.query(
        'SELECT COUNT(*) as count FROM poll_collection_items WHERE collection_id = $1',
        [collectionId]
      );
      orderIndex = parseInt(countResult.rows[0].count);
    }

    const result = await pool.query(
      `INSERT INTO poll_collection_items (collection_id, poll_id, order_index)
       VALUES ($1, $2, $3)
       ON CONFLICT (collection_id, poll_id)
       DO UPDATE SET order_index = $3
       RETURNING *`,
      [collectionId, pollId, orderIndex]
    );

    return result.rows[0];
  }

  /**
   * Remove poll from collection
   *
   * @param {string} collectionId - Collection UUID
   * @param {string} pollId - Poll UUID
   * @returns {Promise<boolean>} Success status
   */
  static async removePoll(collectionId, pollId) {
    const result = await pool.query(
      'DELETE FROM poll_collection_items WHERE collection_id = $1 AND poll_id = $2',
      [collectionId, pollId]
    );

    return result.rowCount > 0;
  }

  /**
   * Reorder polls in collection
   *
   * @param {string} collectionId - Collection UUID
   * @param {Array} pollIds - Array of poll IDs in new order
   * @returns {Promise<boolean>} Success status
   */
  static async reorderPolls(collectionId, pollIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < pollIds.length; i++) {
        await client.query(
          `UPDATE poll_collection_items
           SET order_index = $1
           WHERE collection_id = $2 AND poll_id = $3`,
          [i, collectionId, pollIds[i]]
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

  /**
   * Update collection
   *
   * @param {string} collectionId - Collection UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated collection
   */
  static async update(collectionId, updates) {
    const allowedFields = ['title', 'description', 'is_public'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (fields.length === 0) {
      return await this.getById(collectionId);
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = [collectionId, ...fields.map(field => updates[field])];

    const result = await pool.query(
      `UPDATE poll_collections SET ${setClause} WHERE id = $1 RETURNING *`,
      values
    );

    return result.rows[0];
  }

  /**
   * Soft delete collection
   *
   * @param {string} collectionId - Collection UUID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(collectionId) {
    const result = await pool.query(
      'UPDATE poll_collections SET deleted_at = NOW() WHERE id = $1',
      [collectionId]
    );

    return result.rowCount > 0;
  }

  /**
   * Check if user owns collection
   *
   * @param {string} collectionId - Collection UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} True if user owns collection
   */
  static async isOwner(collectionId, userId) {
    const result = await pool.query(
      'SELECT id FROM poll_collections WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [collectionId, userId]
    );

    return result.rows.length > 0;
  }

  /**
   * Get poll IDs in collection
   *
   * @param {string} collectionId - Collection UUID
   * @returns {Promise<Array>} Array of objects with poll_id
   */
  static async getCollectionPolls(collectionId) {
    const result = await pool.query(
      'SELECT poll_id FROM poll_collection_items WHERE collection_id = $1 ORDER BY order_index ASC',
      [collectionId]
    );

    return result.rows;
  }

  /**
   * Get collection statistics
   *
   * @param {string} collectionId - Collection UUID
   * @returns {Promise<Object>} Collection statistics
   */
  static async getStats(collectionId) {
    // Get total unique participants (users who voted on at least one poll)
    const participantsQuery = `
      SELECT COUNT(DISTINCT pr.user_id) as total_participants
      FROM poll_responses pr
      JOIN poll_collection_items pci ON pr.poll_id = pci.poll_id
      WHERE pci.collection_id = $1
    `;

    const participantsResult = await pool.query(participantsQuery, [collectionId]);
    const totalParticipants = parseInt(participantsResult.rows[0].total_participants) || 0;

    // Get completion statistics
    const pollCountQuery = `
      SELECT COUNT(*) as total_polls
      FROM poll_collection_items
      WHERE collection_id = $1
    `;

    const pollCountResult = await pool.query(pollCountQuery, [collectionId]);
    const totalPolls = parseInt(pollCountResult.rows[0].total_polls);

    // Calculate average completion rate
    let averageCompletionRate = 0;
    if (totalParticipants > 0 && totalPolls > 0) {
      const completionQuery = `
        SELECT
          pr.user_id,
          COUNT(DISTINCT pr.poll_id) as completed_polls
        FROM poll_responses pr
        JOIN poll_collection_items pci ON pr.poll_id = pci.poll_id
        WHERE pci.collection_id = $1
        GROUP BY pr.user_id
      `;

      const completionResult = await pool.query(completionQuery, [collectionId]);

      const totalCompletionPercentage = completionResult.rows.reduce((sum, row) => {
        return sum + (parseInt(row.completed_polls) / totalPolls) * 100;
      }, 0);

      averageCompletionRate = totalCompletionPercentage / totalParticipants;
    }

    return {
      total_participants: totalParticipants,
      total_polls: totalPolls,
      average_completion_rate: parseFloat(averageCompletionRate.toFixed(2))
    };
  }
}

module.exports = PollCollectionModel;
