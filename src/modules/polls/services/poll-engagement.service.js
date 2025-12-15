/**
 * Poll Engagement Service
 *
 * Business logic layer for poll engagements
 * Handles likes, bookmarks, shares, views
 */

const PollModel = require('../models/poll.model');
const PollEngagementModel = require('../models/poll-engagement.model');
const NotificationService = require('../../notifications/services/notification.service');
const UserActivityService = require('../../users/services/user-activity.service');
const webSocketService = require('../../../shared/services/websocket.service');

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
    const poll = await this.verifyPollExists(pollId);
    const result = await PollEngagementModel.toggleEngagement(pollId, userId, 'like');

    try {
      // Create notification for poll author (if not self-like)
      if (result.action === 'added' && poll.user_id !== userId) {
        const notification = await NotificationService.notifyPollLike(
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

      // Create user activity
      await UserActivityService.createLikeActivity(
        userId, 
        pollId, 
        poll.question || poll.title, 
        result.action === 'added'
      );

      // Update user interests based on like
      if (result.action === 'added') {
        const PersonalizedFeedService = require('./personalized-feed.service');
        await PersonalizedFeedService.updateUserInterests(userId, poll, 'like');
      }
    } catch (error) {
      console.error('Error creating like notification/activity:', error);
      // Don't fail the main operation if notification/activity creation fails
    }

    return result;
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
    const poll = await this.verifyPollExists(pollId);
    const result = await PollEngagementModel.toggleEngagement(pollId, userId, 'bookmark');

    try {
      // Create notification for poll author (if not self-bookmark)
      if (result.action === 'added' && poll.user_id !== userId) {
        const notification = await NotificationService.notifyPollBookmark(
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

      // Create user activity
      await UserActivityService.createBookmarkActivity(
        userId, 
        pollId, 
        poll.question || poll.title, 
        result.action === 'added'
      );
    } catch (error) {
      console.error('Error creating bookmark notification/activity:', error);
      // Don't fail the main operation if notification/activity creation fails
    }

    return result;
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
    const poll = await this.verifyPollExists(pollId);
    const engagement = await PollEngagementModel.create(pollId, userId, 'share', metadata);

    try {
      // Create user activity
      await UserActivityService.createShareActivity(
        userId, 
        pollId, 
        poll.question || poll.title, 
        metadata
      );
    } catch (error) {
      console.error('Error creating share activity:', error);
      // Don't fail the main operation if activity creation fails
    }

    return engagement;
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
    const poll = await this.verifyPollExists(pollId);
    const engagement = await PollEngagementModel.create(pollId, userId, 'repost', metadata);

    try {
      // Create notification for poll author (if not self-repost)
      if (poll.user_id !== userId) {
        const notification = await NotificationService.notifyPollRepost(
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

      // Create user activity
      await UserActivityService.createRepostActivity(
        userId, 
        pollId, 
        poll.question || poll.title, 
        metadata
      );
    } catch (error) {
      console.error('Error creating repost notification/activity:', error);
      // Don't fail the main operation if notification/activity creation fails
    }

    return engagement;
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

    // Fetch options with vote counts for each poll
    const PollOptionModel = require('../models/poll-option.model');
    const PollResponseModel = require('../models/poll-response.model');

    for (const poll of polls) {
      const options = await PollOptionModel.getWithVoteCounts(poll.id);
      const totalVotes = poll.responses || 0;

      poll.options = options.map(opt => ({
        ...opt,
        vote_count: parseInt(opt.vote_count) || 0,
        percentage: totalVotes > 0 ? Math.round((parseInt(opt.vote_count) / totalVotes) * 100) : 0
      }));

      // Get user's response
      poll.user_response = await PollResponseModel.getByUserAndPoll(poll.id, userId);
    }

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
   * @returns {Promise<Object>} Poll object
   * @throws {Error} If poll not found
   */
  static async verifyPollExists(pollId) {
    const poll = await PollModel.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }
    return poll;
  }
}

module.exports = PollEngagementService;
