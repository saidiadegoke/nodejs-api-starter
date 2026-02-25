const pool = require('../../../db/pool');

class SiteModel {
  /**
   * Get all sites for a user (includes template_id and template_name)
   */
  static async getUserSites(userId) {
    const result = await pool.query(
      `SELECT 
        s.*,
        st.template_id,
        t.name AS template_name
      FROM sites s
      LEFT JOIN site_templates st ON s.id = st.site_id
      LEFT JOIN templates t ON t.id = st.template_id
      WHERE s.owner_id = $1 
      ORDER BY s.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Get site by ID (includes template_id and template_name)
   */
  static async getSiteById(siteId) {
    const result = await pool.query(
      `SELECT 
        s.*,
        st.template_id,
        t.name AS template_name
      FROM sites s
      LEFT JOIN site_templates st ON s.id = st.site_id
      LEFT JOIN templates t ON t.id = st.template_id
      WHERE s.id = $1`,
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Get site by slug (includes template_id and template_name)
   */
  static async getSiteBySlug(slug) {
    const result = await pool.query(
      `SELECT 
        s.*,
        st.template_id,
        t.name AS template_name
      FROM sites s
      LEFT JOIN site_templates st ON s.id = st.site_id
      LEFT JOIN templates t ON t.id = st.template_id
      WHERE s.slug = $1`,
      [slug]
    );
    return result.rows[0];
  }

  /**
   * Create a new site
   */
  static async createSite(siteData) {
    const { slug, name, primaryDomain, engineVersion, status, ownerId, defaultLayoutId, siteType } = siteData;
    
    // Check if default_layout_id column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='sites' AND column_name='default_layout_id'
    `);
    
    const hasDefaultLayoutColumn = columnCheck.rows.length > 0;
    
    if (hasDefaultLayoutColumn) {
      // Column exists, include it in INSERT
      const result = await pool.query(
        `INSERT INTO sites (slug, name, primary_domain, engine_version, status, owner_id, default_layout_id, site_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [slug, name, primaryDomain || null, engineVersion || 'v1.0.0', status || 'active', ownerId, defaultLayoutId || 'header-main-footer', siteType || 'full']
      );
      return result.rows[0];
    } else {
      // Column doesn't exist, exclude it from INSERT
      const result = await pool.query(
        `INSERT INTO sites (slug, name, primary_domain, engine_version, status, owner_id, site_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [slug, name, primaryDomain || null, engineVersion || 'v1.0.0', status || 'active', ownerId, siteType || 'full']
      );
      return result.rows[0];
    }
  }

  /**
   * Update site
   */
  static async updateSite(siteId, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return this.getSiteById(siteId);
    }

    values.push(siteId);
    const result = await pool.query(
      `UPDATE sites SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0];
  }

  /**
   * Delete site
   */
  static async deleteSite(siteId) {
    await pool.query('DELETE FROM sites WHERE id = $1', [siteId]);
    return true;
  }

  /**
   * Check if slug is available
   */
  static async isSlugAvailable(slug, excludeSiteId = null) {
    let query = 'SELECT COUNT(*) FROM sites WHERE slug = $1';
    const params = [slug];
    
    if (excludeSiteId) {
      query += ' AND id != $2';
      params.push(excludeSiteId);
    }
    
    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count) === 0;
  }

  /**
   * Get site by custom domain
   * Includes template_id from site_templates join
   */
  static async getSiteByCustomDomain(domain) {
    // Normalize domain (remove www, lowercase)
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
    
    // Check both primary_domain and custom_domains table (includes template_id and template_name)
    const result = await pool.query(
      `SELECT 
        s.*,
        st.template_id,
        t.name AS template_name
      FROM sites s
      LEFT JOIN site_templates st ON s.id = st.site_id
      LEFT JOIN templates t ON t.id = st.template_id
      WHERE (s.primary_domain IS NOT NULL 
        AND LOWER(REPLACE(s.primary_domain, 'www.', '')) = $1)
      OR EXISTS (
        SELECT 1 FROM custom_domains cd
        WHERE cd.site_id = s.id
        AND LOWER(REPLACE(cd.domain, 'www.', '')) = $1
        AND cd.verified = true
      )`,
      [normalizedDomain]
    );
    return result.rows[0];
  }

  /**
   * Get site by hostname (subdomain or custom domain)
   */
  static async getSiteByHostname(hostname) {
    // Normalize hostname
    const normalized = hostname.toLowerCase().replace(/^www\./, '').split(':')[0];
    
    // Check if it's a subdomain of our base domain
    const baseDomain = process.env.BASE_DOMAIN || 'smartstore.ng';
    if (normalized.endsWith(`.${baseDomain}`)) {
      const slug = normalized.split('.')[0];
      return await this.getSiteBySlug(slug);
    }
    
    // Otherwise, check custom domain
    return await this.getSiteByCustomDomain(normalized);
  }
}

module.exports = SiteModel;

