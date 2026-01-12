const CertificateManagerService = require('../services/certificateManager.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } = require('../../../shared/constants/statusCodes');
const { logger } = require('../../../shared/utils/logger');

class CertificateController {
  /**
   * Get all certificates (admin only)
   */
  static async getAllCertificates(req, res) {
    try {
      const certificates = await CertificateManagerService.getAllCertificates();
      sendSuccess(res, certificates, 'Certificates retrieved successfully', OK);
    } catch (error) {
      logger.error('Error fetching certificates:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get certificate details
   */
  static async getCertificateById(req, res) {
    try {
      const { certificateId } = req.params;
      const certificate = await CertificateManagerService.getCertificateById(certificateId);
      
      if (!certificate) {
        return sendError(res, 'Certificate not found', NOT_FOUND);
      }

      const domains = await CertificateManagerService.getCertificateDomains(certificateId);
      
      sendSuccess(res, { ...certificate, domains }, 'Certificate retrieved successfully', OK);
    } catch (error) {
      logger.error('Error fetching certificate:', error);
      const statusCode = error.message.includes('not found') ? NOT_FOUND : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Create new certificate (admin only)
   */
  static async createCertificate(req, res) {
    try {
      const { domains } = req.body; // Optional: array of domains to include
      
      const certificate = domains && domains.length > 0
        ? await CertificateManagerService.batchCreateCertificate(domains)
        : await CertificateManagerService.createNewCertificateViaAPI();
      
      sendSuccess(res, certificate, 'Certificate created successfully', OK);
    } catch (error) {
      logger.error('Error creating certificate:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Manually assign domain to certificate
   */
  static async assignDomain(req, res) {
    try {
      const { certificateId } = req.params;
      const { customDomainId, domain } = req.body;

      if (!customDomainId || !domain) {
        return sendError(res, 'customDomainId and domain are required', BAD_REQUEST);
      }

      await CertificateManagerService.addDomainToCertificate(certificateId, customDomainId, domain);
      await CertificateManagerService.updateCertificateDomainCount(certificateId);
      
      sendSuccess(res, null, 'Domain assigned to certificate successfully', OK);
    } catch (error) {
      logger.error('Error assigning domain to certificate:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Remove domain from certificate
   */
  static async removeDomain(req, res) {
    try {
      const { certificateId } = req.params;
      // Support both query param and body for customDomainId
      const customDomainId = req.query.customDomainId || req.body.customDomainId;

      if (!customDomainId) {
        return sendError(res, 'customDomainId is required', BAD_REQUEST);
      }

      await CertificateManagerService.removeDomainFromCertificate(certificateId, customDomainId);
      
      sendSuccess(res, null, 'Domain removed from certificate successfully', OK);
    } catch (error) {
      logger.error('Error removing domain from certificate:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete certificate
   */
  static async deleteCertificate(req, res) {
    try {
      const { certificateId } = req.params;
      await CertificateManagerService.deleteCertificate(certificateId);
      sendSuccess(res, null, 'Certificate deleted successfully', OK);
    } catch (error) {
      logger.error('Error deleting certificate:', error);
      const statusCode = error.message.includes('not found') ? NOT_FOUND : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get base origin certificate for smartstore.ng
   */
  static async getBaseOriginCertificate(req, res) {
    try {
      const certificate = await CertificateManagerService.getBaseOriginCertificate();
      sendSuccess(res, certificate, certificate ? 'Base origin certificate found' : 'Base origin certificate not found', OK);
    } catch (error) {
      logger.error('Error fetching base origin certificate:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Create base origin certificate for smartstore.ng and *.smartstore.ng
   */
  static async createBaseOriginCertificate(req, res) {
    try {
      const certificate = await CertificateManagerService.createBaseOriginCertificate();
      sendSuccess(res, certificate, 'Base origin certificate created successfully', OK);
    } catch (error) {
      logger.error('Error creating base origin certificate:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = CertificateController;

