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
   * @route GET /api/notifications
   * @access Private
   */
  static async getNotifications(req, res) {
    try {
      const userId = req.user.user_id;
      const { page, limit, unread_only } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        unread_only: unread_only === 'true'
      };

      const result = await NotificationService.getUserNotifications(userId, options);

      sendSuccess(res, result, 'Notifications retrieved successfully', OK);
    } catch (error) {
      console.error('Get notifications error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get unread notification count
   *
   * @route GET /api/notifications/unread-count
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
   * @route PUT /api/notifications/:notification_id/read
   * @access Private
   */
  static async markAsRead(req, res) {
    try {
      const { notification_id } = req.params;
      const userId = req.user.user_id;

      const notification = await NotificationService.markAsRead(notification_id, userId);

      sendSuccess(res, notification, 'Notification marked as read', OK);
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
   * @route PUT /api/notifications/read-all
   * @access Private
   */
  static async markAllAsRead(req, res) {
    try {
      const userId = req.user.user_id;

      const result = await NotificationService.markAllAsRead(userId);

      sendSuccess(res, result, 'All notifications marked as read', OK);
    } catch (error) {
      console.error('Mark all as read error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete notification
   *
   * @route DELETE /api/notifications/:notification_id
   * @access Private
   */
  static async deleteNotification(req, res) {
    try {
      const { notification_id } = req.params;
      const userId = req.user.user_id;

      await NotificationService.deleteNotification(notification_id, userId);

      sendSuccess(res, null, 'Notification deleted successfully', OK);
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
   * @route DELETE /api/notifications
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
