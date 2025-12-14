/**
 * Poll Rating Controller
 *
 * Handles poll rating operations
 */

const PollRatingModel = require('../models/poll-rating.model');
const PollModel = require('../models/poll.model');

class PollRatingController {
  /**
   * Submit or update a rating
   */
  static async submitRating(req, res) {
    try {
      const { poll_id } = req.params;
      const { rating } = req.body;
      const userId = req.user.user_id;

      // Verify poll exists
      const poll = await PollModel.getById(poll_id);
      if (!poll) {
        return res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
      }

      // Validate rating value
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
      }

      // Create or update rating
      const ratingRecord = await PollRatingModel.upsert({
        poll_id,
        user_id: userId,
        rating: parseInt(rating)
      });

      res.json({
        success: true,
        data: ratingRecord
      });
    } catch (error) {
      console.error('Submit rating error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit rating',
        error: error.message
      });
    }
  }

  /**
   * Get rating statistics for a poll
   */
  static async getRatingStats(req, res) {
    try {
      const { poll_id } = req.params;

      // Verify poll exists
      const poll = await PollModel.getById(poll_id);
      if (!poll) {
        return res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
      }

      const stats = await PollRatingModel.getStats(poll_id);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get rating stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch rating statistics',
        error: error.message
      });
    }
  }

  /**
   * Get user's rating for a poll
   */
  static async getMyRating(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      const rating = await PollRatingModel.getUserRating(poll_id, userId);

      res.json({
        success: true,
        data: rating
      });
    } catch (error) {
      console.error('Get my rating error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch rating',
        error: error.message
      });
    }
  }

  /**
   * Delete user's rating
   */
  static async deleteRating(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      const deleted = await PollRatingModel.delete(poll_id, userId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Rating not found'
        });
      }

      res.json({
        success: true,
        message: 'Rating deleted successfully'
      });
    } catch (error) {
      console.error('Delete rating error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete rating',
        error: error.message
      });
    }
  }

  /**
   * Get user's rating history
   */
  static async getMyRatings(req, res) {
    try {
      const userId = req.user.user_id;
      const { page = 1, limit = 20 } = req.query;

      const ratings = await PollRatingModel.getByUserId(userId, {
        page: parseInt(page),
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        data: ratings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Get my ratings error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch ratings',
        error: error.message
      });
    }
  }
}

module.exports = PollRatingController;
