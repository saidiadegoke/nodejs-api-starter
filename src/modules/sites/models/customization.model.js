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
    const { colors, fonts, logoUrl, spacing, theme, email_settings } = settings;

    const result = await pool.query(
      `INSERT INTO site_customization (site_id, colors, fonts, logo_url, spacing, theme, email_settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (site_id)
       DO UPDATE SET
         colors = COALESCE($2, site_customization.colors),
         fonts = COALESCE($3, site_customization.fonts),
         logo_url = COALESCE($4, site_customization.logo_url),
         spacing = COALESCE($5, site_customization.spacing),
         theme = COALESCE($6, site_customization.theme),
         email_settings = COALESCE($7, site_customization.email_settings),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        siteId,
        colors ? JSON.stringify(colors) : null,
        fonts ? JSON.stringify(fonts) : null,
        logoUrl || null,
        spacing ? JSON.stringify(spacing) : null,
        theme ? JSON.stringify(theme) : null,
        email_settings != null ? JSON.stringify(email_settings) : null
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
       SET colors = NULL, fonts = NULL, logo_url = NULL, spacing = NULL, theme = NULL, email_settings = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE site_id = $1
       RETURNING *`,
      [siteId]
    );
    return result.rows[0];
  }
}

module.exports = CustomizationModel;


