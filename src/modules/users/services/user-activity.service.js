/**
 * User Activity Service
 *
 * Business logic layer for user activities. Add domain-specific helpers
 * by composing UserActivityModel.create().
 */

const UserActivityModel = require('../models/user-activity.model');

class UserActivityService {
  static async createActivity(data) {
    return await UserActivityModel.create(data);
  }

  static async getUserActivities(userId, options = {}) {
    const { page = 1, limit = 20, activity_type = null } = options;

    const activities = await UserActivityModel.getByUser(userId, { page, limit, activity_type });
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

  static async deleteActivity(activityId, userId) {
    const deleted = await UserActivityModel.delete(activityId, userId);
    if (!deleted) {
      throw new Error('Activity not found');
    }
    return true;
  }
}

module.exports = UserActivityService;
