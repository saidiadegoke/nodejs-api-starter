/**
 * Poll Controller
 *
 * HTTP request handler for poll operations
 * Handles poll creation, retrieval, updates, and deletion
 */

const PollService = require('../services/poll.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');

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

      sendSuccess(res, result, 'Poll created successfully', CREATED);
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
      const { page, limit, category, poll_type, status } = req.query;
      const userId = req.user?.user_id || null;

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
}

module.exports = PollController;
