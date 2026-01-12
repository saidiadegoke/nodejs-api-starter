const TemplateService = require('../services/template.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

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

      const template = await TemplateService.createTemplate({
        name,
        description,
        category,
        previewImageUrl,
        thumbnailUrl,
        config,
        isPremium: isPremium || false,
      });

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
}

module.exports = TemplateController;

