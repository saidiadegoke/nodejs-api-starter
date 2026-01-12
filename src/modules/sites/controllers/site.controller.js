const SiteService = require('../services/site.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } = require('../../../shared/constants/statusCodes');

class SiteController {
  /**
   * Get all sites for current user
   */
  static async getMySites(req, res) {
    try {
      const sites = await SiteService.getUserSites(req.user.user_id);
      sendSuccess(res, sites, 'Sites retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get site by ID
   */
  static async getSiteById(req, res) {
    try {
      const { siteId } = req.params;
      const site = await SiteService.getSiteById(siteId, req.user.user_id);
      sendSuccess(res, site, 'Site retrieved successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : 
                        error.message === 'Unauthorized' ? UNAUTHORIZED : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get site by slug
   */
  static async getSiteBySlug(req, res) {
    try {
      const { slug } = req.params;
      const site = await SiteService.getSiteBySlug(slug, req.user.user_id);
      sendSuccess(res, site, 'Site retrieved successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : 
                        error.message === 'Unauthorized' ? UNAUTHORIZED : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Create new site
   */
  static async createSite(req, res) {
    try {
      const site = await SiteService.createSite(req.body, req.user.user_id);
      sendSuccess(res, site, 'Site created successfully', OK);
    } catch (error) { console.error(error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update site
   */
  static async updateSite(req, res) {
    try {
      const { siteId } = req.params;
      const site = await SiteService.updateSite(siteId, req.body, req.user.user_id);
      sendSuccess(res, site, 'Site updated successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : 
                        error.message === 'Unauthorized' ? UNAUTHORIZED : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Delete site
   */
  static async deleteSite(req, res) {
    try {
      const { siteId } = req.params;
      await SiteService.deleteSite(siteId, req.user.user_id);
      sendSuccess(res, null, 'Site deleted successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : 
                        error.message === 'Unauthorized' ? UNAUTHORIZED : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }
}

module.exports = SiteController;

