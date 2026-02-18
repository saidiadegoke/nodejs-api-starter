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

    // Write Traefik dynamic config so the Host route exists as soon as the domain is added.
    // Then when the user points DNS (CNAME) to our edge, requests with Host: custom-domain will
    // be routed to the app instead of 404. Subdomains (*.smartstore.ng) are already configured.
    try {
      const TraefikConfigService = require('./traefikConfig.service');
      const writeTest = await TraefikConfigService.testWritePermissions();
      if (writeTest.success) {
        await TraefikConfigService.writeDomainConfig(customDomain, site);
        logger.info(`[CustomDomainService] Traefik config written for ${customDomain.domain} (route will work once DNS points here)`);
      } else {
        logger.warn(`[CustomDomainService] Traefik config dir not writable: ${writeTest.error}`);
      }
    } catch (traefikErr) {
      logger.warn(`[CustomDomainService] Traefik config write failed for ${domain}:`, traefikErr.message);
    }

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

    // Verify ownership (TXT)
    const ownershipVerified = await DNSVerificationService.verifyDomainOwnership(
      customDomain.domain,
      customDomain.verification_token
    );

    if (ownershipVerified) {
      await CustomDomainModel.updateVerificationStatus(domainId, true);
    }

    // Check if domain is pointed (CNAME to our target)
    const cnameTarget = this.getCnameTarget(site.slug);
    let trafficVerified = false;
    try {
      trafficVerified = await DNSVerificationService.verifyCnamePointsToTarget(customDomain.domain, cnameTarget);
      if (trafficVerified) {
        await CustomDomainModel.updateTrafficVerified(domainId, true);
      }
    } catch (cnameErr) {
      logger.warn(`[CustomDomainService] CNAME check failed for ${customDomain.domain}:`, cnameErr.message);
    }

    const fullyVerified = ownershipVerified && trafficVerified;

    if (fullyVerified) {
      // Both ownership and pointing verified: Traefik config first (Traefik handles SSL via Let's Encrypt automatically)
      const TraefikConfigService = require('./traefikConfig.service');
      try {
        const certificate = await CertificateManagerService.autoAssignDomain(domainId, customDomain.domain);
        logger.info(`[CustomDomainService] Domain ${customDomain.domain} assigned to certificate ${certificate.id}`);
      } catch (certError) {
        logger.warn(`[CustomDomainService] Certificate assignment failed for ${customDomain.domain}:`, certError);
      }
      try {
        const writeTest = await TraefikConfigService.testWritePermissions();
        if (writeTest.success) {
          const traefikResult = await TraefikConfigService.generateConfigForDomain(domainId);
          if (traefikResult && traefikResult.usesCertResolver) {
            await CustomDomainModel.updateSSLStatus(domainId, 'active', 'traefik');
            logger.info(`[CustomDomainService] Traefik config written; SSL handled by Traefik/Let's Encrypt for ${customDomain.domain}`);
          }
          if (traefikResult) {
            logger.info(`[CustomDomainService] Traefik config generated for ${customDomain.domain}`);
          }
        } else {
          logger.error(`[CustomDomainService] Cannot write to Traefik config directory: ${writeTest.error}`);
        }
      } catch (traefikError) {
        logger.error(`[CustomDomainService] Traefik config generation failed for ${customDomain.domain}:`, traefikError);
      }
      // Only run app-level SSL provisioning when not using Traefik cert resolver (e.g. Cloudflare file cert)
      try {
        await SSLService.autoProvisionSSL(domainId, customDomain.domain);
      } catch (sslError) {
        logger.warn(`[CustomDomainService] SSL provisioning failed for ${customDomain.domain}:`, sslError);
      }
    }

    if (ownershipVerified && !trafficVerified) {
      return { verified: true, traffic_verified: false, message: 'Ownership verified. Point your domain (CNAME) and verify again to complete setup.' };
    }
    if (ownershipVerified && trafficVerified) {
      return { verified: true, traffic_verified: true, message: 'Domain verified successfully.' };
    }
    return { verified: false, traffic_verified: false, message: 'DNS verification failed. Please check your TXT record and try again.' };
  }

  /**
   * Check if domain is pointed (CNAME only). Use when ownership is already verified.
   * Returns traffic_verified and instructions so the client can show a modal if not pointed.
   */
  static async checkPointing(domainId, siteId, userId) {
    const site = await SiteModel.getSiteById(siteId);
    if (!site) throw new Error('Site not found');
    if (site.owner_id !== userId) throw new Error('Unauthorized');

    const customDomain = await CustomDomainModel.getCustomDomainById(domainId);
    if (!customDomain) throw new Error('Custom domain not found');
    if (customDomain.site_id !== parseInt(siteId)) throw new Error('Custom domain does not belong to this site');
    if (!customDomain.verified) {
      const cnameTarget = this.getCnameTarget(site.slug);
      const instructions = this.getPointingInstructionsForDomain(customDomain.domain, cnameTarget);
      return {
        traffic_verified: false,
        message: 'Verify domain ownership first (TXT record), then check pointing.',
        expected_target: cnameTarget,
        ...instructions,
      };
    }

    const cnameTarget = this.getCnameTarget(site.slug);
    let trafficVerified = false;
    try {
      trafficVerified = await DNSVerificationService.verifyCnamePointsToTarget(customDomain.domain, cnameTarget);
      if (trafficVerified) {
        await CustomDomainModel.updateTrafficVerified(domainId, true);
      }
    } catch (cnameErr) {
      logger.warn(`[CustomDomainService] CNAME check failed for ${customDomain.domain}:`, cnameErr.message);
    }

    if (trafficVerified) {
      const TraefikConfigService = require('./traefikConfig.service');
      try {
        await CertificateManagerService.autoAssignDomain(domainId, customDomain.domain).catch(() => {});
      } catch (_) {}
      try {
        const writeTest = await TraefikConfigService.testWritePermissions();
        if (writeTest.success) {
          const traefikResult = await TraefikConfigService.generateConfigForDomain(domainId);
          if (traefikResult && traefikResult.usesCertResolver) {
            await CustomDomainModel.updateSSLStatus(domainId, 'active', 'traefik');
          }
        }
      } catch (traefikError) {
        logger.error(`[CustomDomainService] Traefik config generation failed for ${customDomain.domain}:`, traefikError);
      }
      try {
        await SSLService.autoProvisionSSL(domainId, customDomain.domain).catch(() => {});
      } catch (_) {}
      return { traffic_verified: true, message: 'Domain is pointing correctly. Setup complete.' };
    }

    const instructions = this.getPointingInstructionsForDomain(customDomain.domain, cnameTarget);
    return {
      traffic_verified: false,
      message: 'Domain is not pointing here yet. Follow the steps below for your domain, then check again.',
      expected_target: cnameTarget,
      ...instructions,
    };
  }

  /**
   * Suggest CNAME host (name) for the given domain.
   * e.g. testapp.morgengreen.cloud → "testapp"; www.example.com → "www"; example.com (apex) → "www"
   */
  static getSuggestedCnameHost(domain) {
    const normalized = domain.toLowerCase().replace(/^www\./, '').trim();
    const parts = normalized.split('.');
    if (parts.length > 2) {
      return parts[0];
    }
    return 'www';
  }

  /**
   * True if domain is apex/root (e.g. example.com). No subdomain.
   */
  static isApexDomain(domain) {
    const normalized = domain.toLowerCase().replace(/^www\./, '').trim();
    const parts = normalized.split('.');
    return parts.length <= 2;
  }

  /**
   * Get zone (parent domain) for DNS. e.g. testapp.morgengreen.cloud → morgengreen.cloud
   */
  static getZone(domain) {
    const normalized = domain.toLowerCase().replace(/^www\./, '').trim();
    const parts = normalized.split('.');
    if (parts.length >= 2) {
      return parts.slice(1).join('.');
    }
    return normalized;
  }

  /**
   * Domain-specific pointing instructions: steps for this subdomain or options for root.
   * Uses the actual domain name in every step.
   */
  static getPointingInstructionsForDomain(domain, cnameTarget) {
    const isApex = this.isApexDomain(domain);
    const zone = this.getZone(domain);
    const host = this.getSuggestedCnameHost(domain);

    if (isApex) {
      return {
        is_apex: true,
        suggested_cname_host: 'www',
        zone,
        root_options: [
          {
            title: `Option A: CNAME for www.${domain} then redirect ${domain}`,
            steps: [
              `In your DNS provider, open the zone for ${domain}.`,
              `Add a CNAME record: Name/host = "www", Value/target = ${cnameTarget}. Save.`,
              `Set up a redirect so that visitors to ${domain} go to https://www.${domain}. (Many DNS or hosting panels have "Redirect" or "URL redirect" for the root.)`,
              'Wait a few minutes for DNS to propagate, then click "Check again" here.',
            ],
          },
          {
            title: `Option B: ALIAS/ANAME at root (if your provider supports it)`,
            steps: [
              `In your DNS provider, open the zone for ${domain}.`,
              `Add an ALIAS or ANAME record for the root (@ or ${domain}) with target ${cnameTarget}. (Supported by Cloudflare, DNSimple, and some others; not all providers offer this.)`,
              'Save and wait for DNS to propagate, then click "Check again" here.',
            ],
          },
        ],
        what_to_look_out_for: [
          'Use the exact target value above—no extra spaces or trailing dots.',
          'DNS can take a few minutes to several hours to propagate.',
        ],
      };
    }

    return {
      is_apex: false,
      suggested_cname_host: host,
      zone,
      steps: [
        `Log in to your DNS provider where ${zone} is managed.`,
        'Add a new CNAME record.',
        `Name/Host: ${host} (this makes ${domain} point to your site).`,
        `Value/Target: ${cnameTarget}`,
        'Save the record. TTL can be 3600 or your provider’s default.',
        'Wait a few minutes for DNS to propagate, then click "Check again" here.',
      ],
      what_to_look_out_for: [
        'Use the exact Name and Target above—no extra spaces or trailing dots in the target.',
        'DNS can take a few minutes to several hours to propagate.',
      ],
    };
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
      traffic_verified: !!customDomain.traffic_verified,
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

