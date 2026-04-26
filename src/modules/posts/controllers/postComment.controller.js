const PostCommentService = require('../services/postComment.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const {
  OK,
  CREATED,
  BAD_REQUEST,
  NOT_FOUND,
  FORBIDDEN,
} = require('../../../shared/constants/statusCodes');

class PostCommentController {
  static isAdmin(roles) {
    return (
      Array.isArray(roles) && (roles.includes('admin') || roles.includes('super_admin'))
    );
  }

  static async listByPost(req, res) {
    try {
      const { postId } = req.params;
      const userId = req.user?.user_id || null;
      const isAdmin = PostCommentController.isAdmin(req.user?.roles);
      const data = await PostCommentService.listForPost(postId, userId, isAdmin, req.query);
      if (data === null) {
        return sendError(res, 'Post not found', NOT_FOUND);
      }
      sendSuccess(res, data, 'Comments retrieved', OK);
    } catch (error) {
      console.error('[posts] listComments', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async create(req, res) {
    try {
      const hpField = process.env.POST_COMMENT_HONEYPOT_FIELD;
      if (hpField && req.body[hpField]) {
        return sendError(res, 'Invalid request', BAD_REQUEST);
      }
      const userId = req.user.user_id;
      const isAdmin = PostCommentController.isAdmin(req.user.roles);
      const { postId } = req.params;
      const comment = await PostCommentService.create(postId, userId, isAdmin, {
        body: req.body.body,
        parent_id: req.body.parent_id || null,
        meta: req.body.meta,
      });
      sendSuccess(res, comment, 'Comment created', CREATED);
    } catch (error) {
      console.error('[posts] createComment', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.statusCode === 403) {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.statusCode === 400) {
        return sendError(res, error.message, BAD_REQUEST);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async update(req, res) {
    try {
      const userId = req.user.user_id;
      const isAdmin = PostCommentController.isAdmin(req.user.roles);
      const updated = await PostCommentService.updateComment(
        req.params.postId,
        req.params.commentId,
        userId,
        isAdmin,
        req.body.body
      );
      sendSuccess(res, updated, 'Comment updated', OK);
    } catch (error) {
      console.error('[posts] updateComment', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.statusCode === 403) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async remove(req, res) {
    try {
      const userId = req.user.user_id;
      const isAdmin = PostCommentController.isAdmin(req.user.roles);
      await PostCommentService.deleteComment(
        req.params.postId,
        req.params.commentId,
        userId,
        isAdmin
      );
      sendSuccess(res, null, 'Comment deleted', OK);
    } catch (error) {
      console.error('[posts] deleteComment', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.statusCode === 403) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async moderate(req, res) {
    try {
      const updated = await PostCommentService.moderateComment(
        req.params.postId,
        req.params.commentId,
        req.user.user_id,
        req.body.status
      );
      sendSuccess(res, updated, 'Moderation updated', OK);
    } catch (error) {
      console.error('[posts] moderate', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.statusCode === 400) {
        return sendError(res, error.message, BAD_REQUEST);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async likeComment(req, res) {
    try {
      const PostEngagementService = require('../services/postEngagement.service');
      const data = await PostEngagementService.likeComment(
        req.params.postId,
        req.params.commentId,
        req.user.user_id
      );
      sendSuccess(res, data, 'Liked', OK);
    } catch (error) {
      console.error('[posts] likeComment', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async unlikeComment(req, res) {
    try {
      const PostEngagementService = require('../services/postEngagement.service');
      const data = await PostEngagementService.unlikeComment(
        req.params.postId,
        req.params.commentId,
        req.user.user_id
      );
      sendSuccess(res, data, 'Unliked', OK);
    } catch (error) {
      console.error('[posts] unlikeComment', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = PostCommentController;
