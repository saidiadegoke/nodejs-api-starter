/**
 * Poll Engagement Controller
 *
 * HTTP request handler for poll engagement operations
 * Handles likes, bookmarks, shares, views, and reposts
 */

const PollEngagementService = require('../services/poll-engagement.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class PollEngagementController {
  /**
   * Toggle like on poll
   *
   * @route POST /api/polls/:poll_id/like
   * @access Private
   */
  static async toggleLike(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      const result = await PollEngagementService.toggleLike(userId, poll_id);

      sendSuccess(res, result, `Poll ${result.action === 'added' ? 'liked' : 'unliked'} successfully`, OK);
    } catch (error) {
      console.error('Toggle like error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Toggle bookmark on poll
   *
   * @route POST /api/polls/:poll_id/bookmark
   * @access Private
   */
  static async toggleBookmark(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      const result = await PollEngagementService.toggleBookmark(userId, poll_id);

      sendSuccess(res, result, `Poll ${result.action === 'added' ? 'bookmarked' : 'unbookmarked'} successfully`, OK);
    } catch (error) {
      console.error('Toggle bookmark error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Record poll share
   *
   * @route POST /api/polls/:poll_id/share
   * @access Private
   */
  static async recordShare(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;
      const metadata = req.body;

      const engagement = await PollEngagementService.recordShare(userId, poll_id, metadata);

      sendSuccess(res, engagement, 'Share recorded successfully', CREATED);
    } catch (error) {
      console.error('Record share error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Record poll repost
   *
   * @route POST /api/polls/:poll_id/repost
   * @access Private
   */
  static async recordRepost(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;
      const metadata = req.body;

      const engagement = await PollEngagementService.recordRepost(userId, poll_id, metadata);

      sendSuccess(res, engagement, 'Repost recorded successfully', CREATED);
    } catch (error) {
      console.error('Record repost error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Record poll view
   *
   * @route POST /api/polls/:poll_id/view
   * @access Public (can be anonymous)
   */
  static async recordView(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user?.user_id || null;
      const metadata = {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        ...req.body
      };

      const engagement = await PollEngagementService.recordView(userId, poll_id, metadata);

      sendSuccess(res, engagement, 'View recorded successfully', CREATED);
    } catch (error) {
      console.error('Record view error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's engagements for a poll
   *
   * @route GET /api/polls/:poll_id/engagements/me
   * @access Private
   */
  static async getMyEngagements(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      const engagements = await PollEngagementService.getUserEngagements(userId, poll_id);

      sendSuccess(res, { engagements }, 'User engagements retrieved successfully', OK);
    } catch (error) {
      console.error('Get user engagements error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's bookmarked polls
   *
   * @route GET /api/users/me/bookmarks
   * @access Private
   */
  static async getMyBookmarks(req, res) {
    try {
      const userId = req.user.user_id;
      const { page, limit } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      };

      const result = await PollEngagementService.getUserBookmarks(userId, options);

      sendSuccess(res, result, 'Bookmarks retrieved successfully', OK);
    } catch (error) {
      console.error('Get bookmarks error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get engagement counts for a poll
   *
   * @route GET /api/polls/:poll_id/engagements/counts
   * @access Public
   */
  static async getEngagementCounts(req, res) {
    try {
      const { poll_id } = req.params;

      const counts = await PollEngagementService.getEngagementCounts(poll_id);

      sendSuccess(res, counts, 'Engagement counts retrieved successfully', OK);
    } catch (error) {
      console.error('Get engagement counts error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get users who liked a poll
   *
   * @route GET /api/polls/:poll_id/likes
   * @access Public
   */
  static async getPollLikes(req, res) {
    try {
      const { poll_id } = req.params;
      const { page, limit } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      };

      const result = await PollEngagementService.getPollLikes(poll_id, options);

      sendSuccess(res, result, 'Poll likes retrieved successfully', OK);
    } catch (error) {
      console.error('Get poll likes error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = PollEngagementController;
