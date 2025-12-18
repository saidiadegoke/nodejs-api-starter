/**
 * Polymorphic Comment Service
 *
 * Business logic for comments on multiple entity types
 * Handles validation, permissions, and entity-specific logic
 */

const CommentModel = require('../models/comment.model');
const PollModel = require('../../modules/polls/models/poll.model');
const ContextSourceModel = require('../../modules/polls/models/context-source.model');

class CommentService {
  /**
   * Supported commentable entity types
   */
  static COMMENTABLE_TYPES = {
    POLL: 'poll',
    CONTEXT_SOURCE: 'context_source'
  };

  /**
   * Create a new comment
   *
   * @param {string} userId - User UUID
   * @param {Object} commentData - Comment data
   * @returns {Promise<Object>} Created comment with author info
   * @throws {Error} If validation fails or entity not found
   */
  static async createComment(userId, commentData) {
    const { commentable_type, commentable_id, comment, parent_comment_id } = commentData;

    // Validate commentable type
    if (!Object.values(this.COMMENTABLE_TYPES).includes(commentable_type)) {
      throw new Error(`Invalid commentable type: ${commentable_type}`);
    }

    // Validate comment content
    if (!comment || comment.trim().length === 0) {
      throw new Error('Comment content is required');
    }

    // For HTML content, check the text length after stripping HTML
    const textContent = comment.replace(/<[^>]*>/g, '').trim();
    if (textContent.length === 0) {
      throw new Error('Comment must contain some text content');
    }

    if (textContent.length > 2000) {
      throw new Error('Comment cannot exceed 2000 characters');
    }

    // Verify the entity exists
    await this._verifyEntityExists(commentable_type, commentable_id);

    // If replying to a comment, verify parent exists and belongs to same entity
    if (parent_comment_id) {
      await this._verifyParentComment(parent_comment_id, commentable_type, commentable_id);
    }

    // Create the comment
    const createdComment = await CommentModel.create({
      commentable_type,
      commentable_id,
      user_id: userId,
      comment: comment.trim(),
      parent_comment_id
    });

    // Return comment with author information
    return await CommentModel.getById(createdComment.id);
  }

  /**
   * Get comments for an entity
   *
   * @param {string} commentableType - Type of entity
   * @param {string} commentableId - Entity UUID
   * @param {Object} options - Pagination and filtering options
   * @returns {Promise<Object>} Comments with pagination info
   */
  static async getEntityComments(commentableType, commentableId, options = {}) {
    const { page = 1, limit = 20, include_replies = false, parent_comment_id = null } = options;

    // Validate commentable type
    if (!Object.values(this.COMMENTABLE_TYPES).includes(commentableType)) {
      throw new Error(`Invalid commentable type: ${commentableType}`);
    }

    // Verify the entity exists
    await this._verifyEntityExists(commentableType, commentableId);

    let comments;
    if (include_replies && !parent_comment_id) {
      // Get comments with nested replies
      comments = await CommentModel.getWithReplies(commentableType, commentableId, { page, limit });
    } else {
      // Get flat list of comments
      comments = await CommentModel.getByEntity(commentableType, commentableId, { page, limit, parent_comment_id });
    }

    const totalCount = await CommentModel.getCountByEntity(commentableType, commentableId);

    return {
      comments,
      pagination: {
        page,
        limit,
        total: totalCount,
        total_pages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Update a comment
   *
   * @param {string} commentId - Comment UUID
   * @param {string} userId - User UUID (for permission check)
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated comment
   * @throws {Error} If comment not found or user not authorized
   */
  static async updateComment(commentId, userId, updates) {
    // Check if comment exists and user owns it
    const comment = await CommentModel.getById(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.user_id !== userId) {
      throw new Error('You are not authorized to update this comment');
    }

    // Validate updates
    if (updates.comment) {
      const textContent = updates.comment.replace(/<[^>]*>/g, '').trim();
      if (textContent.length === 0) {
        throw new Error('Comment must contain some text content');
      }
      if (textContent.length > 2000) {
        throw new Error('Comment cannot exceed 2000 characters');
      }
      updates.comment = updates.comment.trim();
    }

    const updatedComment = await CommentModel.update(commentId, updates);
    return await CommentModel.getById(updatedComment.id);
  }

  /**
   * Delete a comment
   *
   * @param {string} commentId - Comment UUID
   * @param {string} userId - User UUID (for permission check)
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If comment not found or user not authorized
   */
  static async deleteComment(commentId, userId) {
    // Check if comment exists and user owns it
    const isOwner = await CommentModel.isOwner(commentId, userId);
    if (!isOwner) {
      throw new Error('Comment not found or you are not authorized to delete it');
    }

    return await CommentModel.delete(commentId);
  }

  /**
   * Get user's comments across all entities
   *
   * @param {string} userId - User UUID
   * @param {Object} options - Filtering and pagination options
   * @returns {Promise<Object>} User's comments with pagination
   */
  static async getUserComments(userId, options = {}) {
    const { page = 1, limit = 20, commentable_type = null } = options;

    const comments = await CommentModel.getByUserId(userId, { page, limit, commentable_type });

    // Get total count (simplified - could be optimized)
    const allComments = await CommentModel.getByUserId(userId, { page: 1, limit: 1000, commentable_type });
    const totalCount = allComments.length;

    return {
      comments,
      pagination: {
        page,
        limit,
        total: totalCount,
        total_pages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Flag a comment for moderation
   *
   * @param {string} commentId - Comment UUID
   * @param {string} userId - User UUID (reporter)
   * @param {string} reason - Reason for flagging
   * @returns {Promise<Object>} Updated comment
   */
  static async flagComment(commentId, userId, reason) {
    const comment = await CommentModel.getById(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    // Don't allow users to flag their own comments
    if (comment.user_id === userId) {
      throw new Error('You cannot flag your own comment');
    }

    const updates = {
      is_flagged: true,
      flagged_reason: reason
    };

    return await CommentModel.update(commentId, updates);
  }

  /**
   * Verify that the commentable entity exists
   *
   * @private
   * @param {string} commentableType - Type of entity
   * @param {string} commentableId - Entity UUID
   * @throws {Error} If entity not found
   */
  static async _verifyEntityExists(commentableType, commentableId) {
    let exists = false;

    switch (commentableType) {
      case this.COMMENTABLE_TYPES.POLL:
        const poll = await PollModel.getById(commentableId);
        exists = !!poll;
        break;
      case this.COMMENTABLE_TYPES.CONTEXT_SOURCE:
        const contextSource = await ContextSourceModel.getById(commentableId);
        exists = !!contextSource;
        break;
      default:
        throw new Error(`Unsupported commentable type: ${commentableType}`);
    }

    if (!exists) {
      throw new Error(`${commentableType} not found`);
    }
  }

  /**
   * Verify parent comment exists and belongs to the same entity
   *
   * @private
   * @param {string} parentCommentId - Parent comment UUID
   * @param {string} commentableType - Type of entity
   * @param {string} commentableId - Entity UUID
   * @throws {Error} If parent comment invalid
   */
  static async _verifyParentComment(parentCommentId, commentableType, commentableId) {
    const parentComment = await CommentModel.getById(parentCommentId);
    
    if (!parentComment) {
      throw new Error('Parent comment not found');
    }

    if (parentComment.commentable_type !== commentableType || 
        parentComment.commentable_id !== commentableId) {
      throw new Error('Parent comment does not belong to the same entity');
    }
  }
}

module.exports = CommentService;