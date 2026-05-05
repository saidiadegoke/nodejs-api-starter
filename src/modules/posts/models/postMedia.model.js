const pool = require('../../../db/pool');

class PostMediaModel {
  static async listByPostId(postId) {
    const result = await pool.query(
      `SELECT pm.id, pm.post_id, pm.file_id, pm.role, pm.sort_order, pm.created_at,
              f.file_url, f.file_type, f.alt_text, f.file_size
       FROM post_media pm
       JOIN files f ON f.id = pm.file_id AND f.deleted_at IS NULL
       WHERE pm.post_id = $1
       ORDER BY pm.sort_order ASC, pm.created_at ASC`,
      [postId]
    );
    return result.rows;
  }

  /** Replace all media rows for a post (author sync from UI). */
  static async replaceForPost(postId, items) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM post_media WHERE post_id = $1', [postId]);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const role = ['featured', 'gallery', 'inline'].includes(item.role) ? item.role : 'gallery';
        const sort = Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : i;
        await client.query(
          `INSERT INTO post_media (post_id, file_id, role, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [postId, item.file_id, role, sort]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return PostMediaModel.listByPostId(postId);
  }
}

module.exports = PostMediaModel;
