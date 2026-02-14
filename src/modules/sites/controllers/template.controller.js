const TemplateService = require('../services/template.service');
const { getDefaultPageStructure, getDefaultBlocksForPage } = require('../../../utils/defaultTemplateConfig');
const FormInstanceService = require('../../formSubmissions/services/form-instance.service');
const EcommerceSyncService = require('../services/ecommerce-sync.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');
const { logger } = require('../../../shared/utils/logger');

class TemplateController {
  /**
   * Get all templates
   * If user is authenticated, only return their templates
   * Otherwise, return all active templates (for public browsing)
   */
  static async getAllTemplates(req, res) {
    try {
      const filters = { ...req.query };
      
      // If user is authenticated, filter by their user ID
      if (req.user && req.user.user_id) {
        filters.userId = req.user.user_id;
      }
      
      const templates = await TemplateService.getAllTemplates(filters);
      sendSuccess(res, templates, 'Templates retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get template by ID
   */
  static async getTemplateById(req, res) {
    try {
      const { templateId } = req.params;
      const template = await TemplateService.getTemplateById(templateId);
      if (!template) {
        return sendError(res, 'Template not found', NOT_FOUND);
      }
      
      // Ensure config is parsed (PostgreSQL JSONB is usually auto-parsed, but ensure it's an object)
      if (template.config) {
        try {
          template.config = typeof template.config === 'string' 
            ? JSON.parse(template.config) 
            : template.config;
        } catch (parseError) {
          console.error(`Error parsing template config for template ${templateId}:`, parseError);
          // If parsing fails, return empty config instead of failing
          template.config = {
            components: [],
            blocks: [],
            pages: [],
            theme: {
              colors: {},
              fonts: {},
            },
          };
        }
      }
      
      sendSuccess(res, template, 'Template retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get site template
   */
  static async getSiteTemplate(req, res) {
    try {
      const { siteId } = req.params;
      const template = await TemplateService.getSiteTemplate(siteId, req.user.user_id);
      sendSuccess(res, template, 'Site template retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Create new template
   */
  static async createTemplate(req, res) {
    try {
      const { name, description, category, previewImageUrl, thumbnailUrl, config, isPremium } = req.body;
      
      if (!name || !config) {
        return sendError(res, 'Name and config are required', BAD_REQUEST);
      }

      // Get user ID from authenticated request
      const userId = req.user?.user_id || null;

      const template = await TemplateService.createTemplate({
        name,
        description,
        category,
        previewImageUrl,
        thumbnailUrl,
        config,
        isPremium: isPremium || false,
      }, userId);

      sendSuccess(res, template, 'Template created successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update template
   */
  static async updateTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { name, description, category, previewImageUrl, thumbnailUrl, config, isPremium } = req.body;
      
      const template = await TemplateService.updateTemplate(templateId, {
        name,
        description,
        category,
        previewImageUrl,
        thumbnailUrl,
        config,
        isPremium,
      });

      if (!template) {
        return sendError(res, 'Template not found', NOT_FOUND);
      }

      if (config != null && template.config) {
        const configObj = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
        try {
          const { sitesProcessed, totalSynced } = await FormInstanceService.syncFormInstancesForSitesUsingTemplate(templateId, configObj);
          if (totalSynced > 0) {
            logger.info(`[TemplateController] After template ${templateId} update: synced ${totalSynced} form instance(s) across ${sitesProcessed} site(s)`);
          }
        } catch (syncErr) {
          logger.warn('[TemplateController] Form instance sync after template update failed:', syncErr.message);
        }
        try {
          const { sitesProcessed: ecomSites, hasEcommerce } = await EcommerceSyncService.syncEcommerceForSitesUsingTemplate(templateId, configObj);
          if (hasEcommerce && ecomSites > 0) {
            logger.info(`[TemplateController] After template ${templateId} update: set has_ecommerce for ${ecomSites} site(s)`);
          }
        } catch (syncErr) {
          logger.warn('[TemplateController] E-commerce sync after template update failed:', syncErr.message);
        }
      }

      sendSuccess(res, template, 'Template updated successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Apply template to site
   */
  static async applyTemplate(req, res) {
    try {
      const { siteId } = req.params;
      const { templateId } = req.body;
      const result = await TemplateService.applyTemplateToSite(siteId, templateId, req.user.user_id);
      sendSuccess(res, result, 'Template applied successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Add default pages to template
   */
  static async addDefaultPages(req, res) {
    try {
      const { templateId } = req.params;
      const template = await TemplateService.addDefaultPages(templateId);
      sendSuccess(res, template, 'Default pages added successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get default page structure and blocks for a page type (for "Add Page from template").
   * GET /templates/default-page-structure?pageType=home|about|contact|services|store
   */
  static async getDefaultPageStructure(req, res) {
    try {
      const pageType = (req.query.pageType || '').toLowerCase();
      const allowed = ['home', 'about', 'contact', 'services', 'store'];
      if (!allowed.includes(pageType)) {
        sendError(res, `pageType must be one of: ${allowed.join(', ')}`, BAD_REQUEST);
        return;
      }
      const page = getDefaultPageStructure(pageType);
      if (!page) {
        sendError(res, `Default page structure not found for: ${pageType}`, NOT_FOUND);
        return;
      }
      const blocks = getDefaultBlocksForPage(pageType);
      sendSuccess(res, { page, blocks }, 'Default page structure retrieved', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = TemplateController;

