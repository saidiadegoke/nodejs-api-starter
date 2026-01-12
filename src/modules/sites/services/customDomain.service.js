const CustomDomainModel = require('../models/customDomain.model');
const SiteModel = require('../models/site.model');
const DNSVerificationService = require('./dnsVerification.service');
const SSLService = require('./ssl.service');
const CertificateManagerService = require('./certificateManager.service');

class CustomDomainService {
  /**
   * Create custom domain for a site
   */
  static async createCustomDomain(siteId, domain, userId) {
    // Verify site ownership
    const site = await SiteModel.getSiteById(siteId);
    if (!site) {
      throw new Error('Site not found');
    }
    if (site.owner_id !== userId) {
      throw new Error('Unauthorized');
    }

    // Validate domain format
    if (!this.isValidDomain(domain)) {
      throw new Error('Invalid domain format');
    }

    // Check if domain is available
    const isAvailable = await CustomDomainModel.isDomainAvailable(domain, siteId);
    if (!isAvailable) {
      throw new Error('This domain is already in use by another site');
    }

    // Generate verification token
    const verificationToken = DNSVerificationService.generateVerificationToken();

    // Create custom domain record
    const customDomain = await CustomDomainModel.createCustomDomain(
      siteId,
      domain,
      verificationToken
    );

    // Get verification instructions
    const instructions = DNSVerificationService.getVerificationInstructions(domain, verificationToken);

    return {
      ...customDomain,
      instructions
    };
  }

  /**
   * Get all custom domains for a site
   */
  static async getCustomDomainsBySite(siteId, userId) {
    // Verify site ownership
    const site = await SiteModel.getSiteById(siteId);
    if (!site) {
      throw new Error('Site not found');
    }
    if (site.owner_id !== userId) {
      throw new Error('Unauthorized');
    }

    return await CustomDomainModel.getCustomDomainsBySite(siteId);
  }

  /**
   * Verify custom domain ownership
   */
  static async verifyCustomDomain(domainId, siteId, userId) {
    // Verify site ownership
    const site = await SiteModel.getSiteById(siteId);
    if (!site) {
      throw new Error('Site not found');
    }
    if (site.owner_id !== userId) {
      throw new Error('Unauthorized');
    }

    // Get custom domain
    const customDomain = await CustomDomainModel.getCustomDomainById(domainId);
    if (!customDomain) {
      throw new Error('Custom domain not found');
    }

    if (customDomain.site_id !== parseInt(siteId)) {
      throw new Error('Custom domain does not belong to this site');
    }

    // Verify DNS record
    const verified = await DNSVerificationService.verifyDomainOwnership(
      customDomain.domain,
      customDomain.verification_token
    );

    if (verified) {
      // Update verification status
      await CustomDomainModel.updateVerificationStatus(domainId, true);
      
      // Automatically assign domain to certificate
      try {
        const certificate = await CertificateManagerService.autoAssignDomain(domainId, customDomain.domain);
        logger.info(`[CustomDomainService] Domain ${customDomain.domain} assigned to certificate ${certificate.id}`);
      } catch (certError) {
        logger.warn(`[CustomDomainService] Certificate assignment failed for ${customDomain.domain}:`, certError);
        // Don't block verification if certificate assignment fails
      }
      
      // Auto-provision SSL certificate for verified domain
      try {
        await SSLService.autoProvisionSSL(domainId, customDomain.domain);
      } catch (sslError) {
        // Log SSL provisioning error but don't fail verification
        // Domain is verified, SSL can be retried later
        logger.warn(`[CustomDomainService] SSL provisioning failed for ${customDomain.domain}:`, sslError);
      }
      
      return { verified: true, message: 'Domain verified successfully' };
    } else {
      return { verified: false, message: 'DNS verification failed. Please check your DNS settings.' };
    }
  }

  /**
   * Delete custom domain
   */
  static async deleteCustomDomain(domainId, siteId, userId) {
    // Import here to avoid circular dependency
    const nginxService = require('./nginx.service');
    // Verify site ownership
    const site = await SiteModel.getSiteById(siteId);
    if (!site) {
      throw new Error('Site not found');
    }
    if (site.owner_id !== userId) {
      throw new Error('Unauthorized');
    }

    // Get custom domain
    const customDomain = await CustomDomainModel.getCustomDomainById(domainId);
    if (!customDomain) {
      throw new Error('Custom domain not found');
    }

    if (customDomain.site_id !== parseInt(siteId)) {
      throw new Error('Custom domain does not belong to this site');
    }

    // Remove domain from certificate if assigned
    if (customDomain.certificate_id) {
      try {
        await CertificateManagerService.removeDomainFromCertificate(
          customDomain.certificate_id,
          domainId
        );
      } catch (certError) {
        logger.warn(`[CustomDomainService] Failed to remove domain from certificate:`, certError);
        // Continue with deletion even if certificate removal fails
      }
    }

    // Delete custom domain
    return await CustomDomainModel.deleteCustomDomain(domainId);
  }

  /**
   * Get custom domain status
   */
  static async getCustomDomainStatus(domainId, siteId, userId) {
    // Verify site ownership
    const site = await SiteModel.getSiteById(siteId);
    if (!site) {
      throw new Error('Site not found');
    }
    if (site.owner_id !== userId) {
      throw new Error('Unauthorized');
    }

    // Get custom domain
    const customDomain = await CustomDomainModel.getCustomDomainById(domainId);
    if (!customDomain) {
      throw new Error('Custom domain not found');
    }

    if (customDomain.site_id !== parseInt(siteId)) {
      throw new Error('Custom domain does not belong to this site');
    }

    return {
      id: customDomain.id,
      domain: customDomain.domain,
      verified: customDomain.verified,
      ssl_status: customDomain.ssl_status,
      ssl_provider: customDomain.ssl_provider,
      verified_at: customDomain.verified_at,
      created_at: customDomain.created_at,
      updated_at: customDomain.updated_at,
    };
  }

  /**
   * Validate domain format
   */
  static isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return false;
    }

    // Basic domain validation regex
    const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').trim();
    
    return domainRegex.test(normalizedDomain) && normalizedDomain.length <= 255;
  }
}

module.exports = CustomDomainService;

