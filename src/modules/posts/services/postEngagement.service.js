const PostService = require('./post.service');
const PostEngagementModel = require('../models/postEngagement.model');
const PostCommentModel = require('../models/postComment.model');
const { notifyUser } = require('../utils/postNotifications');

class PostEngagementService {
  static async likePost(postId, userId) {
    const post = await PostService.getVisible(postId, userId, false);
    if (!post || post.status !== 'published') {
      const err = new Error('Post not found');
      err.statusCode = 404;
      throw err;
    }
    const before = await PostEngagementModel.userLikedPost(postId, userId);
    const count = await PostEngagementModel.likePost(postId, userId);
    if (!before && post.user_id && post.user_id !== userId) {
      await notifyUser({
        userId: post.user_id,
        type: 'post.like',
        actorId: userId,
        message: `Someone liked "${post.title}"`,
        metadata: { post_id: postId },
      });
    }
    return { like_count: count, liked: true };
  }

  static async unlikePost(postId, userId) {
    const post = await PostService.getVisible(postId, userId, false);
    if (!post) {
      const err = new Error('Post not found');
      err.statusCode = 404;
      throw err;
    }
    const count = await PostEngagementModel.unlikePost(postId, userId);
    return { like_count: count, liked: false };
  }

  static async postEngagementSummary(postId, viewerUserId) {
    const count = await PostEngagementModel.postLikeCount(postId);
    const liked = viewerUserId ? await PostEngagementModel.userLikedPost(postId, viewerUserId) : false;
    return { like_count: count, liked };
  }

  static async likeComment(postId, commentId, userId) {
    const post = await PostService.getVisible(postId, userId, false);
    if (!post || post.status !== 'published') {
      const err = new Error('Post not found');
      err.statusCode = 404;
      throw err;
    }
    const comment = await PostCommentModel.findById(commentId);
    if (!comment || comment.post_id !== postId || comment.moderation_status !== 'approved') {
      const err = new Error('Comment not found');
      err.statusCode = 404;
      throw err;
    }
    const before = await PostEngagementModel.userLikedComment(commentId, userId);
    const count = await PostEngagementModel.likeComment(commentId, userId);
    if (!before && comment.user_id && comment.user_id !== userId) {
      await notifyUser({
        userId: comment.user_id,
        type: 'post.comment_like',
        actorId: userId,
        message: 'Someone liked your comment',
        metadata: { post_id: postId, comment_id: commentId },
      });
    }
    return { like_count: count, liked: true };
  }

  static async unlikeComment(postId, commentId, userId) {
    const post = await PostService.getVisible(postId, userId, false);
    if (!post) {
      const err = new Error('Post not found');
      err.statusCode = 404;
      throw err;
    }
    const comment = await PostCommentModel.findById(commentId);
    if (!comment || comment.post_id !== postId) {
      const err = new Error('Comment not found');
      err.statusCode = 404;
      throw err;
    }
    const count = await PostEngagementModel.unlikeComment(commentId, userId);
    return { like_count: count, liked: false };
  }
}

module.exports = PostEngagementService;
