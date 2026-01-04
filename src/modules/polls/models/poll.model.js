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
      expires_at,
      not_for_feed = false,
      // Voting schedule fields
      voting_starts_at,
      voting_ends_at,
      voting_days_of_week,
      voting_time_start,
      voting_time_end,
      allow_revote,
      vote_frequency_type,
      vote_frequency_value
    } = pollData;

    const result = await pool.query(
      `INSERT INTO polls (
        user_id, title, description, question, category, poll_type,
        config, status, visibility, cover_image, duration, expires_at, not_for_feed,
        voting_starts_at, voting_ends_at, voting_days_of_week, voting_time_start, voting_time_end,
        allow_revote, vote_frequency_type, vote_frequency_value
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *`,
      [user_id, title, description, question, category, poll_type,
       JSON.stringify(config), status, visibility, cover_image, duration, expires_at, not_for_feed,
       voting_starts_at, voting_ends_at, voting_days_of_week, voting_time_start, voting_time_end,
       allow_revote, vote_frequency_type, vote_frequency_value]
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
        AND p.not_for_feed = FALSE
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
        AND p.not_for_feed = FALSE
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
    const allowedFields = [
      'title', 'description', 'question', 'category', 'status',
      'visibility', 'cover_image', 'config', 'not_for_feed',
      // Voting schedule fields
      'voting_starts_at', 'voting_ends_at', 'voting_days_of_week',
      'voting_time_start', 'voting_time_end', 'allow_revote',
      'vote_frequency_type', 'vote_frequency_value'
    ];
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

  /**
   * Get trending debates - polls with high engagement velocity
   *
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of trending debate polls
   */
  static async getTrendingDebates({ limit = 5, hours = 48 } = {}) {
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
        -- Calculate debate score: comments are weighted heavily as they indicate discussion
        (COALESCE(s.comments, 0) * 5 + COALESCE(s.responses, 0) * 2 + COALESCE(s.likes, 0) + COALESCE(s.shares, 0) * 3) as debate_score,
        -- Calculate engagement velocity (engagement per hour)
        (COALESCE(s.comments, 0) * 5 + COALESCE(s.responses, 0) * 2 + COALESCE(s.likes, 0) + COALESCE(s.shares, 0) * 3) /
          GREATEST(1, EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) as velocity_score
      FROM polls p
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      WHERE p.deleted_at IS NULL
        AND p.visibility = 'public'
        AND p.status = 'active'
        AND p.created_at > NOW() - INTERVAL '1 hour' * $1
        AND p.poll_type IN ('yesno', 'multipleChoice', 'binaryWithExplanation', 'agreementDistribution', 'likertScale')
        AND (COALESCE(s.responses, 0) >= 10 OR COALESCE(s.comments, 0) >= 3)
      ORDER BY 
        -- Prioritize polls with comments (debates) and good velocity
        (COALESCE(s.comments, 0) * 5 + COALESCE(s.responses, 0) * 2 + COALESCE(s.likes, 0) + COALESCE(s.shares, 0) * 3) /
        GREATEST(1, EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600) DESC,
        s.comments DESC,
        s.responses DESC
      LIMIT $2`,
      [hours, limit]
    );

    return result.rows;
  }

  /**
   * Get trending debates with fallback strategy
   *
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of trending debate polls
   */
  static async getTrendingDebatesWithFallback({ limit = 5 } = {}) {
    // Try 48 hours first
    let polls = await this.getTrendingDebates({ limit, hours: 48 });

    // Fallback 1: Try 7 days if not enough
    if (polls.length < limit) {
      polls = await this.getTrendingDebates({ limit, hours: 168 });
    }

    // Fallback 2: Lower threshold if still not enough
    if (polls.length < limit) {
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
          AND p.poll_type IN ('yesno', 'multipleChoice', 'binaryWithExplanation')
          AND COALESCE(s.responses, 0) >= 20
        ORDER BY engagement_score DESC
        LIMIT $1`,
        [limit]
      );
      polls = result.rows;
    }

    return polls;
  }

  /**
   * Get rising polls - polls with sudden spike in activity
   *
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of rising polls
   */
  static async getRising({ limit = 3 } = {}) {
    const result = await pool.query(
      `WITH recent_activity AS (
        SELECT
          poll_id,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_hour_count,
          COUNT(*) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '2 hours' AND NOW() - INTERVAL '1 hour') as prev_hour_count
        FROM engagement_events
        WHERE created_at > NOW() - INTERVAL '12 hours'
        GROUP BY poll_id
      )
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
        prof.profile_photo_url as profile_photo,
        CASE
          WHEN ra.prev_hour_count > 0
          THEN ((ra.last_hour_count::float / ra.prev_hour_count::float - 1) * 100)::int
          ELSE 100
        END as growth_percentage,
        ra.last_hour_count
      FROM polls p
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      JOIN recent_activity ra ON p.id = ra.poll_id
      WHERE p.deleted_at IS NULL
        AND p.visibility = 'public'
        AND p.status = 'active'
        AND p.created_at > NOW() - INTERVAL '12 hours'
        AND ra.last_hour_count >= 5
      ORDER BY
        CASE
          WHEN ra.prev_hour_count > 0
          THEN ((ra.last_hour_count::float / ra.prev_hour_count::float - 1) * 100)::int
          ELSE 100
        END DESC,
        ra.last_hour_count DESC
      LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get rising polls with fallback strategy
   *
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of rising polls
   */
  static async getRisingWithFallback({ limit = 3 } = {}) {
    // Try 12 hours first
    let polls = await this.getRising({ limit });

    // Fallback 1: Try 24 hours if not enough
    if (polls.length < limit) {
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
          prof.profile_photo_url as profile_photo
        FROM polls p
        LEFT JOIN poll_stats s ON p.id = s.poll_id
        JOIN users u ON p.user_id = u.id
        LEFT JOIN profiles prof ON u.id = prof.user_id
        WHERE p.deleted_at IS NULL
          AND p.visibility = 'public'
          AND p.status = 'active'
          AND p.created_at > NOW() - INTERVAL '24 hours'
        ORDER BY p.created_at DESC
        LIMIT $1`,
        [limit]
      );
      polls = result.rows;
    }

    // Fallback 2: Show newest debates if still not enough
    if (polls.length < limit) {
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
          prof.profile_photo_url as profile_photo
        FROM polls p
        LEFT JOIN poll_stats s ON p.id = s.poll_id
        JOIN users u ON p.user_id = u.id
        LEFT JOIN profiles prof ON u.id = prof.user_id
        WHERE p.deleted_at IS NULL
          AND p.visibility = 'public'
          AND p.status = 'active'
        ORDER BY p.created_at DESC
        LIMIT $1`,
        [limit]
      );
      polls = result.rows;
    }

    return polls;
  }

  /**
   * Get recommended polls for user
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of recommended polls
   */
  static async getRecommended(userId, { limit = 3 } = {}) {
    const result = await pool.query(
      `WITH user_interests AS (
        -- Find categories user has engaged with
        SELECT DISTINCT p.category, COUNT(*) as interaction_count
        FROM poll_responses pr
        JOIN polls p ON pr.poll_id = p.id
        WHERE pr.user_id = $1
        GROUP BY p.category
        ORDER BY interaction_count DESC
        LIMIT 3
      ),
      user_voted_polls AS (
        -- Polls user has already voted on
        SELECT poll_id FROM poll_responses WHERE user_id = $1
      ),
      network_activity AS (
        -- Polls from users in network (users they've engaged with)
        SELECT DISTINCT pe.poll_id, COUNT(*) as network_strength
        FROM poll_engagements pe
        JOIN poll_engagements pe2 ON pe.poll_id = pe2.poll_id
        WHERE pe2.user_id = $1
          AND pe.user_id != $1
        GROUP BY pe.poll_id
        ORDER BY network_strength DESC
      )
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
        prof.profile_photo_url as profile_photo,
        CASE
          WHEN ui.category IS NOT NULL THEN 'Because you follow ' || p.category
          WHEN na.poll_id IS NOT NULL THEN 'Trending in your network'
          ELSE 'Recommended for you'
        END as recommendation_reason,
        (COALESCE(ui.interaction_count, 0) * 10 +
         COALESCE(na.network_strength, 0) * 5 +
         COALESCE(s.responses, 0)) as recommendation_score
      FROM polls p
      LEFT JOIN poll_stats s ON p.id = s.poll_id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN profiles prof ON u.id = prof.user_id
      LEFT JOIN user_interests ui ON p.category = ui.category
      LEFT JOIN network_activity na ON p.id = na.poll_id
      WHERE p.deleted_at IS NULL
        AND p.visibility = 'public'
        AND p.status = 'active'
        AND p.id NOT IN (SELECT poll_id FROM user_voted_polls)
        AND (ui.category IS NOT NULL OR na.poll_id IS NOT NULL)
      ORDER BY (COALESCE(ui.interaction_count, 0) * 10 +
                COALESCE(na.network_strength, 0) * 5 +
                COALESCE(s.responses, 0)) DESC
      LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }

  /**
   * Get recommended polls with fallback for new users
   *
   * @param {string} userId - User UUID (can be null for anonymous)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of recommended polls
   */
  static async getRecommendedWithFallback(userId, { limit = 3 } = {}) {
    // If no userId, return trending polls
    if (!userId) {
      return await this.getTrending({ limit });
    }

    // Try personalized recommendations
    let polls = await this.getRecommended(userId, { limit });

    // Fallback 1: Show trending polls from diverse categories
    if (polls.length < limit) {
      const result = await pool.query(
        `WITH user_voted_polls AS (
          SELECT poll_id FROM poll_responses WHERE user_id = $1
        )
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
          prof.profile_photo_url as profile_photo,
          'Popular this week' as recommendation_reason,
          (COALESCE(s.responses, 0) + COALESCE(s.comments, 0) + COALESCE(s.likes, 0)) as engagement_score
        FROM polls p
        LEFT JOIN poll_stats s ON p.id = s.poll_id
        JOIN users u ON p.user_id = u.id
        LEFT JOIN profiles prof ON u.id = prof.user_id
        WHERE p.deleted_at IS NULL
          AND p.visibility = 'public'
          AND p.status = 'active'
          AND p.created_at > NOW() - INTERVAL '7 days'
          AND p.id NOT IN (SELECT poll_id FROM user_voted_polls)
        ORDER BY engagement_score DESC
        LIMIT $2`,
        [userId, limit]
      );
      polls = result.rows;
    }

    return polls;
  }
}

module.exports = PollModel;
