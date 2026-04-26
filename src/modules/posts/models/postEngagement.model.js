const pool = require('../../../db/pool');

class PostEngagementModel {
  static async likePost(postId, userId) {
    await pool.query(
      `INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)
       ON CONFLICT (post_id, user_id) DO NOTHING`,
      [postId, userId]
    );
    return PostEngagementModel.postLikeCount(postId);
  }

  static async unlikePost(postId, userId) {
    await pool.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
    return PostEngagementModel.postLikeCount(postId);
  }

  static async postLikeCount(postId) {
    const r = await pool.query(
      'SELECT COUNT(*)::int AS c FROM post_likes WHERE post_id = $1',
      [postId]
    );
    return r.rows[0].c;
  }

  static async userLikedPost(postId, userId) {
    const r = await pool.query(
      'SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2 LIMIT 1',
      [postId, userId]
    );
    return r.rowCount > 0;
  }

  static async likeComment(commentId, userId) {
    await pool.query(
      `INSERT INTO post_comment_likes (comment_id, user_id) VALUES ($1, $2)
       ON CONFLICT (comment_id, user_id) DO NOTHING`,
      [commentId, userId]
    );
    return PostEngagementModel.commentLikeCount(commentId);
  }

  static async unlikeComment(commentId, userId) {
    await pool.query('DELETE FROM post_comment_likes WHERE comment_id = $1 AND user_id = $2', [
      commentId,
      userId,
    ]);
    return PostEngagementModel.commentLikeCount(commentId);
  }

  static async commentLikeCount(commentId) {
    const r = await pool.query(
      'SELECT COUNT(*)::int AS c FROM post_comment_likes WHERE comment_id = $1',
      [commentId]
    );
    return r.rows[0].c;
  }

  static async userLikedComment(commentId, userId) {
    const r = await pool.query(
      'SELECT 1 FROM post_comment_likes WHERE comment_id = $1 AND user_id = $2 LIMIT 1',
      [commentId, userId]
    );
    return r.rowCount > 0;
  }
}

module.exports = PostEngagementModel;
