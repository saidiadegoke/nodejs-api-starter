const BioService = require('../services/bio.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class BioController {
  
  /**
   * Quick setup for bio site
   * POST /api/sites/quick-setup
   */
  static async quickSetup(req, res) {
    try {
      const { businessName, whatsappNumber, logoFile } = req.body;
      
      if (!businessName) {
        return sendError(res, 'Business name is required', BAD_REQUEST);
      }
      if (!whatsappNumber) {
        return sendError(res, 'WhatsApp number is required', BAD_REQUEST);
      }

      const site = await BioService.quickSetup(
        { businessName, whatsappNumber, logoFile },
        req.user.user_id
      );

      sendSuccess(res, site, 'Bio site created successfully', CREATED);
    } catch (error) {
      console.error('Bio setup error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get bio page data (public)
   * GET /api/public/sites/:slug/bio
   */
  static async getBioPage(req, res) {
    try {
      const { slug } = req.params;
      const site = await BioService.getBioPage(slug);
      sendSuccess(res, site, 'Bio page retrieved successfully', OK);
    } catch (error) {
       const statusCode = error.message === 'Site not found' ? NOT_FOUND : BAD_REQUEST;
       sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get bio page data by ID (public)
   * GET /api/public/sites/:id/bio
   */
  static async getBioPageById(req, res) {
    try {
      const { id } = req.params;
      const site = await BioService.getBioPageById(id);
      sendSuccess(res, site, 'Bio page retrieved successfully', OK);
    } catch (error) {
       const statusCode = error.message === 'Site not found' ? NOT_FOUND : BAD_REQUEST;
       sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get commerce settings
   * GET /api/sites/:siteId/commerce-settings
   */
  static async getCommerceSettings(req, res) {
    try {
      const { siteId } = req.params;
      const settings = await BioService.getCommerceSettings(siteId, req.user.user_id);
      sendSuccess(res, settings, 'Commerce settings retrieved successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Update commerce settings
   * PUT /api/sites/:siteId/commerce-settings
   */
  static async updateCommerceSettings(req, res) {
    try {
      const { siteId } = req.params;
      const result = await BioService.updateCommerceSettings(siteId, req.body, req.user.user_id);
      sendSuccess(res, result, 'Commerce settings updated successfully', OK);
    } catch (error) {
       const statusCode = error.message === 'Site not found' ? NOT_FOUND : BAD_REQUEST;
       sendError(res, error.message, statusCode);
    }
  }

  /**
   * Update bio profile
   * PUT /api/sites/:siteId/bio-profile
   */
  static async updateBioProfile(req, res) {
    try {
      const { siteId } = req.params;
      const result = await BioService.updateBioProfile(siteId, req.body, req.user.user_id);
      sendSuccess(res, result, 'Bio profile updated successfully', OK);
    } catch (error) {
      console.error('Bio update error:', error);
      const statusCode = error.message === 'Unauthorized' ? 403 : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }
}

module.exports = BioController;
