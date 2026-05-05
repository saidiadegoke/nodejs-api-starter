const PostService = require('./post.service');
const PostCommentModel = require('../models/postComment.model');
const { notifyUser } = require('../utils/postNotifications');

const DEFAULT_MAX_DEPTH = 20;

function maxCommentDepth() {
  const n = parseInt(process.env.POST_COMMENT_MAX_DEPTH || String(DEFAULT_MAX_DEPTH), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_DEPTH;
}

/** Depth from root: root comment = 0, direct reply = 1, … */
async function depthOfComment(commentId) {
  let depth = -1;
  let cur = commentId;
  while (cur) {
    const row = await PostCommentModel.findById(cur);
    if (!row) return -1;
    depth += 1;
    cur = row.parent_id;
  }
  return depth;
}

function nestFlatToTree(rows) {
  const nodes = new Map();
  for (const r of rows) {
    nodes.set(r.id, { ...r, replies: [] });
  }
  const roots = [];
  for (const r of rows) {
    const node = nodes.get(r.id);
    if (r.parent_id && nodes.has(r.parent_id)) {
      nodes.get(r.parent_id).replies.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (arr) => {
    arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    arr.forEach((n) => sortRec(n.replies));
  };
  sortRec(roots);
  return roots;
}

function visibilityOpts(post, viewerUserId, viewerIsAdmin) {
  return {
    viewerUserId: viewerUserId || null,
    viewerIsAdmin: !!viewerIsAdmin,
    postAuthorId: post.user_id,
  };
}

class PostCommentService {
  static async listForPost(postId, viewerUserId, viewerIsAdmin, query = {}) {
    const post = await PostService.getVisible(postId, viewerUserId, viewerIsAdmin);
    if (!post) return null;
    const opts = visibilityOpts(post, viewerUserId, viewerIsAdmin);
    const layout = (query.layout || 'tree').toLowerCase();
    const page = parseInt(query.page, 10) || 1;
    const limit = Math.min(parseInt(query.limit, 10) || 30, 100);

    if (layout === 'flat') {
      const result = await PostCommentModel.listFlatPaginated(postId, opts, { page, limit });
      return { layout: 'flat', ...result };
    }

    const flat = await PostCommentModel.listFlatByPostId(postId, opts);
    return { layout: 'tree', comments: nestFlatToTree(flat) };
  }

  static async create(postId, userId, viewerIsAdmin, { body, parent_id = null, meta = {} }) {
    const post = await PostService.getVisible(postId, userId, viewerIsAdmin);
    if (!post) {
      const err = new Error('Post not found');
      err.statusCode = 404;
      throw err;
    }
    const isAuthor = post.user_id === userId;
    const isPublished = post.status === 'published';
    if (!isPublished && !isAuthor && !viewerIsAdmin) {
      const err = new Error(
        'Comments are only allowed on published posts, unless you are the author or an admin'
      );
      err.statusCode = 403;
      throw err;
    }

    if (parent_id) {
      const parent = await PostCommentModel.findById(parent_id);
      if (!parent || parent.post_id !== postId) {
        const err = new Error('Parent comment not found on this post');
        err.statusCode = 400;
        throw err;
      }
      if (parent.moderation_status !== 'approved') {
        const err = new Error('Cannot reply until the parent comment is approved');
        err.statusCode = 400;
        throw err;
      }
      const parentDepth = await depthOfComment(parent_id);
      if (parentDepth < 0) {
        const err = new Error('Invalid parent comment');
        err.statusCode = 400;
        throw err;
      }
      const newDepth = parentDepth + 1;
      if (newDepth >= maxCommentDepth()) {
        const err = new Error(`Maximum comment nesting depth (${maxCommentDepth()}) reached`);
        err.statusCode = 400;
        throw err;
      }
    }

    let moderation_status = 'approved';
    if (isPublished && post.user_id !== userId && !viewerIsAdmin) {
      moderation_status = 'pending';
    }

    const row = await PostCommentModel.create({
      post_id: postId,
      user_id: userId,
      parent_id: parent_id || null,
      body: String(body).trim(),
      meta: meta && typeof meta === 'object' ? meta : {},
      moderation_status,
    });

    if (post.user_id && post.user_id !== userId) {
      await notifyUser({
        userId: post.user_id,
        type: moderation_status === 'pending' ? 'post.comment_pending' : 'post.comment',
        actorId: userId,
        message:
          moderation_status === 'pending'
            ? `Comment awaiting moderation on "${post.title}"`
            : `New comment on "${post.title}"`,
        metadata: { post_id: postId, comment_id: row.id },
      });
    }

    return row;
  }

  static async moderateComment(postId, commentId, moderatorUserId, status) {
    const allowed = ['approved', 'rejected', 'spam'];
    if (!allowed.includes(status)) {
      const err = new Error('Invalid moderation status');
      err.statusCode = 400;
      throw err;
    }
    const updated = await PostCommentModel.moderate(commentId, postId, status, moderatorUserId);
    if (!updated) {
      const err = new Error('Comment not found');
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }

  static async listPendingAdmin(page, limit) {
    return PostCommentModel.listPendingAdmin({ page, limit });
  }

  static async updateComment(postId, commentId, userId, isAdmin, body) {
    const post = await PostService.getVisible(postId, userId, isAdmin);
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
    if (!isAdmin && comment.user_id !== userId) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }
    const updated = await PostCommentModel.updateBody(commentId, String(body).trim());
    if (!updated) {
      const err = new Error('Comment not found');
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }

  static async deleteComment(postId, commentId, userId, isAdmin) {
    const post = await PostService.getVisible(postId, userId, isAdmin);
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
    if (!isAdmin && comment.user_id !== userId) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }
    const ok = await PostCommentModel.softDelete(commentId);
    if (!ok) {
      const err = new Error('Comment not found');
      err.statusCode = 404;
      throw err;
    }
    return true;
  }
}

module.exports = PostCommentService;
