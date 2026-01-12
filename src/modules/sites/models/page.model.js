const pool = require('../../../db/pool');

class PageModel {
  /**
   * Get all pages for a site
   */
  static async getSitePages(siteId) {
    const result = await pool.query(
      'SELECT * FROM pages WHERE site_id = $1 ORDER BY created_at DESC',
      [siteId]
    );
    return result.rows;
  }

  /**
   * Get page by ID
   */
  static async getPageById(pageId, siteId) {
    const result = await pool.query(
      'SELECT * FROM pages WHERE id = $1 AND site_id = $2',
      [pageId, siteId]
    );
    return result.rows[0];
  }

  /**
   * Get page by slug
   */
  static async getPageBySlug(siteId, slug) {
    const result = await pool.query(
      'SELECT * FROM pages WHERE site_id = $1 AND slug = $2',
      [siteId, slug]
    );
    return result.rows[0];
  }

  /**
   * Create page
   */
  static async createPage(pageData) {
    const { siteId, slug, title, content, published, status, metaDescription, metaKeywords, layoutId, isDefault } = pageData;
    const result = await pool.query(
      `INSERT INTO pages (site_id, slug, title, content, published, status, meta_description, meta_keywords, layout_id, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        siteId, 
        slug, 
        title, 
        JSON.stringify(content || {}), 
        published || false,
        status || (published ? 'published' : 'draft'),
        metaDescription || null,
        metaKeywords ? JSON.stringify(metaKeywords) : null,
        layoutId || null,
        isDefault || false
      ]
    );
    return result.rows[0];
  }

  /**
   * Update page
   */
  static async updatePage(pageId, siteId, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) {
        if (key === 'content') {
          fields.push(`content = $${paramCount}`);
          values.push(JSON.stringify(updates[key]));
        } else if (key === 'metaKeywords') {
          fields.push(`meta_keywords = $${paramCount}`);
          values.push(Array.isArray(updates[key]) ? JSON.stringify(updates[key]) : updates[key]);
        } else if (key === 'metaDescription') {
          fields.push(`meta_description = $${paramCount}`);
          values.push(updates[key]);
        } else {
          // Map camelCase to snake_case for database
          const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          fields.push(`${dbKey} = $${paramCount}`);
          values.push(updates[key]);
        }
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return this.getPageById(pageId, siteId);
    }

    values.push(pageId, siteId);
    const result = await pool.query(
      `UPDATE pages SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount} AND site_id = $${paramCount + 1}
       RETURNING *`,
      values
    );
    return result.rows[0];
  }

  /**
   * Delete page (prevents deletion of default pages)
   */
  static async deletePage(pageId, siteId) {
    // Check if page is a default page
    const pageResult = await pool.query(
      'SELECT is_default FROM pages WHERE id = $1 AND site_id = $2',
      [pageId, siteId]
    );
    
    if (pageResult.rows.length === 0) {
      throw new Error('Page not found');
    }
    
    if (pageResult.rows[0].is_default === true) {
      throw new Error('Cannot delete default pages. You can unpublish them instead.');
    }
    
    await pool.query(
      'DELETE FROM pages WHERE id = $1 AND site_id = $2',
      [pageId, siteId]
    );
    return true;
  }

  /**
   * Create page version
   */
  static async createPageVersion(pageId, content, createdBy) {
    // Get current max version
    const versionResult = await pool.query(
      'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM page_versions WHERE page_id = $1',
      [pageId]
    );
    const nextVersion = versionResult.rows[0].next_version;

    const result = await pool.query(
      `INSERT INTO page_versions (page_id, version, content, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [pageId, nextVersion, JSON.stringify(content), createdBy]
    );
    return result.rows[0];
  }

  /**
   * Get page versions
   */
  static async getPageVersions(pageId, limit = 20) {
    const result = await pool.query(
      `SELECT * FROM page_versions 
       WHERE page_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [pageId, limit]
    );
    return result.rows;
  }
}

module.exports = PageModel;

