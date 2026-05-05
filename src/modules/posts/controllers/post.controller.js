const PostService = require('../services/post.service');
const PostModel = require('../models/post.model');
const PostCommentService = require('../services/postComment.service');
const PostEngagementService = require('../services/postEngagement.service');
const PostMediaService = require('../services/postMedia.service');
const PostMediaModel = require('../models/postMedia.model');
const PostSeoFeedService = require('../services/postSeoFeed.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const {
  OK,
  CREATED,
  BAD_REQUEST,
  NOT_FOUND,
  FORBIDDEN,
  CONFLICT,
} = require('../../../shared/constants/statusCodes');

class PostController {
  static isAdmin(roles) {
    return (
      Array.isArray(roles) && (roles.includes('admin') || roles.includes('super_admin'))
    );
  }

  static async listPublished(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const q = req.query.q || null;
      const result = await PostModel.listPublished({ page, limit, q });
      sendSuccess(
        res,
        {
          posts: result.posts,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: Math.ceil(result.total / result.limit) || 1,
          },
        },
        'Posts retrieved',
        OK
      );
    } catch (error) {
      console.error('[posts] listPublished', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async listMine(req, res) {
    try {
      const userId = req.user.user_id;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const status = req.query.status || null;
      const result = await PostModel.listByUser(userId, { page, limit, status });
      sendSuccess(
        res,
        {
          posts: result.posts,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: Math.ceil(result.total / result.limit) || 1,
          },
        },
        'Your posts',
        OK
      );
    } catch (error) {
      console.error('[posts] listMine', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async listAdmin(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const status = req.query.status || null;
      const q = req.query.q || null;
      const result = await PostModel.listAllAdmin({ page, limit, status, q });
      sendSuccess(
        res,
        {
          posts: result.posts,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: Math.ceil(result.total / result.limit) || 1,
          },
        },
        'All posts',
        OK
      );
    } catch (error) {
      console.error('[posts] listAdmin', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async getPost(req, res) {
    try {
      const { postId } = req.params;
      const userId = req.user?.user_id || null;
      const isAdmin = PostController.isAdmin(req.user?.roles);
      const post = await PostService.getVisible(postId, userId, isAdmin);
      if (!post) {
        return sendError(res, 'Post not found', NOT_FOUND);
      }
      let data = { ...post };
      const inc = String(req.query.include || '');
      if (inc.includes('likes')) {
        const engagement = await PostEngagementService.postEngagementSummary(postId, userId);
        data = { ...data, engagement };
      }
      if (inc.includes('media')) {
        const media = await PostMediaModel.listByPostId(postId);
        data = { ...data, media };
      }
      sendSuccess(res, data, 'Post retrieved', OK);
    } catch (error) {
      console.error('[posts] getPost', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async searchPublished(req, res) {
    try {
      const q = req.query.q;
      if (!q || !String(q).trim()) {
        return sendError(res, 'Query parameter q is required', BAD_REQUEST);
      }
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const result = await PostModel.searchPublished({ q, page, limit });
      sendSuccess(
        res,
        {
          posts: result.posts,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: Math.ceil(result.total / result.limit) || 1,
          },
        },
        'Search results',
        OK
      );
    } catch (error) {
      console.error('[posts] search', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async rssFeed(req, res) {
    try {
      const xml = await PostSeoFeedService.rssXml(60);
      res.type('application/rss+xml; charset=utf-8').send(xml);
    } catch (error) {
      console.error('[posts] rss', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async sitemapXml(req, res) {
    try {
      const xml = await PostSeoFeedService.sitemapXml(500);
      res.type('application/xml; charset=utf-8').send(xml);
    } catch (error) {
      console.error('[posts] sitemap', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async getSeo(req, res) {
    try {
      const { postId } = req.params;
      const userId = req.user?.user_id || null;
      const isAdmin = PostController.isAdmin(req.user?.roles);
      const payload = await PostSeoFeedService.buildSeoPayload(postId, userId, isAdmin);
      if (!payload) {
        return sendError(res, 'Post not found', NOT_FOUND);
      }
      sendSuccess(res, payload, 'SEO payload', OK);
    } catch (error) {
      console.error('[posts] seo', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async listPostMedia(req, res) {
    try {
      const userId = req.user?.user_id || null;
      const isAdmin = PostController.isAdmin(req.user?.roles);
      const rows = await PostMediaService.listForPost(req.params.postId, userId, isAdmin);
      if (rows === null) {
        return sendError(res, 'Post not found', NOT_FOUND);
      }
      sendSuccess(res, { media: rows }, 'Media', OK);
    } catch (error) {
      console.error('[posts] listMedia', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async replacePostMedia(req, res) {
    try {
      const userId = req.user.user_id;
      const isAdmin = PostController.isAdmin(req.user.roles);
      const rows = await PostMediaService.replaceMedia(
        req.params.postId,
        userId,
        isAdmin,
        req.body.items || []
      );
      sendSuccess(res, { media: rows }, 'Media updated', OK);
    } catch (error) {
      console.error('[posts] replaceMedia', error);
      if (error.statusCode === 403) {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async likePost(req, res) {
    try {
      const userId = req.user.user_id;
      const data = await PostEngagementService.likePost(req.params.postId, userId);
      sendSuccess(res, data, 'Liked', OK);
    } catch (error) {
      console.error('[posts] like', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async unlikePost(req, res) {
    try {
      const userId = req.user.user_id;
      const data = await PostEngagementService.unlikePost(req.params.postId, userId);
      sendSuccess(res, data, 'Unliked', OK);
    } catch (error) {
      console.error('[posts] unlike', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async listPendingComments(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const result = await PostCommentService.listPendingAdmin(page, limit);
      sendSuccess(
        res,
        {
          comments: result.comments,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: Math.ceil(result.total / result.limit) || 1,
          },
        },
        'Pending comments',
        OK
      );
    } catch (error) {
      console.error('[posts] pending comments', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async createPost(req, res) {
    try {
      const userId = req.user.user_id;
      const post = await PostService.create(userId, req.body);
      sendSuccess(res, post, 'Post created', CREATED);
    } catch (error) {
      console.error('[posts] createPost', error);
      if (error.statusCode === 409) {
        return sendError(res, error.message, CONFLICT);
      }
      if (error.statusCode === 403) {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async updatePost(req, res) {
    try {
      const userId = req.user.user_id;
      const isAdmin = PostController.isAdmin(req.user.roles);
      const post = await PostService.update(req.params.postId, userId, isAdmin, req.body);
      sendSuccess(res, post, 'Post updated', OK);
    } catch (error) {
      console.error('[posts] updatePost', error);
      if (error.message === 'Post not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message === 'Forbidden') {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.statusCode === 409) {
        return sendError(res, error.message, CONFLICT);
      }
      if (error.statusCode === 403) {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async deletePost(req, res) {
    try {
      const userId = req.user.user_id;
      const isAdmin = PostController.isAdmin(req.user.roles);
      await PostService.remove(req.params.postId, userId, isAdmin);
      sendSuccess(res, null, 'Post deleted', OK);
    } catch (error) {
      console.error('[posts] deletePost', error);
      if (error.message === 'Post not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message === 'Forbidden') {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = PostController;
