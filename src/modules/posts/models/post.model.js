const pool = require('../../../db/pool');

class PostModel {
  static async applyScheduledPublishing() {
    await pool.query(
      `UPDATE posts
       SET status = 'published',
           published_at = COALESCE(published_at, NOW()),
           updated_at = NOW()
       WHERE status = 'draft'
         AND scheduled_publish_at IS NOT NULL
         AND scheduled_publish_at <= NOW()`
    );
  }

  static async create(data) {
    const {
      user_id,
      title,
      slug,
      body = null,
      excerpt = null,
      status = 'draft',
      meta = {},
      published_at = null,
      scheduled_publish_at = null,
      seo_title = null,
      seo_description = null,
      og_image_file_id = null,
      twitter_card = 'summary',
      canonical_url = null,
      robots_directive = null,
    } = data;

    let pubAt = published_at;
    if (status === 'published' && !pubAt) {
      pubAt = new Date();
    }

    const result = await pool.query(
      `INSERT INTO posts (
        user_id, title, slug, body, excerpt, status, published_at, meta,
        scheduled_publish_at, seo_title, seo_description, og_image_file_id,
        twitter_card, canonical_url, robots_directive
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        user_id,
        title,
        slug,
        body,
        excerpt,
        status,
        pubAt,
        JSON.stringify(meta || {}),
        scheduled_publish_at || null,
        seo_title,
        seo_description,
        og_image_file_id || null,
        twitter_card || 'summary',
        canonical_url,
        robots_directive,
      ]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  static async findByUserAndSlug(userId, slug) {
    const normalized = String(slug).toLowerCase();
    const result = await pool.query('SELECT * FROM posts WHERE user_id = $1 AND slug = $2', [
      userId,
      normalized,
    ]);
    return result.rows[0] || null;
  }

  static async listPublished({ page = 1, limit = 20, q = null } = {}) {
    await PostModel.applyScheduledPublishing();
    const offset = (page - 1) * limit;
    const values = [];
    let where = "WHERE p.status = 'published'";
    if (q && String(q).trim()) {
      const term = String(q).trim();
      where +=
        ' AND (p.search_vector @@ plainto_tsquery(\'english\', $1) OR p.title ILIKE $2 OR p.excerpt ILIKE $2 OR p.body ILIKE $2)';
      values.push(term, `%${term}%`);
    }
    const countQ = `SELECT COUNT(*)::int AS c FROM posts p ${where}`;
    const countResult = await pool.query(countQ, values);
    const total = countResult.rows[0].c;

    const limIdx = values.length + 1;
    values.push(limit, offset);
    const orderSql =
      q && String(q).trim()
        ? `ts_rank(p.search_vector, plainto_tsquery('english', $1)) DESC NULLS LAST, p.published_at DESC NULLS LAST, p.created_at DESC`
        : 'p.published_at DESC NULLS LAST, p.created_at DESC';
    const dataResult = await pool.query(
      `SELECT p.*, u.email AS author_email
       FROM posts p
       JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY ${orderSql}
       LIMIT $${limIdx} OFFSET $${limIdx + 1}`,
      values
    );
    return { posts: dataResult.rows, total, page, limit };
  }

  static async searchPublished({ q, page = 1, limit = 20 }) {
    await PostModel.applyScheduledPublishing();
    if (!q || !String(q).trim()) {
      return { posts: [], total: 0, page, limit };
    }
    const term = String(q).trim();
    const offset = (page - 1) * limit;
    const where =
      "WHERE p.status = 'published' AND (p.search_vector @@ plainto_tsquery('english', $1) OR p.title ILIKE $2 OR p.excerpt ILIKE $2 OR p.body ILIKE $2)";
    const values = [term, `%${term}%`];
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS c FROM posts p ${where}`,
      values
    );
    const total = countResult.rows[0].c;
    const limIdx = values.length + 1;
    values.push(limit, offset);
    const dataResult = await pool.query(
      `SELECT p.*, u.email AS author_email,
              ts_rank(p.search_vector, plainto_tsquery('english', $1)) AS rank
       FROM posts p
       JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY rank DESC NULLS LAST, p.published_at DESC NULLS LAST
       LIMIT $${limIdx} OFFSET $${limIdx + 1}`,
      values
    );
    return { posts: dataResult.rows, total, page, limit };
  }

