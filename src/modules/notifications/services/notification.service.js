/**
 * Notification Service
 *
 * Business logic layer for notifications
 */

const NotificationModel = require('../models/notification.model');

class NotificationService {
  /**
   * Create a notification
   *
   * @param {Object} data - Notification data
   * @returns {Promise<Object>} Created notification
   */
  static async createNotification(data) {
    // Don't create notification if user is notifying themselves
    if (data.user_id === data.actor_id) {
      return null;
    }

    return await NotificationModel.create(data);
  }

  /**
   * Create notification for poll like
   *
   * @param {string} pollId - Poll UUID
   * @param {string} pollAuthorId - Poll author UUID
   * @param {string} actorId - User who liked
   * @param {string} pollQuestion - Poll question
   * @returns {Promise<Object>} Created notification
   */
  static async notifyPollLike(pollId, pollAuthorId, actorId, pollQuestion) {
    return await this.createNotification({
      user_id: pollAuthorId,
      type: 'like',
      actor_id: actorId,
      poll_id: pollId,
      message: `liked your poll "${pollQuestion}"`,
      metadata: { poll_question: pollQuestion }
    });
  }

  /**
   * Create notification for poll comment
   *
   * @param {string} pollId - Poll UUID
   * @param {string} pollAuthorId - Poll author UUID
   * @param {string} actorId - User who commented
   * @param {string} pollQuestion - Poll question
   * @param {string} commentId - Comment UUID
   * @returns {Promise<Object>} Created notification
   */
  static async notifyPollComment(pollId, pollAuthorId, actorId, pollQuestion, commentId) {
    return await this.createNotification({
      user_id: pollAuthorId,
      type: 'comment',
      actor_id: actorId,
      poll_id: pollId,
      comment_id: commentId,
      message: `commented on your poll "${pollQuestion}"`,
      metadata: { poll_question: pollQuestion }
    });
  }

  /**
   * Create notification for poll response/vote
   *
   * @param {string} pollId - Poll UUID
   * @param {string} pollAuthorId - Poll author UUID
   * @param {string} actorId - User who voted
   * @param {string} pollQuestion - Poll question
   * @returns {Promise<Object>} Created notification
   */
  static async notifyPollResponse(pollId, pollAuthorId, actorId, pollQuestion) {
    return await this.createNotification({
      user_id: pollAuthorId,
      type: 'response',
      actor_id: actorId,
      poll_id: pollId,
      message: `voted on your poll "${pollQuestion}"`,
      metadata: { poll_question: pollQuestion }
    });
  }

  /**
   * Create notification for poll bookmark
   *
   * @param {string} pollId - Poll UUID
   * @param {string} pollAuthorId - Poll author UUID
   * @param {string} actorId - User who bookmarked
   * @param {string} pollQuestion - Poll question
   * @returns {Promise<Object>} Created notification
   */
  static async notifyPollBookmark(pollId, pollAuthorId, actorId, pollQuestion) {
    return await this.createNotification({
      user_id: pollAuthorId,
      type: 'bookmark',
      actor_id: actorId,
      poll_id: pollId,
      message: `bookmarked your poll "${pollQuestion}"`,
      metadata: { poll_question: pollQuestion }
    });
  }

  /**
   * Create notification for poll repost
   *
   * @param {string} pollId - Poll UUID
   * @param {string} pollAuthorId - Poll author UUID
   * @param {string} actorId - User who reposted
   * @param {string} pollQuestion - Poll question
   * @returns {Promise<Object>} Created notification
   */
  static async notifyPollRepost(pollId, pollAuthorId, actorId, pollQuestion) {
    return await this.createNotification({
      user_id: pollAuthorId,
      type: 'repost',
      actor_id: actorId,
      poll_id: pollId,
      message: `reposted your poll "${pollQuestion}"`,
      metadata: { poll_question: pollQuestion }
    });
  }

  /**
   * Get user's notifications
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Notifications with pagination
   */
  static async getUserNotifications(userId, options = {}) {
    const { page = 1, limit = 20, unread_only = false } = options;

    const notifications = await NotificationModel.getByUser(userId, {
      page,
      limit,
      unread_only
    });

    const unreadCount = await NotificationModel.getUnreadCount(userId);

    return {
      notifications,
      unread_count: unreadCount,
      pagination: {
        page,
        limit
      }
    };
  }

  /**
   * Mark notification as read
   *
   * @param {string} notificationId - Notification UUID
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} Updated notification
   */
  static async markAsRead(notificationId, userId) {
    const notification = await NotificationModel.markAsRead(notificationId, userId);

    if (!notification) {
      throw new Error('Notification not found');
    }

    return notification;
  }

  /**
   * Mark all notifications as read
   *
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} Result with count
   */
  static async markAllAsRead(userId) {
    const count = await NotificationModel.markAllAsRead(userId);

    return { count, message: `${count} notifications marked as read` };
  }

  /**
   * Delete notification
   *
   * @param {string} notificationId - Notification UUID
   * @param {string} userId - User UUID
   * @returns {Promise<boolean>} Success status
   */
  static async deleteNotification(notificationId, userId) {
    const deleted = await NotificationModel.delete(notificationId, userId);

    if (!deleted) {
      throw new Error('Notification not found');
    }

    return true;
  }

  /**
   * Delete all notifications
   *
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} Result with count
   */
  static async deleteAllNotifications(userId) {
    const count = await NotificationModel.deleteAll(userId);

    return { count, message: `${count} notifications deleted` };
  }
}

module.exports = NotificationService;
