/**
 * Poll Response Service
 *
 * Business logic layer for poll responses
 * Handles user voting and response validation
 */

const PollModel = require('../models/poll.model');
const PollOptionModel = require('../models/poll-option.model');
const PollResponseModel = require('../models/poll-response.model');
const PollResponseValidator = require('../validations/poll-response.validator');
const ResponseFormatter = require('../utils/response-formatter');
const NotificationService = require('../../notifications/services/notification.service');
const UserActivityService = require('../../users/services/user-activity.service');
const VotingEligibilityService = require('./poll-voting-eligibility.service');
const webSocketService = require('../../../shared/services/websocket.service');

class PollResponseService {
  /**
   * Submit or update poll response
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {Object} responseData - Response data
   * @returns {Promise<Object>} Created/updated response
   * @throws {Error} If validation fails
   */
  static async submitResponse(userId, pollId, responseData) {
    // Get poll
    const poll = await PollModel.getById(pollId);

    if (!poll) {
      throw new Error('Poll not found');
    }

    // Check voting eligibility (includes all schedule and frequency restrictions)
    const eligibility = await VotingEligibilityService.canUserVote(pollId, userId);

    if (!eligibility.allowed) {
      throw new Error(eligibility.reason);
    }

    // Get poll options for validation
    const pollOptions = await PollOptionModel.getByPollId(pollId);

    // Validate response based on poll type
    const validation = PollResponseValidator.validate(poll, responseData, pollOptions);

    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    // Use normalized response data
    const normalizedResponse = validation.normalizedResponse;

    // Create or update response
    const response = await PollResponseModel.createOrUpdate({
      poll_id: pollId,
      user_id: userId,
      option_id: normalizedResponse.option_id || null,
      option_ids: normalizedResponse.option_ids || null,
      numeric_value: normalizedResponse.numeric_value !== undefined ? normalizedResponse.numeric_value : null,
      text_value: normalizedResponse.text_value || null,
      ranking_data: normalizedResponse.ranking_data || null,
      metadata: normalizedResponse.metadata || {},
      explanation: normalizedResponse.explanation || null,
      referral_code: responseData.referral_code || null
    });

    try {
      // Create notification for poll author (if not self-vote)
      if (poll.user_id !== userId) {
        const notification = await NotificationService.notifyPollResponse(
          pollId,
          poll.user_id,
          userId,
          poll.question || poll.title
        );

        // Send real-time notification
        if (notification) {
          webSocketService.sendUserNotification(poll.user_id, notification);
        }
      }

      // Get selected option text for activity
      let optionText = 'Unknown option';
      if (normalizedResponse.option_id) {
        const option = await PollOptionModel.getById(normalizedResponse.option_id);
        optionText = option ? option.label : 'Unknown option';
      } else if (normalizedResponse.text_value) {
        optionText = normalizedResponse.text_value;
      } else if (normalizedResponse.numeric_value !== undefined) {
        optionText = normalizedResponse.numeric_value.toString();
      }

      // Create user activity
      await UserActivityService.createVoteActivity(
        userId,
        pollId,
        poll.question || poll.title,
        optionText
      );

      // Update user interests based on vote
      const PersonalizedFeedService = require('./personalized-feed.service');
      await PersonalizedFeedService.updateUserInterests(userId, poll, 'vote');
    } catch (error) {
      console.error('Error creating vote notification/activity:', error);
      // Don't fail the main operation if notification/activity creation fails
    }

    return response;
  }

  /**
   * Get user's response to a poll
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object|null>} User's response or null
   */
  static async getUserResponse(userId, pollId) {
    return await PollResponseModel.getByUserAndPoll(pollId, userId);
  }

  /**
   * Delete user's response
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If response not found
   */
  static async deleteResponse(userId, pollId) {
    const response = await PollResponseModel.getByUserAndPoll(pollId, userId);

    if (!response) {
      throw new Error('Response not found');
    }

    return await PollResponseModel.delete(response.id);
  }

