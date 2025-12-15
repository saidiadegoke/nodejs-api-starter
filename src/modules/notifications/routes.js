const router = require('express').Router();
const NotificationController = require('./controllers/notification.controller');
const { query } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { requireAuth } = require('../../shared/middleware/rbac.middleware');

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications
 * @access  Private
 */
router.get(
  '/',
  requireAuth,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('unread_only').optional().isBoolean(),
    validate
  ],
  NotificationController.getNotifications
);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get(
  '/unread-count',
  requireAuth,
  NotificationController.getUnreadCount
);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put(
  '/read-all',
  requireAuth,
  NotificationController.markAllAsRead
);

/**
 * @route   PUT /api/notifications/:notification_id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put(
  '/:notification_id/read',
  requireAuth,
  NotificationController.markAsRead
);

/**
 * @route   DELETE /api/notifications/:notification_id
 * @desc    Delete notification
 * @access  Private
 */
router.delete(
  '/:notification_id',
  requireAuth,
  NotificationController.deleteNotification
);

/**
 * @route   DELETE /api/notifications
 * @desc    Delete all notifications
 * @access  Private
 */
router.delete(
  '/',
  requireAuth,
  NotificationController.deleteAllNotifications
);

module.exports = router;
