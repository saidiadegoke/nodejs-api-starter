/**
 * Notification Controller
 *
 * HTTP request handler for notification operations
 */

const NotificationService = require('../services/notification.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class NotificationController {
  /**
   * Get user's notifications
   *
   * @route GET /notifications
   * @access Private
   */
  static async getNotifications(req, res) {
    try {
      const userId = req.user.user_id;
      const { page, limit, per_page, unread_only, filter } = req.query;

      const options = {
        page: parseInt(page, 10) || 1,
        limit: parseInt(per_page || limit, 10) || 20,
        per_page: parseInt(per_page || limit, 10) || 20,
        unread_only: unread_only === 'true' || unread_only === true,
        filter: filter || undefined,
      };

      const result = await NotificationService.getUserNotifications(userId, options);

      sendSuccess(
        res,
        {
          unread_count: result.unread_count,
          items: result.items,
          pagination: {
            page: result.pagination.page,
            per_page: result.pagination.per_page,
            total: result.pagination.total,
          },
          // Compatibility for older clients
          notifications: result.notifications,
        },
        'Notifications retrieved successfully',
        OK
      );
    } catch (error) {
      console.error('Get notifications error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get unread notification count
   *
   * @route GET /notifications/unread-count
   * @access Private
   */
  static async getUnreadCount(req, res) {
    try {
      const userId = req.user.user_id;
      const NotificationModel = require('../models/notification.model');

      const count = await NotificationModel.getUnreadCount(userId);

      sendSuccess(res, { count }, 'Unread count retrieved successfully', OK);
    } catch (error) {
      console.error('Get unread count error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Mark notification as read
   *
   * @route PUT|PATCH /notifications/:notification_id/read
   * @access Private
   */
  static async markAsRead(req, res) {
    try {
      const notificationId = req.params.notification_id || req.params.id;
      const userId = req.user.user_id;
      const isRead =
        req.body && typeof req.body.is_read === 'boolean' ? req.body.is_read : true;

      const notification = await NotificationService.markAsRead(notificationId, userId, isRead);

      sendSuccess(
        res,
        { id: notification.id, is_read: notification.is_read },
        'Notification updated',
        OK
      );
    } catch (error) {
      console.error('Mark as read error:', error);
      if (error.message === 'Notification not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Mark all notifications as read
   *
   * @route PUT|PATCH /notifications/read-all
   * @access Private
   */
  static async markAllAsRead(req, res) {
    try {
      const userId = req.user.user_id;

      const result = await NotificationService.markAllAsRead(userId);

      sendSuccess(
        res,
        { updated_count: result.updated_count },
        'All notifications marked as read',
        OK
      );
    } catch (error) {
      console.error('Mark all as read error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete notification
   *
   * @route DELETE /notifications/:notification_id
   * @access Private
   */
  static async deleteNotification(req, res) {
    try {
      const notificationId = req.params.notification_id || req.params.id;
      const userId = req.user.user_id;

      await NotificationService.deleteNotification(notificationId, userId);

      sendSuccess(res, { deleted: true }, 'Notification deleted successfully', OK);
    } catch (error) {
      console.error('Delete notification error:', error);
      if (error.message === 'Notification not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete all notifications
   *
   * @route DELETE /notifications
   * @access Private
   */
  static async deleteAllNotifications(req, res) {
    try {
      const userId = req.user.user_id;

      const result = await NotificationService.deleteAllNotifications(userId);

      sendSuccess(res, result, 'All notifications deleted successfully', OK);
    } catch (error) {
      console.error('Delete all notifications error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = NotificationController;
