const pool = require('../../../db/pool');

function appendModerationFilter(values, opts) {
  const { viewerUserId, viewerIsAdmin, postAuthorId } = opts;
  if (viewerIsAdmin) return '';
  if (!viewerUserId) {
    return ` AND c.moderation_status = 'approved'`;
  }
  if (postAuthorId && viewerUserId === postAuthorId) {
    values.push(viewerUserId);
    const idx = values.length;
    return ` AND (c.moderation_status IN ('approved','pending') OR c.user_id = $${idx})`;
  }
  return ` AND c.moderation_status = 'approved'`;
}

class PostCommentModel {
  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM post_comments WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0] || null;
  }

  static async listFlatByPostId(postId, opts = {}) {
    const values = [postId];
    const modSql = appendModerationFilter(values, opts);
    const result = await pool.query(
      `SELECT c.*, u.email AS author_email
       FROM post_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.post_id = $1 AND c.deleted_at IS NULL
       ${modSql}
       ORDER BY c.created_at ASC`,
      values
    );
    return result.rows;
  }

  static async countFlatByPostId(postId, opts = {}) {
    const values = [postId];
    const modSql = appendModerationFilter(values, opts);
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM post_comments c
       WHERE c.post_id = $1 AND c.deleted_at IS NULL ${modSql}`,
      values
    );
    return r.rows[0].c;
  }

  static async listFlatPaginated(postId, opts, { page = 1, limit = 30 }) {
    const offset = (page - 1) * limit;
    const values = [postId];
    const modSql = appendModerationFilter(values, opts);
    const countR = await pool.query(
      `SELECT COUNT(*)::int AS c FROM post_comments c
       WHERE c.post_id = $1 AND c.deleted_at IS NULL ${modSql}`,
      values
    );
    const total = countR.rows[0].c;
    const limIdx = values.length + 1;
    values.push(limit, offset);
    const dataR = await pool.query(
      `SELECT c.*, u.email AS author_email
       FROM post_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.post_id = $1 AND c.deleted_at IS NULL
       ${modSql}
       ORDER BY c.created_at DESC
       LIMIT $${limIdx} OFFSET $${limIdx + 1}`,
      values
    );
    return { comments: dataR.rows, total, page, limit };
  }

  static async create({ post_id, user_id, parent_id, body, meta = {}, moderation_status = 'approved' }) {
    const result = await pool.query(
      `INSERT INTO post_comments (post_id, user_id, parent_id, body, meta, moderation_status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING *`,
      [post_id, user_id, parent_id || null, body, JSON.stringify(meta || {}), moderation_status]
    );
    return result.rows[0];
  }

  static async updateBody(id, body) {
    const result = await pool.query(
      `UPDATE post_comments SET body = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [body, id]
    );
    return result.rows[0] || null;
  }

  static async moderate(commentId, postId, status, moderatorUserId) {
    const result = await pool.query(
      `UPDATE post_comments
       SET moderation_status = $1,
           moderated_at = NOW(),
           moderated_by = $2,
           updated_at = NOW()
       WHERE id = $3 AND post_id = $4 AND deleted_at IS NULL
       RETURNING *`,
      [status, moderatorUserId, commentId, postId]
    );
    return result.rows[0] || null;
  }

  static async softDelete(id) {
    const result = await pool.query(
      `UPDATE post_comments SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );
    return result.rowCount > 0;
  }

  static async listPendingAdmin({ page = 1, limit = 50 } = {}) {
    const offset = (page - 1) * limit;
    const countR = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM post_comments c
       WHERE c.moderation_status = 'pending' AND c.deleted_at IS NULL`
    );
    const total = countR.rows[0].c;
    const dataR = await pool.query(
      `SELECT c.*, p.title AS post_title, p.user_id AS post_author_id, u.email AS author_email
       FROM post_comments c
       JOIN posts p ON p.id = c.post_id
       JOIN users u ON u.id = c.user_id
       WHERE c.moderation_status = 'pending' AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return { comments: dataR.rows, total, page, limit };
  }
}

module.exports = PostCommentModel;
