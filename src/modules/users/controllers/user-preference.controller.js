/**
 * User Preference Controller
 *
 * HTTP request handler for user preference operations
 */

const UserPreferenceModel = require('../models/user-preference.model');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class UserPreferenceController {
  /**
   * Get user's preferences
   *
   * @route GET /api/users/me/preferences
   * @access Private
   */
  static async getMyPreferences(req, res) {
    try {
      const userId = req.user.user_id;

      const preferences = await UserPreferenceModel.getOrCreate(userId);

      sendSuccess(res, preferences, 'Preferences retrieved successfully', OK);
    } catch (error) {
      console.error('Get preferences error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update user's preferences
   *
   * @route PUT /api/users/me/preferences
   * @access Private
   */
  static async updateMyPreferences(req, res) {
    try {
      const userId = req.user.user_id;
      const updates = req.body;

      const preferences = await UserPreferenceModel.update(userId, updates);

      sendSuccess(res, preferences, 'Preferences updated successfully', OK);
    } catch (error) {
      console.error('Update preferences error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's feed preferences (with interests)
   *
   * @route GET /api/users/me/feed-preferences
   * @access Private
   */
  static async getMyFeedPreferences(req, res) {
    try {
      const userId = req.user.user_id;

      const feedPreferences = await UserPreferenceModel.getFeedPreferences(userId);

      if (!feedPreferences) {
        return sendError(res, 'Feed preferences not found', NOT_FOUND);
      }

      sendSuccess(res, feedPreferences, 'Feed preferences retrieved successfully', OK);
    } catch (error) {
      console.error('Get feed preferences error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's interests by type
   *
   * @route GET /api/users/me/interests/:type
   * @access Private
   */
  static async getMyInterests(req, res) {
    try {
      const userId = req.user.user_id;
      const { type } = req.params;
      const { limit } = req.query;

      const interests = await UserPreferenceModel.getTopInterests(
        userId, 
        type, 
        parseInt(limit) || 10
      );

      sendSuccess(res, { interests, type }, 'Interests retrieved successfully', OK);
    } catch (error) {
      console.error('Get interests error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's category distribution from activity
   *
   * @route GET /api/users/me/category-distribution
   * @access Private
   */
  static async getMyCategoryDistribution(req, res) {
    try {
      const userId = req.user.user_id;

      const distribution = await UserPreferenceModel.getCategoryDistribution(userId);

      sendSuccess(res, { distribution }, 'Category distribution retrieved successfully', OK);
    } catch (error) {
      console.error('Get category distribution error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Record poll click (for interest tracking)
   *
   * @route POST /api/users/me/poll-interaction
   * @access Private
   */
  static async recordPollInteraction(req, res) {
    try {
      const userId = req.user.user_id;
      const { poll_id, interaction_type, poll_data } = req.body;

      // Record feed click if it was from feed
      if (interaction_type === 'click') {
        await UserPreferenceModel.recordFeedClick(userId, poll_id);
      }

      // Update interests if poll data is provided
      if (poll_data) {
        const PersonalizedFeedService = require('../../polls/services/personalized-feed.service');
        await PersonalizedFeedService.updateUserInterests(
          userId, 
          poll_data, 
          interaction_type
        );
      }

      sendSuccess(res, { recorded: true }, 'Interaction recorded successfully', OK);
    } catch (error) {
      console.error('Record interaction error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Reset user preferences to defaults
   *
   * @route POST /api/users/me/preferences/reset
   * @access Private
   */
  static async resetMyPreferences(req, res) {
    try {
      const userId = req.user.user_id;

      // Delete existing preferences (will create defaults on next access)
      await pool.query('DELETE FROM user_preferences WHERE user_id = $1', [userId]);
      
      // Get fresh defaults
      const preferences = await UserPreferenceModel.getOrCreate(userId);

      sendSuccess(res, preferences, 'Preferences reset successfully', OK);
    } catch (error) {
      console.error('Reset preferences error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get available categories for preferences
   *
   * @route GET /api/users/preferences/categories
   * @access Public
   */
  static async getAvailableCategories(req, res) {
    try {
      const result = await pool.query(
        `SELECT category, COUNT(*) as poll_count
         FROM polls 
         WHERE deleted_at IS NULL 
           AND visibility = 'public' 
           AND category IS NOT NULL
         GROUP BY category
         ORDER BY poll_count DESC, category ASC`
      );

      const categories = result.rows.map(row => ({
        name: row.category,
        poll_count: parseInt(row.poll_count)
      }));

      sendSuccess(res, { categories }, 'Categories retrieved successfully', OK);
    } catch (error) {
      console.error('Get categories error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get available poll types for preferences
   *
   * @route GET /api/users/preferences/poll-types
   * @access Public
   */
  static async getAvailablePollTypes(req, res) {
    try {
      const result = await pool.query(
        `SELECT poll_type, COUNT(*) as poll_count
         FROM polls 
         WHERE deleted_at IS NULL 
           AND visibility = 'public' 
           AND poll_type IS NOT NULL
         GROUP BY poll_type
         ORDER BY poll_count DESC, poll_type ASC`
      );

      const pollTypes = result.rows.map(row => ({
        name: row.poll_type,
        poll_count: parseInt(row.poll_count)
      }));

      sendSuccess(res, { poll_types: pollTypes }, 'Poll types retrieved successfully', OK);
    } catch (error) {
      console.error('Get poll types error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = UserPreferenceController;