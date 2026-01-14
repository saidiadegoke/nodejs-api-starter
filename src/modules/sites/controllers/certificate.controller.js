const CertificateManagerService = require('../services/certificateManager.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } = require('../../../shared/constants/statusCodes');
const { logger } = require('../../../shared/utils/logger');

class CertificateController {
  /**
   * Get all certificates (admin only)
   * Query param: provider (optional) - 'cloudflare' or 'letsencrypt'
   */
  static async getAllCertificates(req, res) {
    try {
      const { provider } = req.query; // Optional filter by provider
      const certificates = await CertificateManagerService.getAllCertificates(provider);
      sendSuccess(res, certificates, 'Certificates retrieved successfully', OK);
    } catch (error) {
      logger.error('Error fetching certificates:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get all Let's Encrypt certificates (admin only)
   */
  static async getLetsEncryptCertificates(req, res) {
    try {
      const certificates = await CertificateManagerService.getLetsEncryptCertificates();
      sendSuccess(res, certificates, 'Let\'s Encrypt certificates retrieved successfully', OK);
    } catch (error) {
      logger.error('Error fetching Let\'s Encrypt certificates:', error);
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
      const { domains, createPlaceholder } = req.body; // domains: optional array, createPlaceholder: boolean
      
      // If domains provided, use batch create
      if (domains && Array.isArray(domains) && domains.length > 0) {
        const certificate = await CertificateManagerService.batchCreateCertificate(domains);
        sendSuccess(res, certificate, 'Certificate created successfully', OK);
      } else if (createPlaceholder) {
        // Create placeholder certificate (no Cloudflare cert yet, will be uploaded later)
        const certificate = await CertificateManagerService.createNewCertificateViaAPI([], true);
        sendSuccess(res, certificate, 'Placeholder certificate created. Upload certificate files to activate.', OK);
      } else {
        throw new Error('Either provide domains or set createPlaceholder=true to create a placeholder certificate');
      }
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

  /**
   * Upload base origin certificate manually (when API creation fails)
   */
  static async uploadBaseOriginCertificate(req, res) {
    try {
      const { certificate, privateKey, cloudflareCertId, expiresAt } = req.body;

      if (!certificate || !privateKey) {
        return sendError(res, 'Certificate and private key are required', BAD_REQUEST);
      }

      const cert = await CertificateManagerService.uploadBaseOriginCertificate(
        certificate,
        privateKey,
        cloudflareCertId,
        expiresAt
      );

      sendSuccess(res, cert, 'Base origin certificate uploaded successfully', OK);
    } catch (error) {
      logger.error('Error uploading base origin certificate:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Upload multi-domain certificate manually (when API creation fails)
   */
  static async uploadMultiDomainCertificate(req, res) {
    try {
      const { certificate, privateKey, domains, certificateName, cloudflareCertId, expiresAt } = req.body;

      if (!certificate || !privateKey) {
        return sendError(res, 'Certificate and private key are required', BAD_REQUEST);
      }

      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        return sendError(res, 'At least one domain is required', BAD_REQUEST);
      }

      const cert = await CertificateManagerService.uploadMultiDomainCertificate(
        certificate,
        privateKey,
        domains,
        certificateName,
        cloudflareCertId,
        expiresAt
      );

      sendSuccess(res, cert, 'Multi-domain certificate uploaded successfully', OK);
    } catch (error) {
      logger.error('Error uploading multi-domain certificate:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = CertificateController;

