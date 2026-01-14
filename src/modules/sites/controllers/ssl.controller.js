const SSLService = require('../services/ssl.service');
const CustomDomainService = require('../services/customDomain.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class SSLController {
  /**
   * Get SSL status for a domain
   * GET /sites/:siteId/custom-domains/:domainId/ssl/status
   */
  static async getSSLStatus(req, res) {
    try {
      const { siteId, domainId } = req.params;
      
      // Verify ownership
      await CustomDomainService.getCustomDomainStatus(domainId, siteId, req.user.user_id);
      
      const status = await SSLService.checkSSLStatus(domainId);
      sendSuccess(res, status, 'SSL status retrieved successfully', OK);
    } catch (error) {
      const statusCode = 
        error.message === 'Custom domain not found' ? NOT_FOUND :
        BAD_REQUEST;

      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Provision SSL certificate for a domain
   * POST /sites/:siteId/custom-domains/:domainId/ssl/provision
   * Body: { provider?: 'cloudflare' | 'letsencrypt' | 'auto' }
   */
  static async provisionSSL(req, res) {
    try {
      const { siteId, domainId } = req.params;
      const { provider = 'auto' } = req.body; // 'cloudflare', 'letsencrypt', or 'auto'
      
      // Validate provider
      if (provider && !['cloudflare', 'letsencrypt', 'auto'].includes(provider)) {
        return sendError(res, 'Invalid provider. Must be "cloudflare", "letsencrypt", or "auto"', BAD_REQUEST);
      }
      
      // Verify ownership and get domain
      const status = await CustomDomainService.getCustomDomainStatus(domainId, siteId, req.user.user_id);
      
      if (!status.verified) {
        return sendError(res, 'Domain must be verified before SSL can be provisioned', BAD_REQUEST);
      }
      
      const result = await SSLService.provisionSSL(domainId, status.domain, provider);
      sendSuccess(res, result, 'SSL provisioning initiated', OK);
    } catch (error) {
      const statusCode = 
        error.message === 'Custom domain not found' ? NOT_FOUND :
        BAD_REQUEST;

      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Renew SSL certificate for a domain
   * POST /sites/:siteId/custom-domains/:domainId/ssl/renew
   */
  static async renewSSL(req, res) {
    try {
      const { siteId, domainId } = req.params;
      
      // Verify ownership and get domain
      const status = await CustomDomainService.getCustomDomainStatus(domainId, siteId, req.user.user_id);
      
      const result = await SSLService.renewSSL(domainId, status.domain);
      sendSuccess(res, result, 'SSL renewal initiated', OK);
    } catch (error) {
      const statusCode = 
        error.message === 'Custom domain not found' ? NOT_FOUND :
        BAD_REQUEST;

      sendError(res, error.message, statusCode);
    }
  }
}

module.exports = SSLController;

