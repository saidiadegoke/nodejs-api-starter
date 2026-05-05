const PostModel = require('../models/post.model');
const FileModel = require('../../files/models/file.model');

function normalizeSlug(input, title) {
  const raw = (input && String(input).trim()) || String(title || '').trim();
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 240);
  return s || `post-${Date.now().toString(36)}`;
}

class PostService {
  /**
   * Ensures a file row exists, is not soft-deleted, and is owned by the user (unless admin).
   * Used for og_image_file_id and keeps rules aligned with post media attachments.
   */
  static async assertFileAttachableByUser(userId, fileId, isAdmin) {
    if (fileId == null || fileId === '') return;
    const f = await FileModel.findById(fileId);
    if (!f) {
      const err = new Error('File not found for og_image_file_id');
      err.statusCode = 404;
      throw err;
    }
    if (!isAdmin && String(f.uploaded_by) !== String(userId)) {
      const err = new Error('You can only use files you uploaded as og:image');
      err.statusCode = 403;
      throw err;
    }
  }

  static async create(userId, payload) {
    const slug = normalizeSlug(payload.slug, payload.title);
    try {
      await PostService.assertFileAttachableByUser(userId, payload.og_image_file_id, false);
      return await PostModel.create({
        user_id: userId,
        title: String(payload.title).trim(),
        slug,
        body: payload.body != null ? String(payload.body) : null,
        excerpt: payload.excerpt != null ? String(payload.excerpt).slice(0, 1000) : null,
        status: payload.status || 'draft',
        meta: payload.meta && typeof payload.meta === 'object' ? payload.meta : {},
        scheduled_publish_at: payload.scheduled_publish_at || null,
        seo_title: payload.seo_title != null ? String(payload.seo_title).slice(0, 200) : null,
        seo_description:
          payload.seo_description != null ? String(payload.seo_description).slice(0, 500) : null,
        og_image_file_id: payload.og_image_file_id || null,
        twitter_card: payload.twitter_card || 'summary',
        canonical_url: payload.canonical_url || null,
        robots_directive: payload.robots_directive || null,
      });
    } catch (e) {
      if (e.code === '23505') {
        const err = new Error('Slug already in use for this account');
        err.statusCode = 409;
        throw err;
      }
      throw e;
    }
  }

  static async getVisible(postId, viewerUserId, viewerIsAdmin) {
    await PostModel.applyScheduledPublishing();
    const post = await PostModel.findById(postId);
    if (!post) return null;
    if (post.status === 'published') return post;
    if (viewerIsAdmin) return post;
    if (viewerUserId && post.user_id === viewerUserId) return post;
    return null;
  }

  static async assertAuthorOrAdmin(postId, userId, isAdmin) {
    const post = await PostModel.findById(postId);
    if (!post) throw new Error('Post not found');
    if (isAdmin) return post;
    if (post.user_id !== userId) throw new Error('Forbidden');
    return post;
  }

  static async update(postId, userId, isAdmin, payload) {
    const existing = await this.assertAuthorOrAdmin(postId, userId, isAdmin);
    if (payload.og_image_file_id !== undefined && payload.og_image_file_id != null) {
      await PostService.assertFileAttachableByUser(userId, payload.og_image_file_id, isAdmin);
    }
    const patch = {};
    if (payload.title != null) patch.title = String(payload.title).trim();
    if (payload.slug != null) {
      patch.slug = normalizeSlug(payload.slug, patch.title || existing.title);
    }
    if (payload.body !== undefined) patch.body = payload.body;
    if (payload.excerpt !== undefined) patch.excerpt = payload.excerpt != null ? String(payload.excerpt).slice(0, 1000) : null;
    if (payload.status != null) {
      patch.status = payload.status;
      if (payload.status === 'published' && !existing.published_at) {
        patch.published_at = new Date();
      }
    }
    if (payload.meta !== undefined) {
      patch.meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
    }
    if (payload.scheduled_publish_at !== undefined) {
      patch.scheduled_publish_at = payload.scheduled_publish_at || null;
    }
    if (payload.seo_title !== undefined) patch.seo_title = payload.seo_title;
    if (payload.seo_description !== undefined) patch.seo_description = payload.seo_description;
    if (payload.og_image_file_id !== undefined) patch.og_image_file_id = payload.og_image_file_id || null;
    if (payload.twitter_card !== undefined) patch.twitter_card = payload.twitter_card;
    if (payload.canonical_url !== undefined) patch.canonical_url = payload.canonical_url;
    if (payload.robots_directive !== undefined) patch.robots_directive = payload.robots_directive;
    if (Object.keys(patch).length === 0) {
      return PostModel.findById(postId);
    }
    try {
      return await PostModel.update(postId, patch);
    } catch (e) {
      if (e.code === '23505') {
        const err = new Error('Slug already in use for this account');
        err.statusCode = 409;
        throw err;
      }
      throw e;
    }
  }

  static async remove(postId, userId, isAdmin) {
    await this.assertAuthorOrAdmin(postId, userId, isAdmin);
    const ok = await PostModel.delete(postId);
    if (!ok) throw new Error('Post not found');
    return true;
  }
}

module.exports = PostService;
