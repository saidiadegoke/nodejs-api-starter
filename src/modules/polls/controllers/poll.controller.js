/**
 * Poll Controller
 *
 * HTTP request handler for poll operations
 * Handles poll creation, retrieval, updates, and deletion
 */

const pool = require('../../../db/pool');
const PollService = require('../services/poll.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');
const webSocketService = require('../../../shared/services/websocket.service');

class PollController {
  /**
   * Create a new poll
   *
   * @route POST /api/polls
   * @access Private
   */
  static async createPoll(req, res) {
    try {
      const userId = req.user.user_id;
      const pollData = req.body;

      const result = await PollService.createPoll(userId, pollData);

      // Create a consistent poll object with options (same as other endpoints)
      const pollWithOptions = {
        ...result.poll,
        options: result.options || []
      };

      // Broadcast poll creation to WebSocket clients
      webSocketService.broadcastPollCreated(pollWithOptions);

      sendSuccess(res, pollWithOptions, 'Poll created successfully', CREATED);
    } catch (error) {
      console.error('Create poll error:', error);
      if (error.message.includes('required') || error.message.includes('must be')) {
        return sendError(res, error.message, 422);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get poll by ID
   *
   * @route GET /api/polls/:poll_id
   * @access Public
   */
  static async getPoll(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user?.user_id || null;

      const poll = await PollService.getPollById(poll_id, userId);

      sendSuccess(res, poll, 'Poll retrieved successfully', OK);
    } catch (error) {
      console.error('Get poll error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get polls feed
   *
   * @route GET /api/polls
   * @access Public (optionalAuth for user-specific data)
   */
  static async getPollsFeed(req, res) {
    try {
      const { page, limit, category, poll_type, status, personalized } = req.query;
      const userId = req.user?.user_id || null;

      // Use personalized feed if user is logged in and requests it
      if (userId && personalized === 'true') {
        const PersonalizedFeedService = require('../services/personalized-feed.service');
        const result = await PersonalizedFeedService.getPersonalizedFeed(userId, {
          page: parseInt(page) || 1,
          limit: parseInt(limit) || 20
        });
        return sendSuccess(res, result, 'Personalized feed retrieved successfully', OK);
      }

      // Default to general feed
      const filters = {
        category,
        poll_type,
        status
      };

      const pagination = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      };

      const result = await PollService.getPollsFeed(filters, pagination, userId);

      sendSuccess(res, result, 'Polls retrieved successfully', OK);
    } catch (error) {
      console.error('Get polls feed error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get trending polls
   *
   * @route GET /api/polls/trending
   * @access Public (optionalAuth for user-specific data)
   */
  static async getTrendingPolls(req, res) {
    try {
      const { page, limit } = req.query;
      const userId = req.user?.user_id || null;

      const pagination = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10
      };

      const polls = await PollService.getTrendingPolls(pagination, userId);

      sendSuccess(res, { polls }, 'Trending polls retrieved successfully', OK);
    } catch (error) {
      console.error('Get trending polls error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's polls
   *
   * @route GET /api/polls/my-polls
   * @access Private
   */
  static async getMyPolls(req, res) {
    try {
      const userId = req.user.user_id;
      const { page, limit, status } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        status
      };

      const result = await PollService.getUserPolls(userId, options);

      sendSuccess(res, result, 'Your polls retrieved successfully', OK);
    } catch (error) {
      console.error('Get user polls error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update poll
   *
   * @route PUT /api/polls/:poll_id
   * @access Private (owner only)
   */
  static async updatePoll(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;
      const updates = req.body;

      const poll = await PollService.updatePoll(poll_id, userId, updates);

      // Broadcast poll update to WebSocket clients
      webSocketService.broadcastPollUpdated(poll);

      sendSuccess(res, poll, 'Poll updated successfully', OK);
    } catch (error) {
      console.error('Update poll error:', error);
      if (error.message === 'Not authorized to update this poll') {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Close poll
   *
   * @route POST /api/polls/:poll_id/close
   * @access Private (owner only)
   */
  static async closePoll(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      const poll = await PollService.closePoll(poll_id, userId);

      // Broadcast poll update to WebSocket clients
      webSocketService.broadcastPollUpdated(poll);

      sendSuccess(res, poll, 'Poll closed successfully', OK);
    } catch (error) {
      console.error('Close poll error:', error);
      if (error.message.includes('Not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete poll
   *
   * @route DELETE /api/polls/:poll_id
   * @access Private (owner only)
   */
  static async deletePoll(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      await PollService.deletePoll(poll_id, userId);

      // Broadcast poll deletion to WebSocket clients
      webSocketService.broadcastPollDeleted(poll_id);

      sendSuccess(res, null, 'Poll deleted successfully', OK);
    } catch (error) {
      console.error('Delete poll error:', error);
      if (error.message.includes('Not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get poll results
   *
   * @route GET /api/polls/:poll_id/results
   * @access Public
   */
  static async getPollResults(req, res) {
    try {
      const { poll_id } = req.params;

      const results = await PollService.getPollResults(poll_id);

      sendSuccess(res, results, 'Poll results retrieved successfully', OK);
    } catch (error) {
      console.error('Get poll results error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get trending debates for sidebar
   *
   * @route GET /api/polls/sidebar/trending-debates
   * @access Public (optionalAuth for user-specific data)
   */
  static async getTrendingDebates(req, res) {
    try {
      const { limit } = req.query;
      const userId = req.user?.user_id || null;

      const options = {
        limit: parseInt(limit) || 5
      };

      const debates = await PollService.getTrendingDebates(options, userId);

      sendSuccess(res, { debates }, 'Trending debates retrieved successfully', OK);
    } catch (error) {
      console.error('Get trending debates error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get rising polls for sidebar
   *
   * @route GET /api/polls/sidebar/rising
   * @access Public (optionalAuth for user-specific data)
   */
  static async getRisingPolls(req, res) {
    try {
      const { limit } = req.query;
      const userId = req.user?.user_id || null;

      const options = {
        limit: parseInt(limit) || 3
      };

      const rising = await PollService.getRisingPolls(options, userId);

      sendSuccess(res, { rising }, 'Rising polls retrieved successfully', OK);
    } catch (error) {
      console.error('Get rising polls error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get recommended polls for user
   *
   * @route GET /api/polls/sidebar/recommended
   * @access Public (optionalAuth, returns trending if not authenticated)
   */
  static async getRecommendedPolls(req, res) {
    try {
      const { limit } = req.query;
      const userId = req.user?.user_id || null;

      const options = {
        limit: parseInt(limit) || 3
      };

      const recommended = await PollService.getRecommendedPolls(userId, options);

      sendSuccess(res, { recommended }, 'Recommended polls retrieved successfully', OK);
    } catch (error) {
      console.error('Get recommended polls error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user poll statistics
   *
   * @route GET /api/polls/me/stats
   * @access Private
   */
  static async getMyPollStats(req, res) {
    try {
      const userId = req.user.user_id;

      // Get polls created count
      const pollsCreatedResult = await pool.query(
        'SELECT COUNT(*) as count FROM polls WHERE user_id = $1 AND deleted_at IS NULL',
        [userId]
      );

      // Get votes cast count
      const votesCastResult = await pool.query(
        'SELECT COUNT(*) as count FROM poll_responses WHERE user_id = $1',
        [userId]
      );

      // Get comments count
      const commentsResult = await pool.query(
        'SELECT COUNT(*) as count FROM poll_comments WHERE user_id = $1 AND deleted_at IS NULL',
        [userId]
      );

      // Get total likes received on user's polls
      const likesResult = await pool.query(
        `SELECT COALESCE(SUM(s.likes), 0) as total_likes
         FROM polls p
         LEFT JOIN poll_stats s ON p.id = s.poll_id
         WHERE p.user_id = $1 AND p.deleted_at IS NULL`,
        [userId]
      );

      // Get total votes received on user's polls
      const votesReceivedResult = await pool.query(
        `SELECT COALESCE(SUM(s.responses), 0) as total_votes
         FROM polls p
         LEFT JOIN poll_stats s ON p.id = s.poll_id
         WHERE p.user_id = $1 AND p.deleted_at IS NULL`,
        [userId]
      );

      // Calculate points (simplified formula)
      const pollsCreated = parseInt(pollsCreatedResult.rows[0].count) || 0;
      const votesCast = parseInt(votesCastResult.rows[0].count) || 0;
      const comments = parseInt(commentsResult.rows[0].count) || 0;
      const likesReceived = parseInt(likesResult.rows[0].total_likes) || 0;
      const votesReceived = parseInt(votesReceivedResult.rows[0].total_votes) || 0;

      const points = (pollsCreated * 50) + (votesCast * 5) + (comments * 10) + (likesReceived * 2) + (votesReceived * 1);

      const stats = {
        polls_created: pollsCreated,
        votes_cast: votesCast,
        comments: comments,
        likes_received: likesReceived,
        votes_received: votesReceived,
        points: points,
        followers: 0, // TODO: Implement followers system
        following: 0  // TODO: Implement following system
      };

      sendSuccess(res, stats, 'Poll statistics retrieved successfully', OK);
    } catch (error) {
      console.error('Get poll stats error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Search polls with comprehensive criteria
   *
   * @route GET /api/polls/search
   * @access Public (optionalAuth)
   */
  static async searchPolls(req, res) {
    try {
      const {
        q, // search query
        category,
        poll_type,
        author,
        page = 1,
        limit = 20,
        status = 'active',
        filter // trending, rising, recommended
      } = req.query;

      const userId = req.user?.user_id || null;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Build dynamic query
      let queryParams = [];
      let paramIndex = 1;
      let whereConditions = ['p.deleted_at IS NULL'];

      // Full-text search across multiple fields
      if (q && q.trim()) {
        const searchTerm = `%${q.trim()}%`;
        whereConditions.push(
          `(
            p.question ILIKE $${paramIndex} OR
            p.title ILIKE $${paramIndex} OR
            p.description ILIKE $${paramIndex} OR
            p.category ILIKE $${paramIndex} OR
            prof.first_name ILIKE $${paramIndex} OR
            prof.last_name ILIKE $${paramIndex} OR
            u.email ILIKE $${paramIndex}
          )`
        );
        queryParams.push(searchTerm);
        paramIndex++;
      }

      // Filter by category
      if (category && category !== 'All') {
        whereConditions.push(`p.category = $${paramIndex}`);
        queryParams.push(category);
        paramIndex++;
      }

      // Filter by poll type
      if (poll_type) {
        whereConditions.push(`p.poll_type = $${paramIndex}`);
        queryParams.push(poll_type);
        paramIndex++;
      }

      // Filter by status
      if (status) {
        whereConditions.push(`p.status = $${paramIndex}`);
        queryParams.push(status);
        paramIndex++;
      }

      // Filter by author (user email or name)
      if (author && author.trim()) {
        const authorTerm = `%${author.trim()}%`;
        whereConditions.push(
          `(
            prof.first_name ILIKE $${paramIndex} OR
            prof.last_name ILIKE $${paramIndex} OR
            u.email ILIKE $${paramIndex}
          )`
        );
        queryParams.push(authorTerm);
        paramIndex++;
      }

      // Always show public polls
      whereConditions.push(`p.visibility = 'public'`);

      const whereClause = whereConditions.join(' AND ');

      // Determine ORDER BY clause based on filter
      let orderByClause;
      switch (filter) {
        case 'trending':
          // Sort by engagement score (views + responses + comments + likes)
          orderByClause = `ORDER BY (COALESCE(s.views, 0) + COALESCE(s.responses, 0) * 2 + COALESCE(s.comments, 0) * 3 + COALESCE(s.likes, 0) * 2) DESC, p.created_at DESC`;
          break;
        case 'rising':
          // Sort by recent activity (created in last 7 days with high engagement)
          orderByClause = `ORDER BY 
            CASE WHEN p.created_at > NOW() - INTERVAL '7 days' 
            THEN (COALESCE(s.responses, 0) + COALESCE(s.views, 0) / 10) 
            ELSE 0 END DESC, p.created_at DESC`;
          break;
        case 'recommended':
          // For now, sort by engagement but could be enhanced with user preferences
          orderByClause = `ORDER BY (COALESCE(s.responses, 0) + COALESCE(s.likes, 0)) DESC, p.created_at DESC`;
          break;
        default:
          orderByClause = `ORDER BY p.created_at DESC`;
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM polls p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN profiles prof ON u.id = prof.user_id
        WHERE ${whereClause}
      `;

      const countResult = await pool.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // Get polls with pagination
      queryParams.push(parseInt(limit));
      const limitParam = paramIndex;
      paramIndex++;

      queryParams.push(offset);
      const offsetParam = paramIndex;

      const pollsQuery = `
        SELECT
          p.*,
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
        WHERE ${whereClause}
        ${orderByClause}
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `;

      const pollsResult = await pool.query(pollsQuery, queryParams);
      const polls = pollsResult.rows;

      // Fetch options with vote counts for each poll
      for (const poll of polls) {
        const PollOptionModel = require('../models/poll-option.model');
        const PollResponseModel = require('../models/poll-response.model');
        const PollContextModel = require('../models/poll-context.model');

        const options = await PollOptionModel.getWithVoteCounts(poll.id);
        const totalVotes = poll.responses || 0;

        poll.options = options.map(opt => ({
          ...opt,
          vote_count: parseInt(opt.vote_count) || 0,
          percentage: totalVotes > 0 ? Math.round((parseInt(opt.vote_count) / totalVotes) * 100) : 0
        }));

        // Get poll contexts
        poll.contexts = await PollContextModel.getByPollIdWithBlocks(poll.id);

        // Get user's response if logged in
        if (userId) {
          poll.user_response = await PollResponseModel.getByUserAndPoll(poll.id, userId);
        }
      }

      const totalPages = Math.ceil(total / parseInt(limit));

      sendSuccess(res, {
        polls,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          total_pages: totalPages,
          hasMore: parseInt(page) < totalPages
        }
      }, 'Polls retrieved successfully', OK);
    } catch (error) {
      console.error('Search polls error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = PollController;
