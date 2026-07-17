/**
 * Notification Service
 *
 * Business logic layer for notifications
 */

const NotificationModel = require('../models/notification.model');

const ICON_BY_TYPE = {
  reminder: 'reminder',
  class_reminder: 'reminder',
  alert: 'alert',
  warning: 'alert',
  info: 'info',
};

function mapIconVariant(type, metadata = {}) {
  if (metadata && metadata.icon_variant) return metadata.icon_variant;
  const key = String(type || '').toLowerCase();
  return ICON_BY_TYPE[key] || 'info';
}

function mapMobileItem(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    title: metadata.title || row.type || 'Notification',
    message: row.message,
    timestamp: row.created_at,
    icon_variant: mapIconVariant(row.type, metadata),
    is_read: Boolean(row.read),
    action_url: metadata.action_url || null,
  };
}

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
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(options.limit || options.per_page, 10) || 20));
    const filter = options.filter || (options.unread_only ? 'unread' : 'all');
    const unread_only = filter === 'unread' || options.unread_only === true || options.unread_only === 'true';

    const [notifications, unreadCount, total] = await Promise.all([
      NotificationModel.getByUser(userId, { page, limit, unread_only }),
      NotificationModel.getUnreadCount(userId),
      NotificationModel.countByUser(userId, { unread_only }),
    ]);

    return {
      // Legacy shape (existing clients)
      notifications,
      unread_count: unreadCount,
      pagination: { page, limit, per_page: limit, total },
      // Mobile shape
      items: notifications.map(mapMobileItem),
      filter: unread_only ? 'unread' : 'all',
    };
  }

  static async markAsRead(notificationId, userId, isRead = true) {
    const notification =
      isRead === true
        ? await NotificationModel.markAsRead(notificationId, userId)
        : await NotificationModel.setReadState(notificationId, userId, false);
    if (!notification) {
      throw new Error('Notification not found');
    }
    return {
      id: notification.id,
      is_read: Boolean(notification.read),
      // Keep legacy fields
      ...notification,
    };
  }

  static async markAllAsRead(userId) {
    const count = await NotificationModel.markAllAsRead(userId);
    return {
      count,
      updated_count: count,
      message: `${count} notifications marked as read`,
    };
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
    return { count, message: `${count} notifications deleted`, deleted: true };
  }
}

module.exports = NotificationService;
