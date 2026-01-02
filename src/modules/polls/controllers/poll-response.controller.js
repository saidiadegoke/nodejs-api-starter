/**
 * Poll Response Controller
 *
 * HTTP request handler for poll response operations
 * Handles voting, response submission, and response retrieval
 */

const PollResponseService = require('../services/poll-response.service');
const PollService = require('../services/poll.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');
const webSocketService = require('../../../shared/services/websocket.service');

class PollResponseController {
  /**
   * Submit or update poll response
   *
   * @route POST /api/polls/:poll_id/responses
   * @access Private
   */
  static async submitResponse(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;
      const responseData = req.body;

      const response = await PollResponseService.submitResponse(userId, poll_id, responseData);

      // Get updated poll with vote counts to return to client
      const updatedPoll = await PollService.getPollById(poll_id, userId);

      // Get updated poll results and broadcast vote update
      try {
        const updatedResults = await PollResponseService.getPollResults(poll_id);
        webSocketService.broadcastPollVoteUpdate(poll_id, updatedResults);
      } catch (broadcastError) {
        console.error('Failed to broadcast vote update:', broadcastError);
        // Don't fail the request if broadcast fails
      }

      sendSuccess(res, updatedPoll, 'Response submitted successfully', CREATED);
    } catch (error) {
      console.error('Submit response error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message === 'Poll is not active' || error.message === 'Poll has expired') {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.message.includes('required') || error.message.includes('must be') || error.message.includes('Invalid')) {
        return sendError(res, error.message, 422);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's response to a poll
   *
   * @route GET /api/polls/:poll_id/responses/me
   * @access Private
   */
  static async getMyResponse(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      const response = await PollResponseService.getUserResponse(userId, poll_id);

      if (!response) {
        return sendSuccess(res, null, 'No response found', OK);
      }

      sendSuccess(res, response, 'Response retrieved successfully', OK);
    } catch (error) {
      console.error('Get my response error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete user's response
   *
   * @route DELETE /api/polls/:poll_id/responses/me
   * @access Private
   */
  static async deleteMyResponse(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      await PollResponseService.deleteResponse(userId, poll_id);

      // Get updated poll results and broadcast vote update
      try {
        const updatedResults = await PollResponseService.getPollResults(poll_id);
        webSocketService.broadcastPollVoteUpdate(poll_id, updatedResults);
      } catch (broadcastError) {
        console.error('Failed to broadcast vote update:', broadcastError);
        // Don't fail the request if broadcast fails
      }

      sendSuccess(res, null, 'Response deleted successfully', OK);
    } catch (error) {
      console.error('Delete response error:', error);
      if (error.message === 'Response not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get all responses for a poll
   *
   * @route GET /api/polls/:poll_id/responses
   * @access Public
   */
  static async getPollResponses(req, res) {
    try {
      const { poll_id } = req.params;
      const { page, limit } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50
      };

      const result = await PollResponseService.getPollResponses(poll_id, options);

      sendSuccess(res, result, 'Poll responses retrieved successfully', OK);
    } catch (error) {
      console.error('Get poll responses error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's response history
   *
   * @route GET /api/users/me/responses
   * @access Private
   */
  static async getMyResponseHistory(req, res) {
    try {
      const userId = req.user.user_id;
      const { page, limit } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      };

      const result = await PollResponseService.getUserResponseHistory(userId, options);

      sendSuccess(res, result, 'Response history retrieved successfully', OK);
    } catch (error) {
      console.error('Get response history error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Check if user has responded to poll
   *
   * @route GET /api/polls/:poll_id/responses/check
   * @access Private
   */
  static async checkUserResponse(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      const hasResponded = await PollResponseService.hasUserResponded(userId, poll_id);

      sendSuccess(res, { has_responded: hasResponded }, 'Response status checked', OK);
    } catch (error) {
      console.error('Check user response error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get aggregated poll results
   *
   * @route GET /api/polls/:poll_id/results
   * @access Public
   */
  static async getPollResults(req, res) {
    try {
      const { poll_id } = req.params;

      const results = await PollResponseService.getPollResults(poll_id);

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
   * Get formatted user response
   *
   * @route GET /api/polls/:poll_id/my-response
   * @access Private
   */
  static async getFormattedMyResponse(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      const response = await PollResponseService.getFormattedUserResponse(userId, poll_id);

      if (!response) {
        return sendSuccess(res, null, 'No response found', OK);
      }

      sendSuccess(res, response, 'Formatted response retrieved successfully', OK);
    } catch (error) {
      console.error('Get formatted response error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get detailed responses with user info (requires permission)
   *
   * @route GET /api/polls/:poll_id/responses/detailed
   * @access Private - requires polls.view_responses permission
   */
  static async getDetailedResponses(req, res) {
    try {
      const { poll_id } = req.params;
      const { page, limit, search, format } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        search: search || ''
      };

      // Check if CSV export is requested
      if (format === 'csv') {
        const csvData = await PollResponseService.exportResponsesToCSV(poll_id, options);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="poll-${poll_id}-responses.csv"`);
        return res.send(csvData);
      }

      const result = await PollResponseService.getDetailedResponses(poll_id, options);

      sendSuccess(res, result, 'Detailed responses retrieved successfully', OK);
    } catch (error) {
      console.error('Get detailed responses error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = PollResponseController;
