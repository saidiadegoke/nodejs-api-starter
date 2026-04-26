const FileModel = require('../../files/models/file.model');
const PostMediaModel = require('../models/postMedia.model');
const PostService = require('./post.service');

class PostMediaService {
  static async listForPost(postId, viewerUserId, viewerIsAdmin) {
    const post = await PostService.getVisible(postId, viewerUserId, viewerIsAdmin);
    if (!post) return null;
    return PostMediaModel.listByPostId(postId);
  }

  static async replaceMedia(postId, userId, isAdmin, items) {
    if (!Array.isArray(items)) {
      const err = new Error('items array is required');
      err.statusCode = 400;
      throw err;
    }
    await PostService.assertAuthorOrAdmin(postId, userId, isAdmin);
    if (items.length === 0) {
      return PostMediaModel.replaceForPost(postId, []);
    }
    for (const item of items) {
      if (!item.file_id) {
        const err = new Error('Each item needs file_id');
        err.statusCode = 400;
        throw err;
      }
      const f = await FileModel.findById(item.file_id);
      if (!f) {
        const err = new Error(`File not found: ${item.file_id}`);
        err.statusCode = 404;
        throw err;
      }
      if (!isAdmin && f.uploaded_by !== userId) {
        const err = new Error('You can only attach files you uploaded');
        err.statusCode = 403;
        throw err;
      }
    }
    return PostMediaModel.replaceForPost(postId, items);
  }
}

module.exports = PostMediaService;
