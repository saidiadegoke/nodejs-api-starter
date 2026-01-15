const pool = require('../../../db/pool');

class TemplateModel {
  /**
   * Get all templates
   * If userId is provided, only return templates created by that user
   * Otherwise, return all active templates (for public browsing)
   */
  static async getAllTemplates(filters = {}) {
    let query = 'SELECT * FROM templates WHERE is_active = true';
    const params = [];
    let paramCount = 1;

    // Filter by user if provided (for authenticated users)
    if (filters.userId) {
      query += ` AND created_by = $${paramCount}`;
      params.push(filters.userId);
      paramCount++;
    }

    if (filters.category) {
      query += ` AND category = $${paramCount}`;
      params.push(filters.category);
      paramCount++;
    }

    if (filters.search) {
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${filters.search}%`);
      paramCount++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get template by ID
   */
  static async getTemplateById(templateId) {
    const result = await pool.query(
      'SELECT * FROM templates WHERE id = $1',
      [templateId]
    );
    return result.rows[0];
  }

  /**
   * Create template
   */
  static async createTemplate(templateData) {
    const { name, description, category, previewImageUrl, thumbnailUrl, config, isPremium, createdBy } = templateData;
    const result = await pool.query(
      `INSERT INTO templates (name, description, category, preview_image_url, thumbnail_url, config, is_premium, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, description, category, previewImageUrl, thumbnailUrl, JSON.stringify(config), isPremium || false, createdBy || null]
    );
    return result.rows[0];
  }

  /**
   * Update template
   */
  static async updateTemplate(templateId, templateData) {
    const { name, description, category, previewImageUrl, thumbnailUrl, config, isPremium } = templateData;
    
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      params.push(name);
      paramCount++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      params.push(description);
      paramCount++;
    }
    if (category !== undefined) {
      updates.push(`category = $${paramCount}`);
      params.push(category);
      paramCount++;
    }
    if (previewImageUrl !== undefined) {
      updates.push(`preview_image_url = $${paramCount}`);
      params.push(previewImageUrl);
      paramCount++;
    }
    if (thumbnailUrl !== undefined) {
      updates.push(`thumbnail_url = $${paramCount}`);
      params.push(thumbnailUrl);
      paramCount++;
    }
    if (config !== undefined) {
      updates.push(`config = $${paramCount}`);
      params.push(JSON.stringify(config));
      paramCount++;
    }
    if (isPremium !== undefined) {
      updates.push(`is_premium = $${paramCount}`);
      params.push(isPremium);
      paramCount++;
    }

    if (updates.length === 0) {
      // No updates provided, return current template
      return await this.getTemplateById(templateId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(templateId);

    const result = await pool.query(
      `UPDATE templates 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );
    return result.rows[0];
  }

  /**
   * Get site template
   */
  static async getSiteTemplate(siteId) {
    const result = await pool.query(
      `SELECT st.*, t.* 
       FROM site_templates st
       JOIN templates t ON st.template_id = t.id
       WHERE st.site_id = $1`,
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Apply template to site
   */
  static async applyTemplateToSite(siteId, templateId, customizationSettings = null) {
    const result = await pool.query(
      `INSERT INTO site_templates (site_id, template_id, customization_settings)
       VALUES ($1, $2, $3)
       ON CONFLICT (site_id) 
       DO UPDATE SET template_id = $2, customization_settings = $3, applied_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [siteId, templateId, customizationSettings ? JSON.stringify(customizationSettings) : null]
    );
    return result.rows[0];
  }
}

module.exports = TemplateModel;

