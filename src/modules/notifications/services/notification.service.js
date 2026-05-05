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
   * @param {Object} data - { user_id, type, actor_id?, message, metadata? }
   * @returns {Promise<Object>} Created notification
   */
  static async createNotification(data) {
    if (data.actor_id && data.user_id === data.actor_id) {
      return null;
    }
    return await NotificationModel.create(data);
  }

  static async getUserNotifications(userId, options = {}) {
    const { page = 1, limit = 20, unread_only = false } = options;

    const notifications = await NotificationModel.getByUser(userId, { page, limit, unread_only });
    const unreadCount = await NotificationModel.getUnreadCount(userId);

    return {
      notifications,
      unread_count: unreadCount,
      pagination: { page, limit }
    };
  }

  static async markAsRead(notificationId, userId) {
    const notification = await NotificationModel.markAsRead(notificationId, userId);
    if (!notification) {
      throw new Error('Notification not found');
    }
    return notification;
  }

  static async markAllAsRead(userId) {
    const count = await NotificationModel.markAllAsRead(userId);
    return { count, message: `${count} notifications marked as read` };
  }

  static async deleteNotification(notificationId, userId) {
    const deleted = await NotificationModel.delete(notificationId, userId);
    if (!deleted) {
      throw new Error('Notification not found');
    }
    return true;
  }

  static async deleteAllNotifications(userId) {
    const count = await NotificationModel.deleteAll(userId);
    return { count, message: `${count} notifications deleted` };
  }
}

module.exports = NotificationService;
