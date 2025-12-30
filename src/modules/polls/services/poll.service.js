/**
 * Poll Service
 *
 * Business logic layer for polls
 * Handles poll creation, updates, and retrieval with business rules
 */

const PollModel = require('../models/poll.model');
const PollOptionModel = require('../models/poll-option.model');
const PollResponseModel = require('../models/poll-response.model');
const PollEngagementModel = require('../models/poll-engagement.model');
const PollContextModel = require('../models/poll-context.model');
const PollTypeValidator = require('../validations/poll-type.validator');
const ResponseFormatter = require('../utils/response-formatter');
const UserActivityService = require('../../users/services/user-activity.service');

class PollService {
  /**
   * Create a new poll with options
   *
   * @param {string} userId - User UUID
   * @param {Object} pollData - Poll data including options
   * @returns {Promise<Object>} Created poll with options
   * @throws {Error} If validation fails
   */
  static async createPoll(userId, pollData) {
    const {
      title,
      description,
      question,
      category,
      poll_type,
      config = {},
      cover_image,
      duration = '7d',
      options = []
    } = pollData;

    // Basic validation
    if (!question || question.trim().length < 10) {
      throw new Error('Poll question must be at least 10 characters');
    }

    if (!poll_type) {
      throw new Error('Poll type is required');
    }

    // Poll type-specific validation
    const validation = PollTypeValidator.validate({
      poll_type,
      question,
      options,
      config
    });

    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    // Calculate expiry time
    const expires_at = this.calculateExpiryTime(duration);

    // Create poll
    const poll = await PollModel.create({
      user_id: userId,
      title: title || question.substring(0, 100),
      description,
      question,
      category,
      poll_type,
      config,
      cover_image,
      duration,
      expires_at
    });

    // Create options if provided (for choice-based polls)
    let createdOptions = [];
    if (options.length > 0) {
      createdOptions = await PollOptionModel.createBulk(poll.id, options);
    }

    try {
      // Create user activity for poll creation
      await UserActivityService.createPollActivity(
        userId,
        poll.id,
        poll.question || poll.title
      );
    } catch (error) {
      console.error('Error creating poll activity:', error);
      // Don't fail the main operation if activity creation fails
    }

    return {
      poll,
      options: createdOptions
    };
  }

  /**
   * Get poll by ID with full details
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID (optional, for checking user interactions)
   * @returns {Promise<Object>} Poll with options, stats, and user engagement
   * @throws {Error} If poll not found
   */
  static async getPollById(pollId, userId = null) {
    const poll = await PollModel.getByIdWithAuthor(pollId);

    if (!poll) {
      throw new Error('Poll not found');
    }

    // Get poll options
    const options = await PollOptionModel.getWithVoteCounts(pollId);

    // Get user's response if logged in
    let userResponse = null;
    let userEngagements = [];
    if (userId) {
      userResponse = await PollResponseModel.getByUserAndPoll(pollId, userId);
      userEngagements = await PollEngagementModel.getUserEngagements(pollId, userId);
    }

    // Get poll contexts
    const contexts = await PollContextModel.getByPollIdWithBlocks(pollId);

    // Calculate percentages for options
    const totalVotes = await PollResponseModel.getCountByPollId(pollId);
    const optionsWithPercentages = options.map(option => ({
      ...option,
      percentage: totalVotes > 0 ? ((parseInt(option.vote_count) / totalVotes) * 100).toFixed(1) : 0
    }));

    // For slider and prediction market polls, calculate aggregate statistics
    let aggregateStats = null;
    if (poll.poll_type === 'slider' || poll.poll_type === 'predictionMarket') {
      const ResponseFormatter = require('../utils/response-formatter');
      // Get all responses (use large limit to get all)
      const allResponses = await PollResponseModel.getByPollId(pollId, { page: 1, limit: 10000 });
      aggregateStats = ResponseFormatter.aggregateNumeric(allResponses, poll);
    }

    return {
      ...poll,
      options: optionsWithPercentages,
      total_votes: totalVotes,
      aggregate_stats: aggregateStats,
      user_response: userResponse,
      user_engagements: userEngagements,
      contexts: contexts
    };
  }

