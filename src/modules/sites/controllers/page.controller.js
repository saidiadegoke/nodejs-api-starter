const PageService = require('../services/page.service');
const PlanAccessService = require('../../payments/services/planAccess.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');

class PageController {
  /**
   * Get all pages for a site
   */
  static async getSitePages(req, res) {
    try {
      const { siteId } = req.params;
      const pages = await PageService.getSitePages(siteId, req.user.user_id);
      sendSuccess(res, pages, 'Pages retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get page by ID
   */
  static async getPageById(req, res) {
    try {
      const { siteId, pageId } = req.params;
      const page = await PageService.getPageById(pageId, siteId, req.user.user_id);
      if (!page) {
        return sendError(res, 'Page not found', NOT_FOUND);
      }
      sendSuccess(res, page, 'Page retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Create page
   */
  static async createPage(req, res) {
    try {
      const { siteId } = req.params;
      const userId = req.user.user_id;

      // Check page limit before creating
      const canCreate = await PlanAccessService.checkPageLimit(userId, parseInt(siteId));
      if (!canCreate.allowed) {
        return sendError(res, canCreate.message || 'Page limit reached', FORBIDDEN);
      }

      const page = await PageService.createPage({ ...req.body, siteId }, userId);
      
      // Update site page usage after creation
      await PlanAccessService.updateSitePageUsage(parseInt(siteId));
      
      sendSuccess(res, page, 'Page created successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update page
   */
  static async updatePage(req, res) {
    try {
      const { siteId, pageId } = req.params;
      const page = await PageService.updatePage(pageId, siteId, req.body, req.user.user_id);
      sendSuccess(res, page, 'Page updated successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete page
   */
  static async deletePage(req, res) {
    try {
      const { siteId, pageId } = req.params;
      await PageService.deletePage(pageId, siteId, req.user.user_id);
      
      // Update site page usage after deletion
      await PlanAccessService.updateSitePageUsage(parseInt(siteId));
      
      sendSuccess(res, null, 'Page deleted successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get page versions
   */
  static async getPageVersions(req, res) {
    try {
      const { siteId, pageId } = req.params;
      const versions = await PageService.getPageVersions(pageId, siteId, req.user.user_id);
      sendSuccess(res, versions, 'Page versions retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = PageController;

