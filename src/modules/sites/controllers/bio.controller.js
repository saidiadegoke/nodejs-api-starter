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
   * GET /api/sites/:siteId/payment-settings
   */
  static async getPaymentSettings(req, res) {
    try {
      const { siteId } = req.params;
      const result = await BioService.getPaymentSettings(siteId, req.user.user_id);
      sendSuccess(res, result || {}, 'Payment settings retrieved', OK);
    } catch (error) {
      sendError(res, error.message, error.message === 'Unauthorized' ? 403 : BAD_REQUEST);
    }
  }

  /**
   * PUT /api/sites/:siteId/payment-settings
   */
  static async updatePaymentSettings(req, res) {
    try {
      const { siteId } = req.params;
      const result = await BioService.updatePaymentSettings(siteId, req.body, req.user.user_id);
      sendSuccess(res, result, 'Payment settings updated', OK);
    } catch (error) {
      sendError(res, error.message, error.message === 'Unauthorized' ? 403 : BAD_REQUEST);
    }
  }

  /**
   * GET /api/sites/:siteId/payouts
   */
  static async getPayouts(req, res) {
    try {
      const { siteId } = req.params;
      const payouts = await BioService.getPayouts(siteId, req.user.user_id);
      sendSuccess(res, payouts, 'Payouts retrieved', OK);
    } catch (error) {
      sendError(res, error.message, error.message === 'Unauthorized' ? 403 : BAD_REQUEST);
    }
  }

  /**
   * POST /api/sites/:siteId/payouts
   */
  static async requestPayout(req, res) {
    try {
      const { siteId } = req.params;
      const { amount, reason } = req.body;
      if (!amount || isNaN(amount) || Number(amount) <= 0) {
        return sendError(res, 'amount must be a positive number', BAD_REQUEST);
      }
      const payout = await BioService.requestPayout(siteId, { amount: Number(amount), reason }, req.user.user_id);
      sendSuccess(res, payout, 'Payout initiated', CREATED);
    } catch (error) {
      const code = error.message === 'Unauthorized' ? 403 : BAD_REQUEST;
      sendError(res, error.message, code);
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