  static async listRecentPublishedForFeed(limit = 50) {
    await PostModel.applyScheduledPublishing();
    const result = await pool.query(
      `SELECT p.id, p.title, p.slug, p.excerpt, p.body, p.published_at, p.updated_at, p.user_id, u.email AS author_email
       FROM posts p
       JOIN users u ON u.id = p.user_id
       WHERE p.status = 'published'
       ORDER BY p.published_at DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  static async listRecentPublishedForSitemap(limit = 500) {
    await PostModel.applyScheduledPublishing();
    const result = await pool.query(
      `SELECT p.id, p.slug, p.updated_at, p.user_id
       FROM posts p
       WHERE p.status = 'published'
       ORDER BY p.updated_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  static async listByUser(userId, { page = 1, limit = 20, status = null } = {}) {
    await PostModel.applyScheduledPublishing();
    const offset = (page - 1) * limit;
    const values = [userId];
    let where = 'WHERE p.user_id = $1';
    if (status) {
      where += ' AND p.status = $2';
      values.push(status);
    }
    const countQ = `SELECT COUNT(*)::int AS c FROM posts p ${where}`;
    const countResult = await pool.query(countQ, values);
    const total = countResult.rows[0].c;

    const limIdx = values.length + 1;
    values.push(limit, offset);
    const dataResult = await pool.query(
      `SELECT p.* FROM posts p ${where}
       ORDER BY p.updated_at DESC
       LIMIT $${limIdx} OFFSET $${limIdx + 1}`,
      values
    );
    return { posts: dataResult.rows, total, page, limit };
  }

  static async listAllAdmin({ page = 1, limit = 50, status = null, q = null } = {}) {
    await PostModel.applyScheduledPublishing();
    const offset = (page - 1) * limit;
    const values = [];
    let where = 'WHERE 1=1';
    let i = 1;
    if (status) {
      where += ` AND p.status = $${i++}`;
      values.push(status);
    }
    if (q && String(q).trim()) {
      where += ` AND (p.title ILIKE $${i} OR u.email ILIKE $${i} OR p.search_vector @@ plainto_tsquery('english', $${i + 1}))`;
      const term = String(q).trim();
      values.push(`%${term}%`, term);
      i += 2;
    }
    const countQ = `SELECT COUNT(*)::int AS c FROM posts p JOIN users u ON u.id = p.user_id ${where}`;
    const countResult = await pool.query(countQ, values);
    const total = countResult.rows[0].c;

    const limIdx = values.length + 1;
    values.push(limit, offset);
    const dataResult = await pool.query(
      `SELECT p.*, u.email AS author_email
       FROM posts p
       JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${limIdx} OFFSET $${limIdx + 1}`,
      values
    );
    return { posts: dataResult.rows, total, page, limit };
  }

  static async update(id, patch) {
    const allowed = [
      'title',
      'slug',
      'body',
      'excerpt',
      'status',
      'meta',
      'published_at',
      'scheduled_publish_at',
      'seo_title',
      'seo_description',
      'og_image_file_id',
      'twitter_card',
      'canonical_url',
      'robots_directive',
    ];
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [k, v] of Object.entries(patch)) {
      if (!allowed.includes(k)) continue;
      if (k === 'meta') {
        sets.push(`meta = $${idx++}::jsonb`);
        values.push(JSON.stringify(v));
      } else if (k === 'slug') {
        sets.push(`slug = $${idx++}`);
        values.push(String(v).toLowerCase());
      } else {
        sets.push(`${k} = $${idx++}`);
        values.push(v);
      }
    }
    if (!sets.length) return null;
    sets.push('updated_at = NOW()');
    values.push(id);
    const result = await pool.query(
      `UPDATE posts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  static async delete(id) {
    const result = await pool.query('DELETE FROM posts WHERE id = $1 RETURNING id', [id]);
    return result.rowCount > 0;
  }
}

module.exports = PostModel;
