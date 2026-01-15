const TemplateModel = require('../models/template.model');
const SiteModel = require('../models/site.model');
const PageModel = require('../models/page.model');
const { generateDefaultTemplateConfig, isMinimalConfig, mergeWithDefaults } = require('../../../utils/defaultTemplateConfig');

class TemplateService {
  /**
   * Get all templates
   */
  static async getAllTemplates(filters = {}) {
    return await TemplateModel.getAllTemplates(filters);
  }

  /**
   * Get template by ID
   */
  static async getTemplateById(templateId) {
    return await TemplateModel.getTemplateById(templateId);
  }

  /**
   * Get site template
   */
  static async getSiteTemplate(siteId, userId) {
    // Verify site ownership
    const site = await SiteModel.getSiteById(siteId);
    if (!site) {
      throw new Error('Site not found');
    }
    if (site.owner_id !== userId) {
      throw new Error('Unauthorized');
    }

    return await TemplateModel.getSiteTemplate(siteId);
  }

  /**
   * Create new template
   * Always includes default pages (Home, About, Contact, Services, Store)
   * with navigation (topnav, footer) and starter blocks.
   * Defaults are merged without duplicating existing pages/blocks.
   */
  static async createTemplate(templateData, userId = null) {
    // Parse config if it's a string
    let config = typeof templateData.config === 'string' 
      ? JSON.parse(templateData.config) 
      : templateData.config || {};

    // Always merge with defaults (without duplicating existing pages/blocks)
    console.log('[TemplateService] Merging with default pages and blocks');
    config = mergeWithDefaults(config);

    // Update templateData with merged config and user ID
    const finalTemplateData = {
      ...templateData,
      config: JSON.stringify(config),
      createdBy: userId, // Set created_by to the user ID
    };

    return await TemplateModel.createTemplate(finalTemplateData);
  }

  /**
   * Add default pages to an existing template
   * Only adds pages/blocks that don't already exist (by slug/ID)
   */
  static async addDefaultPages(templateId) {
    const template = await TemplateModel.getTemplateById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const config = typeof template.config === 'string' 
      ? JSON.parse(template.config) 
      : template.config || {};

    // Merge with defaults (without duplicating)
    const updatedConfig = mergeWithDefaults(config);

    // Update template with merged config
    return await TemplateModel.updateTemplate(templateId, {
      config: JSON.stringify(updatedConfig),
    });
  }

  /**
   * Update template
   */
  static async updateTemplate(templateId, templateData) {
    return await TemplateModel.updateTemplate(templateId, templateData);
  }

  /**
   * Apply template to site
   * This does NOT activate the site - activation is a separate action
   * Pages come from template.config.pages, not created in sites table
   */
  static async applyTemplateToSite(siteId, templateId, userId) {
    // Use SiteService to apply template (does not activate)
    const SiteService = require('./site.service');
    await SiteService.applyTemplateToSite(siteId, templateId, userId);

    return { success: true, message: 'Template applied successfully. You can now activate the site when ready.' };
  }
}

module.exports = TemplateService;

