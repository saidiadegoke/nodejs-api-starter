const pool = require('../../../db/pool');

class CustomizationModel {
  /**
   * Get customization settings for a site
   */
  static async getCustomization(siteId) {
    const result = await pool.query(
      'SELECT * FROM site_customization WHERE site_id = $1',
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Create or update customization settings
   */
  static async upsertCustomization(siteId, settings) {
    const { colors, fonts, logoUrl, spacing } = settings;
    
    const result = await pool.query(
      `INSERT INTO site_customization (site_id, colors, fonts, logo_url, spacing)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (site_id)
       DO UPDATE SET 
         colors = $2,
         fonts = $3,
         logo_url = $4,
         spacing = $5,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        siteId,
        colors ? JSON.stringify(colors) : null,
        fonts ? JSON.stringify(fonts) : null,
        logoUrl || null,
        spacing ? JSON.stringify(spacing) : null
      ]
    );
    return result.rows[0];
  }

  /**
   * Reset customization to default
   */
  static async resetCustomization(siteId) {
    const result = await pool.query(
      `UPDATE site_customization 
       SET colors = NULL, fonts = NULL, logo_url = NULL, spacing = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE site_id = $1
       RETURNING *`,
      [siteId]
    );
    return result.rows[0];
  }
}

module.exports = CustomizationModel;


