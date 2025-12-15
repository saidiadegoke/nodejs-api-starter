/**
 * User Activity Controller
 *
 * HTTP request handler for user activity operations
 */

const UserActivityService = require('../services/user-activity.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class UserActivityController {
  /**
   * Get user's activities
   *
   * @route GET /api/users/me/activities
   * @access Private
   */
  static async getMyActivities(req, res) {
    try {
      const userId = req.user.user_id;
      const { page, limit, activity_type } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        activity_type
      };

      const result = await UserActivityService.getUserActivities(userId, options);

      sendSuccess(res, result, 'Activities retrieved successfully', OK);
    } catch (error) {
      console.error('Get user activities error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get another user's activities (public activities only)
   *
   * @route GET /api/users/:user_id/activities
   * @access Public
   */
  static async getUserActivities(req, res) {
    try {
      const { user_id } = req.params;
      const { page, limit, activity_type } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        activity_type
      };

      const result = await UserActivityService.getUserActivities(user_id, options);

      sendSuccess(res, result, 'Activities retrieved successfully', OK);
    } catch (error) {
      console.error('Get user activities error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete activity
   *
   * @route DELETE /api/users/me/activities/:activity_id
   * @access Private
   */
  static async deleteActivity(req, res) {
    try {
      const { activity_id } = req.params;
      const userId = req.user.user_id;

      await UserActivityService.deleteActivity(activity_id, userId);

      sendSuccess(res, null, 'Activity deleted successfully', OK);
    } catch (error) {
      console.error('Delete activity error:', error);
      if (error.message === 'Activity not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = UserActivityController;