  /**
   * Get poll responses with pagination
   *
   * @param {string} pollId - Poll UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Responses with pagination
   */
  static async getPollResponses(pollId, options = {}) {
    const { page = 1, limit = 50 } = options;

    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    const responses = await PollResponseModel.getByPollId(pollId, { page, limit });
    const total = await PollResponseModel.getCountByPollId(pollId);

    return {
      responses,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get user's response history
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} User's responses with pagination
   */
  static async getUserResponseHistory(userId, options = {}) {
    const { page = 1, limit = 20 } = options;

    const responses = await PollResponseModel.getByUserId(userId, { page, limit });

    return {
      responses,
      pagination: {
        page,
        limit
      }
    };
  }

  /**
   * Check if user has responded to poll
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @returns {Promise<boolean>} Response status
   */
  static async hasUserResponded(userId, pollId) {
    return await PollResponseModel.hasUserResponded(pollId, userId);
  }

  /**
   * Get formatted poll results with aggregated data
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Formatted poll results
   */
  static async getPollResults(pollId) {
    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    const pollOptions = await PollOptionModel.getByPollId(pollId);
    const allResponses = await PollResponseModel.getByPollId(pollId, { limit: 10000 });

    const aggregatedResults = ResponseFormatter.formatAggregatedResults(
      poll,
      allResponses,
      pollOptions
    );

    return {
      poll_id: pollId,
      poll_type: poll.poll_type,
      ...aggregatedResults
    };
  }

  /**
   * Get formatted user response
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object|null>} Formatted user response
   */
  static async getFormattedUserResponse(userId, pollId) {
    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    const response = await PollResponseModel.getByUserAndPoll(pollId, userId);
    if (!response) {
      return null;
    }

    const pollOptions = await PollOptionModel.getByPollId(pollId);

    return ResponseFormatter.formatResponse(poll, response, pollOptions);
  }

  /**
   * Get detailed responses with user info
   *
   * @param {string} pollId - Poll UUID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Detailed responses with pagination
   */
  static async getDetailedResponses(pollId, options) {
    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    const result = await PollResponseModel.getDetailedResponses(pollId, options);

    return {
      poll: {
        id: poll.id,
        question: poll.question,
        poll_type: poll.poll_type,
        category: poll.category,
        created_at: poll.created_at
      },
      ...result
    };
  }

  /**
   * Export poll responses to CSV
   *
   * @param {string} pollId - Poll UUID
   * @param {Object} options - Query options
   * @returns {Promise<string>} CSV data
   */
  static async exportResponsesToCSV(pollId, options) {
    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    // Get all responses (no pagination for CSV export)
    const result = await PollResponseModel.getDetailedResponses(pollId, {
      ...options,
      limit: 10000 // Get all responses for export
    });

    // Build CSV
    const headers = [
      'Response ID',
      'User ID',
      'Email',
      'Display Name',
      'First Name',
      'Last Name',
      'Selected Option',
      'Selected Options',
      'Numeric Value',
      'Text Value',
      'Ranking Data',
      'Explanation',
      'Responded At',
      'Updated At'
    ];

    let csv = headers.join(',') + '\n';

    result.responses.forEach(response => {
      const row = [
        response.response_id,
        response.user_id,
        `"${(response.email || '').replace(/"/g, '""')}"`,
        `"${(response.display_name || '').replace(/"/g, '""')}"`,
        `"${(response.first_name || '').replace(/"/g, '""')}"`,
        `"${(response.last_name || '').replace(/"/g, '""')}"`,
        `"${(response.selected_option || '').replace(/"/g, '""')}"`,
        `"${response.selected_options ? JSON.stringify(response.selected_options).replace(/"/g, '""') : ''}"`,
        response.numeric_value || '',
        `"${(response.text_value || '').replace(/"/g, '""')}"`,
        `"${response.ranking_data ? JSON.stringify(response.ranking_data).replace(/"/g, '""') : ''}"`,
        `"${(response.explanation || '').replace(/"/g, '""')}"`,
        response.responded_at,
        response.updated_at || ''
      ];

      csv += row.join(',') + '\n';
    });

    return csv;
  }
}

module.exports = PollResponseService;
