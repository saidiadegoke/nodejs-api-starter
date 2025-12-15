/**
 * Poll Comment Controller
 *
 * Handles poll comment operations
 */

const PollCommentModel = require('../models/poll-comment.model');
const PollModel = require('../models/poll.model');
const NotificationService = require('../../notifications/services/notification.service');
const UserActivityService = require('../../users/services/user-activity.service');
const webSocketService = require('../../../shared/services/websocket.service');

class PollCommentController {
  /**
   * Create a new comment
   */
  static async createComment(req, res) {
    try {
      const { poll_id } = req.params;
      const { comment, parent_comment_id } = req.body;
      const userId = req.user.user_id;

      // Verify poll exists
      const poll = await PollModel.getById(poll_id);
      if (!poll) {
        return res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
      }

      // If replying to a comment, verify parent exists
      if (parent_comment_id) {
        const parentComment = await PollCommentModel.getById(parent_comment_id);
        if (!parentComment) {
          return res.status(404).json({
            success: false,
            message: 'Parent comment not found'
          });
        }
      }

      // Create comment
      const newComment = await PollCommentModel.create({
        poll_id,
        user_id: userId,
        comment,
        parent_comment_id
      });

      // Fetch the complete comment with author info
      const commentWithAuthor = await PollCommentModel.getById(newComment.id);

      try {
        // Create notification for poll author (if not self-comment)
        if (poll.user_id !== userId) {
          const notification = await NotificationService.notifyPollComment(
            poll_id,
            poll.user_id,
            userId,
            poll.question || poll.title,
            newComment.id
          );

          // Send real-time notification
          if (notification) {
            webSocketService.sendUserNotification(poll.user_id, notification);
          }
        }

        // Create user activity
        await UserActivityService.createCommentActivity(
          userId,
          poll_id,
          newComment.id,
          poll.question || poll.title,
          comment
        );
      } catch (error) {
        console.error('Error creating comment notification/activity:', error);
        // Don't fail the main operation if notification/activity creation fails
      }

      res.status(201).json({
        success: true,
        data: commentWithAuthor
      });
    } catch (error) {
      console.error('Create comment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create comment',
        error: error.message
      });
    }
  }

  /**
   * Get comments for a poll
   */
  static async getPollComments(req, res) {
    try {
      const { poll_id } = req.params;
      const { page = 1, limit = 20, parent_comment_id } = req.query;

      // Verify poll exists
      const poll = await PollModel.getById(poll_id);
      if (!poll) {
        return res.status(404).json({
          success: false,
          message: 'Poll not found'
        });
      }

      const comments = await PollCommentModel.getByPollId(poll_id, {
        page: parseInt(page),
        limit: parseInt(limit),
        parent_comment_id
      });

      const total = await PollCommentModel.getCountByPollId(poll_id);

      res.json({
        success: true,
        data: comments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Get poll comments error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch comments',
        error: error.message
      });
    }
  }

  /**
   * Get a specific comment
   */
  static async getComment(req, res) {
    try {
      const { comment_id } = req.params;

      const comment = await PollCommentModel.getById(comment_id);

      if (!comment) {
        return res.status(404).json({
          success: false,
          message: 'Comment not found'
        });
      }

      res.json({
        success: true,
        data: comment
      });
    } catch (error) {
      console.error('Get comment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch comment',
        error: error.message
      });
    }
  }

  /**
   * Update a comment
   */
  static async updateComment(req, res) {
    try {
      const { comment_id } = req.params;
      const { comment } = req.body;
      const userId = req.user.user_id;

      // Verify ownership
      const isOwner = await PollCommentModel.isOwner(comment_id, userId);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this comment'
        });
      }

      // Update comment
      const updated = await PollCommentModel.update(comment_id, { comment });

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Comment not found'
        });
      }

      // Fetch updated comment with author info
      const commentWithAuthor = await PollCommentModel.getById(comment_id);

      res.json({
        success: true,
        data: commentWithAuthor
      });
    } catch (error) {
      console.error('Update comment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update comment',
        error: error.message
      });
    }
  }

  /**
   * Delete a comment
   */
  static async deleteComment(req, res) {
    try {
      const { comment_id } = req.params;
      const userId = req.user.user_id;

      // Verify ownership
      const isOwner = await PollCommentModel.isOwner(comment_id, userId);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this comment'
        });
      }

      // Delete comment
      const deleted = await PollCommentModel.delete(comment_id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Comment not found'
        });
      }

      res.json({
        success: true,
        message: 'Comment deleted successfully'
      });
    } catch (error) {
      console.error('Delete comment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete comment',
        error: error.message
      });
    }
  }

  /**
   * Get user's comments
   */
  static async getMyComments(req, res) {
    try {
      const userId = req.user.user_id;
      const { page = 1, limit = 20 } = req.query;

      const comments = await PollCommentModel.getByUserId(userId, {
        page: parseInt(page),
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        data: comments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Get my comments error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch comments',
        error: error.message
      });
    }
  }

  /**
   * Get replies to a comment
   */
  static async getCommentReplies(req, res) {
    try {
      const { comment_id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      // Verify parent comment exists
      const parentComment = await PollCommentModel.getById(comment_id);
      if (!parentComment) {
        return res.status(404).json({
          success: false,
          message: 'Comment not found'
        });
      }

      const replies = await PollCommentModel.getByPollId(parentComment.poll_id, {
        page: parseInt(page),
        limit: parseInt(limit),
        parent_comment_id: comment_id
      });

      res.json({
        success: true,
        data: replies,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Get comment replies error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch replies',
        error: error.message
      });
    }
  }
}

module.exports = PollCommentController;
