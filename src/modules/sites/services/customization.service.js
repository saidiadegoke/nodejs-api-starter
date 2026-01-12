const CustomizationModel = require('../models/customization.model');
const SiteModel = require('../models/site.model');

class CustomizationService {
  /**
   * Get customization settings
   */
  static async getCustomization(siteId, userId) {
    // Verify site ownership
    await this.verifySiteOwnership(siteId, userId);
    
    let customization = await CustomizationModel.getCustomization(siteId);
    
    // If no customization exists, return default structure
    if (!customization) {
      return {
        site_id: siteId,
        colors: null,
        fonts: null,
        logo_url: null,
        spacing: null,
      };
    }

    // Parse JSONB fields
    if (customization.colors && typeof customization.colors === 'string') {
      customization.colors = JSON.parse(customization.colors);
    }
    if (customization.fonts && typeof customization.fonts === 'string') {
      customization.fonts = JSON.parse(customization.fonts);
    }
    if (customization.spacing && typeof customization.spacing === 'string') {
      customization.spacing = JSON.parse(customization.spacing);
    }

    return customization;
  }

  /**
   * Update customization settings
   */
  static async updateCustomization(siteId, settings, userId) {
    // Verify site ownership
    await this.verifySiteOwnership(siteId, userId);
    
    return await CustomizationModel.upsertCustomization(siteId, settings);
  }

  /**
   * Reset customization to default
   */
  static async resetCustomization(siteId, userId) {
    // Verify site ownership
    await this.verifySiteOwnership(siteId, userId);
    
    return await CustomizationModel.resetCustomization(siteId);
  }

  /**
   * Verify site ownership
   */
  static async verifySiteOwnership(siteId, userId) {
    const site = await SiteModel.getSiteById(siteId);
    if (!site) {
      throw new Error('Site not found');
    }
    if (site.owner_id !== userId) {
      throw new Error('Unauthorized');
    }
  }
}

module.exports = CustomizationService;


