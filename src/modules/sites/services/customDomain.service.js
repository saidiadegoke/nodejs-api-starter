const CustomDomainModel = require('../models/customDomain.model');
const SiteModel = require('../models/site.model');
const DNSVerificationService = require('./dnsVerification.service');
const SSLService = require('./ssl.service');
const CertificateManagerService = require('./certificateManager.service');
const { logger } = require('../../../shared/utils/logger');

/** Base domain for subdomains (e.g. smartstore.ng). Used for CNAME target. */
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'smartstore.ng';

class CustomDomainService {
  /**
   * Build CNAME target for a site (subdomain.smartstore.ng).
   * Users point their custom domain here so traffic reaches the same app.
   */
  static getCnameTarget(siteSlug) {
    return `${siteSlug}.${BASE_DOMAIN}`;
  }

  /**
   * Get traffic instructions: CNAME from custom host to site subdomain.
   */
  static getTrafficInstructions(siteSlug) {
    const target = this.getCnameTarget(siteSlug);
    return {
      type: 'CNAME',
      target,
      name: 'www',
      instructions: [
        'Point your domain to your SmartStore site using a CNAME record:',
        `Name/Host: www (or your subdomain, e.g. shop)`,
        `Value/Target: ${target}`,
        'TTL: 3600 (or default)',
        '',
        'For the root domain (example.com), many providers require an A record or ALIAS/ANAME to your host\'s IP; use CNAME for www.example.com.'
      ]
    };
  }

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

    // Get verification instructions (TXT for ownership)
    const instructions = DNSVerificationService.getVerificationInstructions(domain, verificationToken);
    // Traffic instructions: CNAME to this site's subdomain
    const traffic_instructions = this.getTrafficInstructions(site.slug);

    return {
      ...customDomain,
      instructions,
      traffic_instructions
    };
  }

  /**
   * Get all custom domains for a site
   * Each domain includes traffic_target (CNAME target: siteSlug.smartstore.ng) for DNS instructions.
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

    const domains = await CustomDomainModel.getCustomDomainsBySite(siteId);
    const traffic_target = this.getCnameTarget(site.slug);
    return domains.map((d) => ({ ...d, traffic_target }));
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
      
      // Generate Traefik configuration for verified domain
      try {
        const TraefikConfigService = require('./traefikConfig.service');
        
        // Test write permissions first
        const writeTest = await TraefikConfigService.testWritePermissions();
        if (!writeTest.success) {
          logger.error(`[CustomDomainService] Cannot write to Traefik config directory: ${writeTest.error}`);
          logger.error(`[CustomDomainService] Fix permissions: sudo mkdir -p ${writeTest.directory} && sudo chown -R $(whoami):docker ${writeTest.directory} && sudo chmod -R 775 ${writeTest.directory}`);
          // Don't throw - allow verification to succeed, but log the issue
        } else {
          await TraefikConfigService.generateConfigForDomain(domainId);
          logger.info(`[CustomDomainService] Traefik config generated for ${customDomain.domain}`);
        }
      } catch (traefikError) {
        // Log error but don't fail verification
        // Config can be regenerated later
        logger.error(`[CustomDomainService] Traefik config generation failed for ${customDomain.domain}:`, traefikError);
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
    const TraefikConfigService = require('./traefikConfig.service');
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

    // Delete Traefik config if exists
    try {
      await TraefikConfigService.deleteDomainConfig(customDomain.domain);
      logger.info(`[CustomDomainService] Traefik config deleted for ${customDomain.domain}`);
    } catch (traefikError) {
      logger.warn(`[CustomDomainService] Traefik config deletion failed for ${customDomain.domain}:`, traefikError);
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

