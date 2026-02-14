const PreviewService = require('../services/preview.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class PreviewController {
  /**
   * Preview Component (system, custom, or composite)
   * GET /preview/component/:componentId
   * Returns JSON config for preview rendering
   */
  static async previewComponent(req, res) {
    try {
      const { componentId } = req.params;
      const userId = req.user?.id || null; // Optional: from auth token

      if (!componentId) {
        return sendError(res, 'Component ID is required', BAD_REQUEST);
      }

      const config = await PreviewService.previewComponent(componentId, userId);
      
      return sendSuccess(res, config, 'Component preview config retrieved successfully', OK);
    } catch (error) {
      if (error.message === 'Component not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      console.error('Preview component error:', error);
      sendError(res, error.message || 'Failed to preview component', BAD_REQUEST);
    }
  }

  /**
   * Preview Template
   * GET /preview/template/:templateId
   * Returns JSON config for preview rendering
   */
  static async previewTemplate(req, res) {
    try {
      const { templateId: rawId } = req.params;
      const userId = req.user?.id || null; // Optional: from auth token

      if (!rawId) {
        return sendError(res, 'Template ID is required', BAD_REQUEST);
      }

      const templateId = parseInt(rawId, 10);
      if (Number.isNaN(templateId) || templateId < 1) {
        return sendError(res, 'Invalid template ID', BAD_REQUEST);
      }

      console.log('[PreviewController] Preview template request:', { templateId, userId });
      
      const config = await PreviewService.previewTemplate(templateId, userId);
      
      console.log('[PreviewController] Template preview config generated:', {
        hasConfig: !!config,
        hasSite: !!config?.site,
        hasPages: !!config?.pages,
        pagesCount: config?.pages?.length || 0,
      });
      
      return sendSuccess(res, config, 'Template preview config retrieved successfully', OK);
    } catch (error) {
      console.error('[PreviewController] Preview template error:', {
        templateId: req.params.templateId,
        error: error.message,
        stack: error.stack,
      });
      
      if (error.message === 'Template not found' || error.message === 'Template not found or invalid') {
        return sendError(res, 'Template not found', NOT_FOUND);
      }
      sendError(res, error.message || 'Failed to preview template', BAD_REQUEST);
    }
  }

  /**
   * Preview Page
   * GET /preview/page/:pageId?siteId=:siteId
   * Returns JSON config for preview rendering
   */
  static async previewPage(req, res) {
    try {
      const { pageId } = req.params;
      const { siteId } = req.query;
      const userId = req.user?.id || null; // Optional: from auth token

      if (!pageId) {
        return sendError(res, 'Page ID is required', BAD_REQUEST);
      }

      if (!siteId) {
        return sendError(res, 'Site ID is required', BAD_REQUEST);
      }

      const config = await PreviewService.previewPage(pageId, siteId, userId);
      
      return sendSuccess(res, config, 'Page preview config retrieved successfully', OK);
    } catch (error) {
      if (error.message === 'Page not found' || error.message === 'Site not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      console.error('Preview page error:', error);
      sendError(res, error.message || 'Failed to preview page', BAD_REQUEST);
    }
  }

  /**
   * Preview Site
   * GET /preview/site/:siteId?pageSlug=:pageSlug
   * Returns JSON config for preview rendering
   */
  static async previewSite(req, res) {
    try {
      const { siteId } = req.params;
      const { pageSlug } = req.query;
      const userId = req.user?.id || null; // Optional: from auth token

      if (!siteId) {
        return sendError(res, 'Site ID is required', BAD_REQUEST);
      }

      const config = await PreviewService.previewSite(siteId, pageSlug || null, userId);
      
      return sendSuccess(res, config, 'Site preview config retrieved successfully', OK);
    } catch (error) {
      if (error.message === 'Site not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      console.error('Preview site error:', error);
      sendError(res, error.message || 'Failed to preview site', BAD_REQUEST);
    }
  }

  /**
   * Preview site (homepage) - Legacy HTML endpoint
   * GET /preview/site/:siteId/html
   * Public endpoint - returns HTML for backward compatibility
   */
  static async previewSiteHTML(req, res) {
    try {
      const { siteId } = req.params;
      const html = await PreviewService.renderSite(siteId);
      
      // Set content type to HTML
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      if (error.message === 'Site not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      console.error('Preview site HTML error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Preview specific page - Legacy HTML endpoint
   * GET /preview/page/:pageId/html?siteId=:siteId
   * Public endpoint - returns HTML for backward compatibility
   */
  static async previewPageHTML(req, res) {
    try {
      const { pageId } = req.params;
      const { siteId } = req.query;
      
      if (!siteId) {
        return sendError(res, 'Site ID is required', BAD_REQUEST);
      }

      const html = await PreviewService.renderPage(siteId, pageId);
      
      // Set content type to HTML
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      if (error.message === 'Site not found' || error.message === 'Page not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      console.error('Preview page HTML error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = PreviewController;

