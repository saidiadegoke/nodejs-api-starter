/**
 * Poll Engagement Service
 *
 * Business logic layer for poll engagements
 * Handles likes, bookmarks, shares, views
 */

const PollModel = require('../models/poll.model');
const PollEngagementModel = require('../models/poll-engagement.model');

class PollEngagementService {
  /**
   * Toggle like on poll
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Result with action (added/removed)
   * @throws {Error} If poll not found
   */
  static async toggleLike(userId, pollId) {
    await this.verifyPollExists(pollId);

    return await PollEngagementModel.toggleEngagement(pollId, userId, 'like');
  }

  /**
   * Toggle bookmark on poll
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Result with action (added/removed)
   * @throws {Error} If poll not found
   */
  static async toggleBookmark(userId, pollId) {
    await this.verifyPollExists(pollId);

    return await PollEngagementModel.toggleEngagement(pollId, userId, 'bookmark');
  }

  /**
   * Record poll share
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {Object} metadata - Share metadata (platform, etc.)
   * @returns {Promise<Object>} Created engagement
   * @throws {Error} If poll not found
   */
  static async recordShare(userId, pollId, metadata = {}) {
    await this.verifyPollExists(pollId);

    return await PollEngagementModel.create(pollId, userId, 'share', metadata);
  }

  /**
   * Record poll repost
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {Object} metadata - Repost metadata
   * @returns {Promise<Object>} Created engagement
   * @throws {Error} If poll not found
   */
  static async recordRepost(userId, pollId, metadata = {}) {
    await this.verifyPollExists(pollId);

    return await PollEngagementModel.create(pollId, userId, 'repost', metadata);
  }

  /**
   * Record poll view
   *
   * @param {string|null} userId - User UUID (null for anonymous)
   * @param {string} pollId - Poll UUID
   * @param {Object} metadata - View metadata (IP, user agent, etc.)
   * @returns {Promise<Object|null>} Created engagement or null
   * @throws {Error} If poll not found
   */
  static async recordView(userId, pollId, metadata = {}) {
    await this.verifyPollExists(pollId);

    return await PollEngagementModel.recordView(pollId, userId, metadata);
  }

  /**
   * Get user's engagements for a poll
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Array>} Array of engagement types
   */
  static async getUserEngagements(userId, pollId) {
    return await PollEngagementModel.getUserEngagements(pollId, userId);
  }

  /**
   * Get user's bookmarked polls
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Bookmarked polls with pagination
   */
  static async getUserBookmarks(userId, options = {}) {
    const { page = 1, limit = 20 } = options;

    const polls = await PollEngagementModel.getUserBookmarks(userId, { page, limit });

    return {
      polls,
      pagination: {
        page,
        limit
      }
    };
  }

  /**
   * Get engagement counts for a poll
   *
   * @param {string} pollId - Poll UUID
   * @returns {Promise<Object>} Engagement counts by type
   */
  static async getEngagementCounts(pollId) {
    return await PollEngagementModel.getCountsByType(pollId);
  }

  /**
   * Check if user has engaged with poll
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {string} engagementType - Type (like, bookmark, etc.)
   * @returns {Promise<boolean>} Engagement status
   */
  static async hasUserEngaged(userId, pollId, engagementType) {
    return await PollEngagementModel.hasEngaged(pollId, userId, engagementType);
  }

  /**
   * Get users who liked a poll
   *
   * @param {string} pollId - Poll UUID
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Users with pagination
   */
  static async getPollLikes(pollId, options = {}) {
    const { page = 1, limit = 20 } = options;

    const users = await PollEngagementModel.getUsersByEngagement(
      pollId,
      'like',
      { page, limit }
    );

    return {
      users,
      pagination: {
        page,
        limit
      }
    };
  }

  /**
   * Remove engagement
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {string} engagementType - Type
   * @returns {Promise<boolean>} Success status
   */
  static async removeEngagement(userId, pollId, engagementType) {
    return await PollEngagementModel.remove(pollId, userId, engagementType);
  }

  /**
   * Verify poll exists
   *
   * @param {string} pollId - Poll UUID
   * @throws {Error} If poll not found
   */
  static async verifyPollExists(pollId) {
    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }
  }
}

module.exports = PollEngagementService;
