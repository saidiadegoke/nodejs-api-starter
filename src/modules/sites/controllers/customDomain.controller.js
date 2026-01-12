const CustomDomainService = require('../services/customDomain.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } = require('../../../shared/constants/statusCodes');

class CustomDomainController {
  /**
   * Create custom domain
   * POST /sites/:siteId/custom-domains
   */
  static async createCustomDomain(req, res) {
    try {
      const { siteId } = req.params;
      const { domain } = req.body;

      if (!domain) {
        return sendError(res, 'Domain is required', BAD_REQUEST);
      }

      const customDomain = await CustomDomainService.createCustomDomain(
        siteId,
        domain,
        req.user.user_id
      );

      sendSuccess(res, customDomain, 'Custom domain added successfully', OK);
    } catch (error) {
      const statusCode = 
        error.message === 'Site not found' ? NOT_FOUND :
        error.message === 'Unauthorized' ? UNAUTHORIZED :
        error.message === 'This domain is already in use by another site' ? BAD_REQUEST :
        error.message === 'Invalid domain format' ? BAD_REQUEST :
        BAD_REQUEST;

      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get all custom domains for a site
   * GET /sites/:siteId/custom-domains
   */
  static async getCustomDomains(req, res) {
    try {
      const { siteId } = req.params;
      const customDomains = await CustomDomainService.getCustomDomainsBySite(
        siteId,
        req.user.user_id
      );

      sendSuccess(res, customDomains, 'Custom domains retrieved successfully', OK);
    } catch (error) {
      const statusCode = 
        error.message === 'Site not found' ? NOT_FOUND :
        error.message === 'Unauthorized' ? UNAUTHORIZED :
        BAD_REQUEST;

      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Verify custom domain
   * POST /sites/:siteId/custom-domains/:domainId/verify
   */
  static async verifyCustomDomain(req, res) {
    try {
      const { siteId, domainId } = req.params;
      const result = await CustomDomainService.verifyCustomDomain(
        domainId,
        siteId,
        req.user.user_id
      );

      sendSuccess(res, result, result.verified ? 'Domain verified successfully' : result.message, OK);
    } catch (error) {
      const statusCode = 
        error.message === 'Site not found' || error.message === 'Custom domain not found' ? NOT_FOUND :
        error.message === 'Unauthorized' || error.message === 'Custom domain does not belong to this site' ? UNAUTHORIZED :
        BAD_REQUEST;

      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get custom domain status
   * GET /sites/:siteId/custom-domains/:domainId/status
   */
  static async getCustomDomainStatus(req, res) {
    try {
      const { siteId, domainId } = req.params;
      const status = await CustomDomainService.getCustomDomainStatus(
        domainId,
        siteId,
        req.user.user_id
      );

      sendSuccess(res, status, 'Domain status retrieved successfully', OK);
    } catch (error) {
      const statusCode = 
        error.message === 'Site not found' || error.message === 'Custom domain not found' ? NOT_FOUND :
        error.message === 'Unauthorized' || error.message === 'Custom domain does not belong to this site' ? UNAUTHORIZED :
        BAD_REQUEST;

      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Delete custom domain
   * DELETE /sites/:siteId/custom-domains/:domainId
   */
  static async deleteCustomDomain(req, res) {
    try {
      const { siteId, domainId } = req.params;
      await CustomDomainService.deleteCustomDomain(
        domainId,
        siteId,
        req.user.user_id
      );

      sendSuccess(res, null, 'Custom domain deleted successfully', OK);
    } catch (error) {
      const statusCode = 
        error.message === 'Site not found' || error.message === 'Custom domain not found' ? NOT_FOUND :
        error.message === 'Unauthorized' || error.message === 'Custom domain does not belong to this site' ? UNAUTHORIZED :
        BAD_REQUEST;

      sendError(res, error.message, statusCode);
    }
  }
}

module.exports = CustomDomainController;

