const TemplateModel = require('../models/template.model');
const SiteModel = require('../models/site.model');
const PageModel = require('../models/page.model');
const { generateDefaultTemplateConfig, isMinimalConfig, mergeWithDefaults } = require('../../../utils/defaultTemplateConfig');

class TemplateService {
  /**
   * Get all templates, with sites_used attached (sites using each template, owner-scoped).
   */
  static async getAllTemplates(filters = {}) {
    const templates = await TemplateModel.getAllTemplates(filters);
    const userId = filters.userId;
    if (!userId || templates.length === 0) {
      return templates.map((t) => ({ ...t, sites_used: [] }));
    }
    const templateIds = templates.map((t) => t.id);
    const rows = await TemplateModel.getSitesByTemplateIdsForOwner(templateIds, userId);
    const byTemplate = {};
    rows.forEach((row) => {
      const tid = String(row.template_id);
      if (!byTemplate[tid]) byTemplate[tid] = [];
      byTemplate[tid].push({ id: row.id, name: row.name, slug: row.slug });
    });
    return templates.map((t) => ({
      ...t,
      sites_used: byTemplate[String(t.id)] || [],
    }));
  }

  /**
   * Get template by ID
   */
  static async getTemplateById(templateId) {
    return await TemplateModel.getTemplateById(templateId);
  }

  /**
   * Get template by ID only if created_by matches userId (owner)
   */
  static async getTemplateByIdForOwner(templateId, userId) {
    return await TemplateModel.getTemplateByIdForOwner(templateId, userId);
  }

  /**
   * Get sites (id, name, slug) that use this template and are owned by userId
   */
  static async getSitesUsingTemplate(templateId, userId) {
    return await TemplateModel.getSitesByTemplateIdForOwner(templateId, userId);
  }

  /**
   * Delete template (owner only). Throws if not found or not owner.
   */
  static async deleteTemplate(templateId, userId) {
    const template = await TemplateModel.getTemplateByIdForOwner(templateId, userId);
    if (!template) {
      throw new Error('Template not found');
    }
    return await TemplateModel.deleteTemplate(templateId);
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
    // Require userId - all templates must be associated with a user
    if (!userId) {
      throw new Error('User ID is required to create a template - all templates must be associated with a user');
    }
    
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
      createdBy: userId, // Set created_by to the user ID (required)
    };

    return await TemplateModel.createTemplate(finalTemplateData);
  }

  /**
   * Add default pages to an existing template (only if owned by userId)
   * Only adds pages/blocks that don't already exist (by slug/ID)
   */
  static async addDefaultPages(templateId, userId) {
    const template = await TemplateModel.getTemplateByIdForOwner(templateId, userId);
    if (!template) {
      throw new Error('Template not found');
    }

    const config = typeof template.config === 'string'
      ? JSON.parse(template.config)
      : template.config || {};

    const updatedConfig = mergeWithDefaults(config);

    return await TemplateModel.updateTemplate(templateId, {
      config: JSON.stringify(updatedConfig),
    });
  }

  /**
   * Update template (only if owned by userId). Returns null if not found or not owner.
   */
  static async updateTemplate(templateId, templateData, userId) {
    const existing = await TemplateModel.getTemplateByIdForOwner(templateId, userId);
    if (!existing) {
      return null;
    }
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

