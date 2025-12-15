/**
 * User Activity Service
 *
 * Business logic layer for user activities
 */

const UserActivityModel = require('../models/user-activity.model');

class UserActivityService {
  /**
   * Create activity for poll creation
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {string} pollQuestion - Poll question
   * @returns {Promise<Object>} Created activity
   */
  static async createPollActivity(userId, pollId, pollQuestion) {
    return await UserActivityModel.create({
      user_id: userId,
      activity_type: 'poll_created',
      poll_id: pollId,
      title: `Created a poll: "${pollQuestion}"`,
      metadata: { poll_question: pollQuestion }
    });
  }

  /**
   * Create activity for poll vote
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {string} pollQuestion - Poll question
   * @param {string} optionText - Selected option text
   * @returns {Promise<Object>} Created activity
   */
  static async createVoteActivity(userId, pollId, pollQuestion, optionText) {
    // Check if user already has a vote activity for this poll
    const existing = await UserActivityModel.findExisting(userId, 'poll_voted', pollId);
    
    if (existing) {
      // Update timestamp instead of creating new activity
      return await UserActivityModel.updateTimestamp(existing.id);
    }

    return await UserActivityModel.create({
      user_id: userId,
      activity_type: 'poll_voted',
      poll_id: pollId,
      title: `Voted on: "${pollQuestion}"`,
      description: `Selected: ${optionText}`,
      metadata: { poll_question: pollQuestion, selected_option: optionText }
    });
  }

  /**
   * Create activity for poll like
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {string} pollQuestion - Poll question
   * @param {boolean} isLiked - Whether poll was liked or unliked
   * @returns {Promise<Object|null>} Created activity or null
   */
  static async createLikeActivity(userId, pollId, pollQuestion, isLiked) {
    if (!isLiked) {
      // Remove activity when unliked
      const existing = await UserActivityModel.findExisting(userId, 'poll_liked', pollId);
      if (existing) {
        await UserActivityModel.delete(existing.id, userId);
      }
      return null;
    }

    return await UserActivityModel.create({
      user_id: userId,
      activity_type: 'poll_liked',
      poll_id: pollId,
      title: `Liked: "${pollQuestion}"`,
      metadata: { poll_question: pollQuestion }
    });
  }

  /**
   * Create activity for poll comment
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {string} commentId - Comment UUID
   * @param {string} pollQuestion - Poll question
   * @param {string} commentText - Comment text
   * @returns {Promise<Object>} Created activity
   */
  static async createCommentActivity(userId, pollId, commentId, pollQuestion, commentText) {
    const truncatedComment = commentText.length > 100 
      ? commentText.substring(0, 100) + '...' 
      : commentText;

    return await UserActivityModel.create({
      user_id: userId,
      activity_type: 'poll_commented',
      poll_id: pollId,
      comment_id: commentId,
      title: `Commented on: "${pollQuestion}"`,
      description: truncatedComment,
      metadata: { poll_question: pollQuestion, comment_text: commentText }
    });
  }

  /**
   * Create activity for poll bookmark
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {string} pollQuestion - Poll question
   * @param {boolean} isBookmarked - Whether poll was bookmarked or unbookmarked
   * @returns {Promise<Object|null>} Created activity or null
   */
  static async createBookmarkActivity(userId, pollId, pollQuestion, isBookmarked) {
    if (!isBookmarked) {
      // Remove activity when unbookmarked
      const existing = await UserActivityModel.findExisting(userId, 'poll_bookmarked', pollId);
      if (existing) {
        await UserActivityModel.delete(existing.id, userId);
      }
      return null;
    }

    return await UserActivityModel.create({
      user_id: userId,
      activity_type: 'poll_bookmarked',
      poll_id: pollId,
      title: `Bookmarked: "${pollQuestion}"`,
      metadata: { poll_question: pollQuestion }
    });
  }

  /**
   * Create activity for poll share
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {string} pollQuestion - Poll question
   * @param {Object} shareMetadata - Share metadata
   * @returns {Promise<Object>} Created activity
   */
  static async createShareActivity(userId, pollId, pollQuestion, shareMetadata = {}) {
    return await UserActivityModel.create({
      user_id: userId,
      activity_type: 'poll_shared',
      poll_id: pollId,
      title: `Shared: "${pollQuestion}"`,
      metadata: { poll_question: pollQuestion, ...shareMetadata }
    });
  }

  /**
   * Create activity for poll repost
   *
   * @param {string} userId - User UUID
   * @param {string} pollId - Poll UUID
   * @param {string} pollQuestion - Poll question
   * @param {Object} repostMetadata - Repost metadata
   * @returns {Promise<Object>} Created activity
   */
  static async createRepostActivity(userId, pollId, pollQuestion, repostMetadata = {}) {
    return await UserActivityModel.create({
      user_id: userId,
      activity_type: 'poll_reposted',
      poll_id: pollId,
      title: `Reposted: "${pollQuestion}"`,
      metadata: { poll_question: pollQuestion, ...repostMetadata }
    });
  }

  /**
   * Get user's activities
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Activities with pagination
   */
  static async getUserActivities(userId, options = {}) {
    const { page = 1, limit = 20, activity_type = null } = options;

    const activities = await UserActivityModel.getByUser(userId, {
      page,
      limit,
      activity_type
    });

    const total = await UserActivityModel.getCountByUser(userId, activity_type);

    return {
      activities,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Delete activity
   *
   * @param {string} activityId - Activity UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} Success status
   */
  static async deleteActivity(activityId, userId) {
    const deleted = await UserActivityModel.delete(activityId, userId);

    if (!deleted) {
      throw new Error('Activity not found');
    }

    return true;
  }
}

module.exports = UserActivityService;