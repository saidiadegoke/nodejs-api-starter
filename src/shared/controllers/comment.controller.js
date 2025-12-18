/**
 * Polymorphic Comment Controller
 *
 * HTTP request handlers for comments on multiple entity types
 * Handles comments for polls, context sources, and other commentable entities
 */

const CommentService = require('../services/comment.service');
const CommentModel = require('../models/comment.model');
const { sendSuccess, sendError } = require('../utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../constants/statusCodes');

class CommentController {
  /**
   * Create a new comment
   *
   * @route POST /api/{entity_type}/{entity_id}/comments
   * @access Private
   */
  static async createComment(req, res) {
    try {
      const userId = req.user.user_id;
      const { commentable_type, commentable_id } = req.params;
      const { comment, parent_comment_id } = req.body;

      const commentData = {
        commentable_type,
        commentable_id,
        comment,
        parent_comment_id
      };

      const result = await CommentService.createComment(userId, commentData);

      sendSuccess(res, result, 'Comment created successfully', CREATED);
    } catch (error) {
      console.error('Create comment error:', error);
      if (error.message.includes('not found') || error.message.includes('Invalid commentable type')) {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('required') || error.message.includes('cannot exceed')) {
        return sendError(res, error.message, 422);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get comments for an entity
   *
   * @route GET /api/{entity_type}/{entity_id}/comments
   * @access Public
   */
  static async getEntityComments(req, res) {
    try {
      const { commentable_type, commentable_id } = req.params;
      const { page, limit, include_replies, parent_comment_id } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        include_replies: include_replies === 'true',
        parent_comment_id
      };

      const result = await CommentService.getEntityComments(commentable_type, commentable_id, options);

      sendSuccess(res, result, 'Comments retrieved successfully', OK);
    } catch (error) {
      console.error('Get entity comments error:', error);
      if (error.message.includes('not found') || error.message.includes('Invalid commentable type')) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get comment by ID
   *
   * @route GET /api/comments/{comment_id}
   * @access Public
   */
  static async getComment(req, res) {
    try {
      const { comment_id } = req.params;

      const comment = await CommentModel.getById(comment_id);
      if (!comment) {
        return sendError(res, 'Comment not found', NOT_FOUND);
      }

      sendSuccess(res, comment, 'Comment retrieved successfully', OK);
    } catch (error) {
      console.error('Get comment error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update a comment
   *
   * @route PUT /api/comments/{comment_id}
   * @access Private
   */
  static async updateComment(req, res) {
    try {
      const { comment_id } = req.params;
      const userId = req.user.user_id;
      const updates = req.body;

      const result = await CommentService.updateComment(comment_id, userId, updates);

      sendSuccess(res, result, 'Comment updated successfully', OK);
    } catch (error) {
      console.error('Update comment error:', error);
      if (error.message === 'Comment not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.message.includes('cannot exceed') || error.message.includes('cannot be empty')) {
        return sendError(res, error.message, 422);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete a comment
   *
   * @route DELETE /api/comments/{comment_id}
   * @access Private
   */
  static async deleteComment(req, res) {
    try {
      const { comment_id } = req.params;
      const userId = req.user.user_id;

      await CommentService.deleteComment(comment_id, userId);

      sendSuccess(res, null, 'Comment deleted successfully', OK);
    } catch (error) {
      console.error('Delete comment error:', error);
      if (error.message.includes('not found') || error.message.includes('not authorized')) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's comments
   *
   * @route GET /api/users/{user_id}/comments
   * @access Private (own comments) or Public (if profile is public)
   */
  static async getUserComments(req, res) {
    try {
      const { user_id } = req.params;
      const { page, limit, commentable_type } = req.query;

      // For now, allow any authenticated user to view comments
      // In the future, you might want to add privacy controls
      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        commentable_type
      };

      const result = await CommentService.getUserComments(user_id, options);

      sendSuccess(res, result, 'User comments retrieved successfully', OK);
    } catch (error) {
      console.error('Get user comments error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Flag a comment
   *
   * @route POST /api/comments/{comment_id}/flag
   * @access Private
   */
  static async flagComment(req, res) {
    try {
      const { comment_id } = req.params;
      const userId = req.user.user_id;
      const { reason } = req.body;

      if (!reason || reason.trim().length === 0) {
        return sendError(res, 'Reason for flagging is required', 422);
      }

      const result = await CommentService.flagComment(comment_id, userId, reason.trim());

      sendSuccess(res, result, 'Comment flagged successfully', OK);
    } catch (error) {
      console.error('Flag comment error:', error);
      if (error.message === 'Comment not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('cannot flag your own')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = CommentController;