  /**
   * Get polls feed
   *
   * @param {Object} filters - Filter options
   * @param {Object} pagination - Pagination options
   * @param {string} userId - User UUID (optional)
   * @returns {Promise<Object>} Polls with pagination
   */
  static async getPollsFeed(filters = {}, pagination = {}, userId = null) {
    const { page = 1, limit = 20 } = pagination;
    const { category, poll_type, status } = filters;

    const polls = await PollModel.getFeed({
      page,
      limit,
      category,
      poll_type,
      status
    });

    // Fetch options with vote counts and user responses for each poll
    for (const poll of polls) {
      const options = await PollOptionModel.getWithVoteCounts(poll.id);
      const totalVotes = poll.responses || 0;

      // Add percentage to each option
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

    const total = await PollModel.getCount({ category, poll_type, status });
    const total_pages = Math.ceil(total / limit);

    return {
      polls,
      pagination: {
        page,
        limit,
        total,
        total_pages,
        hasMore: page < total_pages
      }
    };
  }

  /**
   * Get trending polls
   *
   * @param {Object} pagination - Pagination options
   * @param {string} userId - User UUID (optional)
   * @returns {Promise<Array>} Trending polls
   */
  static async getTrendingPolls(pagination = {}, userId = null) {
    const { page = 1, limit = 10 } = pagination;

    const polls = await PollModel.getTrending({ page, limit });

    // Fetch options with vote counts and user responses for each poll
    for (const poll of polls) {
      const options = await PollOptionModel.getWithVoteCounts(poll.id);
      const totalVotes = poll.responses || 0;

      // Add percentage to each option
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

    return polls;
  }

  /**
   * Update poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated poll
   * @throws {Error} If not authorized or validation fails
   */
  static async updatePoll(pollId, userId, updates) {
    // Verify ownership
    const isOwner = await PollModel.isOwner(pollId, userId);
    if (!isOwner) {
      throw new Error('Not authorized to update this poll');
    }

    // Check if poll is still open
    const poll = await PollModel.getById(pollId);
    if (poll.status === 'closed') {
      throw new Error('Cannot update a closed poll');
    }

    return await PollModel.update(pollId, updates);
  }

  /**
   * Close poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} Updated poll
   * @throws {Error} If not authorized
   */
  static async closePoll(pollId, userId) {
    const isOwner = await PollModel.isOwner(pollId, userId);
    if (!isOwner) {
      throw new Error('Not authorized to close this poll');
    }

    return await PollModel.close(pollId);
  }

  /**
   * Delete poll
   *
   * @param {string} pollId - Poll UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If not authorized
   */
  static async deletePoll(pollId, userId) {
    const isOwner = await PollModel.isOwner(pollId, userId);
    if (!isOwner) {
      throw new Error('Not authorized to delete this poll');
    }

    return await PollModel.delete(pollId);
  }

  /**
   * Get user's polls
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Filter and pagination options
   * @returns {Promise<Object>} User's polls with pagination
   */
  static async getUserPolls(userId, options = {}) {
    const { page = 1, limit = 20, status } = options;

    const polls = await PollModel.getByUserId(userId, { page, limit, status });

    // Fetch options with vote counts for each poll
    for (const poll of polls) {
      const options = await PollOptionModel.getWithVoteCounts(poll.id);
      const totalVotes = poll.responses || 0;

      // Add percentage to each option
      poll.options = options.map(opt => ({
        ...opt,
        vote_count: parseInt(opt.vote_count) || 0,
        percentage: totalVotes > 0 ? Math.round((parseInt(opt.vote_count) / totalVotes) * 100) : 0
      }));

      // Get poll contexts
      poll.contexts = await PollContextModel.getByPollIdWithBlocks(poll.id);
    }

    // Get total count for pagination
    const total = await PollModel.getCount({ user_id: userId, status });
    const total_pages = Math.ceil(total / limit);

    return {
      polls,
      pagination: {
        page,
        limit,
        total,
        total_pages,
        hasMore: page < total_pages
      }
    };
  }

  /**
   * Calculate expiry time based on duration string
   *
   * @param {string} duration - Duration string (1h, 6h, 1d, 3d, 7d, etc.)
   * @returns {Date|null} Expiry timestamp or null for no expiry
   */
  static calculateExpiryTime(duration) {
    if (!duration || duration === 'never') {
      return null;
    }

    const now = new Date();
    const match = duration.match(/^(\d+)([hdwm])$/);

    if (!match) {
      // Default to 7 days if invalid format
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers = {
      h: 60 * 60 * 1000,        // hours
      d: 24 * 60 * 60 * 1000,    // days
      w: 7 * 24 * 60 * 60 * 1000, // weeks
      m: 30 * 24 * 60 * 60 * 1000 // months (approximate)
    };

    return new Date(now.getTime() + value * multipliers[unit]);
  }

  /**
   * Get poll results/statistics
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Poll results
   * @throws {Error} If poll not found
   */
  static async getPollResults(pollId) {
    const poll = await PollModel.getById(pollId);

    if (!poll) {
      throw new Error('Poll not found');
    }

    const totalResponses = await PollResponseModel.getCountByPollId(pollId);

    let results = {};

    // Get results based on poll type
    switch (poll.poll_type) {
      case 'slider':
      case 'likertScale':
      case 'predictionMarket':
        results = await PollResponseModel.getNumericStats(pollId);
        break;

      case 'openEnded':
        results.responses = await PollResponseModel.getTextResponses(pollId);
        break;

      case 'ranking':
        results.rankings = await PollResponseModel.getRankingStats(pollId);
        break;

      default:
        // Choice-based polls
        results.options = await PollOptionModel.getWithVoteCounts(pollId);
        results.optionCounts = await PollResponseModel.getCountsByOption(pollId);
    }

    return {
      poll,
      total_responses: totalResponses,
      results
    };
  }

  /**
   * Get trending debates for sidebar
   *
   * @param {Object} options - Query options
   * @param {string} userId - User UUID (optional)
   * @returns {Promise<Array>} Array of trending debates with options
   */
  static async getTrendingDebates({ limit = 5 } = {}, userId = null) {
    const polls = await PollModel.getTrendingDebatesWithFallback({ limit });

    // Fetch options with vote counts for each poll
    for (const poll of polls) {
      const options = await PollOptionModel.getWithVoteCounts(poll.id);
      const totalVotes = poll.responses || 0;

      // Add percentage to each option
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

    return polls;
  }

  /**
   * Get rising polls for sidebar
   *
   * @param {Object} options - Query options
   * @param {string} userId - User UUID (optional)
   * @returns {Promise<Array>} Array of rising polls with options
   */
  static async getRisingPolls({ limit = 3 } = {}, userId = null) {
    const polls = await PollModel.getRisingWithFallback({ limit });

    // Fetch options with vote counts for each poll
    for (const poll of polls) {
      const options = await PollOptionModel.getWithVoteCounts(poll.id);
      const totalVotes = poll.responses || 0;

      // Add percentage to each option
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

    return polls;
  }

  /**
   * Get recommended polls for user
   *
   * @param {string} userId - User UUID (required)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of recommended polls with options
   */
  static async getRecommendedPolls(userId, { limit = 3 } = {}) {
    const polls = await PollModel.getRecommendedWithFallback(userId, { limit });

    // Fetch options with vote counts for each poll
    for (const poll of polls) {
      const options = await PollOptionModel.getWithVoteCounts(poll.id);
      const totalVotes = poll.responses || 0;

      // Add percentage to each option
      poll.options = options.map(opt => ({
        ...opt,
        vote_count: parseInt(opt.vote_count) || 0,
        percentage: totalVotes > 0 ? Math.round((parseInt(opt.vote_count) / totalVotes) * 100) : 0
      }));

      // Get poll contexts
      poll.contexts = await PollContextModel.getByPollIdWithBlocks(poll.id);

      // Always get user's response (they're logged in for recommendations)
      poll.user_response = await PollResponseModel.getByUserAndPoll(poll.id, userId);
    }

    return polls;
  }
}

module.exports = PollService;
