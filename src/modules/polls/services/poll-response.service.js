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

    // Check if poll is active
    if (poll.status !== 'active') {
      throw new Error('Poll is not active');
    }

    // Check if poll has expired
    if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
      throw new Error('Poll has expired');
    }

    // Check if user has already voted
    const existingResponse = await PollResponseModel.getByUserAndPoll(pollId, userId);

    if (existingResponse) {
      // Check if poll allows vote changes
      const allowVoteChanges = poll.config?.allow_vote_changes || false;

      if (!allowVoteChanges) {
        throw new Error('You have already voted on this poll. Vote changes are not allowed.');
      }
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
}

module.exports = PollResponseService;
