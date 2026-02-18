const CustomDomainModel = require('../models/customDomain.model');
const { logger } = require('../../../shared/utils/logger');
const cloudflareService = require('./cloudflare.service');
const letsEncryptService = require('./letsencrypt.service');
const nginxService = require('./nginx.service');

class SSLService {
  /**
   * Provision SSL certificate for a verified domain
   * @param {number} domainId - Custom domain ID
   * @param {string} domain - Domain name
   * @param {string} provider - Provider preference: 'cloudflare', 'letsencrypt', 'auto' (default: 'auto')
   *   - 'cloudflare': Use Cloudflare only (fails if not configured)
   *   - 'letsencrypt': Use Let's Encrypt only
   *   - 'auto': Try Let's Encrypt first, fallback to Cloudflare (or vice versa based on env)
   */
  static async provisionSSL(domainId, domain, provider = 'auto') {
    try {
      logger.info(`[SSLService] Starting SSL provisioning for domain: ${domain} with provider preference: ${provider}`);

      // With Traefik, SSL is handled automatically via Let's Encrypt (certResolver). Ensure dynamic config is written and mark active.
      const TraefikConfigService = require('./traefikConfig.service');
      try {
        const traefikResult = await TraefikConfigService.generateConfigForDomain(domainId);
        if (traefikResult && traefikResult.usesCertResolver) {
          await CustomDomainModel.updateSSLStatus(domainId, 'active', 'traefik');
          logger.info(`[SSLService] Traefik config written; SSL handled by Traefik/Let's Encrypt for ${domain}`);
          return { success: true, provider: 'traefik', message: 'SSL is handled by Traefik (Let\'s Encrypt).' };
        }
      } catch (traefikErr) {
        logger.warn(`[SSLService] Traefik config step failed for ${domain}:`, traefikErr.message);
      }

      // Update status to provisioning for app-level providers (Cloudflare/certbot)
      await CustomDomainModel.updateSSLStatus(domainId, 'provisioning', null);

      let result;
      const sslProvider = process.env.SSL_PROVIDER || 'cloudflare';
      const allowLetsEncryptFallback = process.env.ALLOW_LETSENCRYPT_FALLBACK !== 'false';

      // Determine provider strategy
      let useCloudflare = false;
      let useLetsEncrypt = false;
      let tryCloudflareFirst = true;

      if (provider === 'cloudflare') {
        useCloudflare = true;
        useLetsEncrypt = false;
      } else if (provider === 'letsencrypt') {
        useCloudflare = false;
        useLetsEncrypt = true;
      } else if (provider === 'auto') {
        // Auto mode: based on env settings
        if (sslProvider === 'letsencrypt') {
          // Try Let's Encrypt first, then Cloudflare
          useLetsEncrypt = true;
          useCloudflare = cloudflareService.isConfigured() && allowLetsEncryptFallback;
          tryCloudflareFirst = false;
        } else {
          // Try Cloudflare first, then Let's Encrypt (default)
          useCloudflare = cloudflareService.isConfigured();
          useLetsEncrypt = allowLetsEncryptFallback;
          tryCloudflareFirst = true;
        }
      }

      // Try providers based on strategy
      if (tryCloudflareFirst && useCloudflare) {
        try {
          logger.info(`[SSLService] Attempting Cloudflare SSL for ${domain}`);
          result = await this.provisionCloudflareSSL(domainId, domain);
          logger.info(`[SSLService] Cloudflare SSL provisioned successfully for ${domain}`);
          return result;
        } catch (cloudflareError) {
          logger.warn(`[SSLService] Cloudflare SSL failed for ${domain}: ${cloudflareError.message}`);
          if (useLetsEncrypt) {
            logger.info(`[SSLService] Falling back to Let's Encrypt for ${domain}`);
            try {
              result = await this.provisionLetsEncryptSSL(domainId, domain);
              logger.info(`[SSLService] Let's Encrypt SSL provisioned as fallback for ${domain}`);
              return result;
            } catch (letsEncryptError) {
              logger.error(`[SSLService] Both Cloudflare and Let's Encrypt failed for ${domain}`);
              throw new Error(`SSL provisioning failed: Cloudflare (${cloudflareError.message}), Let's Encrypt (${letsEncryptError.message})`);
            }
          } else {
            throw new Error(`Cloudflare SSL failed: ${cloudflareError.message}`);
          }
        }
      } else if (useLetsEncrypt) {
        // Try Let's Encrypt first
        try {
          logger.info(`[SSLService] Attempting Let's Encrypt SSL for ${domain}`);
          result = await this.provisionLetsEncryptSSL(domainId, domain);
          logger.info(`[SSLService] Let's Encrypt SSL provisioned successfully for ${domain}`);
          return result;
        } catch (letsEncryptError) {
          logger.warn(`[SSLService] Let's Encrypt SSL failed for ${domain}: ${letsEncryptError.message}`);
          if (useCloudflare && cloudflareService.isConfigured()) {
            logger.info(`[SSLService] Falling back to Cloudflare for ${domain}`);
            try {
              result = await this.provisionCloudflareSSL(domainId, domain);
              logger.info(`[SSLService] Cloudflare SSL provisioned as fallback for ${domain}`);
              return result;
            } catch (cloudflareError) {
              logger.error(`[SSLService] Both Let's Encrypt and Cloudflare failed for ${domain}`);
              throw new Error(`SSL provisioning failed: Let's Encrypt (${letsEncryptError.message}), Cloudflare (${cloudflareError.message})`);
            }
          } else {
            throw new Error(`Let's Encrypt SSL failed: ${letsEncryptError.message}`);
          }
        }
      } else {
        throw new Error('No SSL provider configured. Please configure Cloudflare or Let\'s Encrypt.');
      }
    } catch (error) {
      logger.error(`[SSLService] Error provisioning SSL for ${domain}:`, error);
      await CustomDomainModel.updateSSLStatus(domainId, 'failed', null);
      throw error;
    }
  }

  /**
   * Provision SSL using Cloudflare
   * Prefers Origin Certificate (scalable) over Universal SSL (per-domain)
   */
  static async provisionCloudflareSSL(domainId, domain) {
    try {
      logger.info(`[SSLService] Provisioning SSL via Cloudflare for ${domain}`);

      // Prefer Origin Certificate (unlimited, scalable) if configured
      const useOriginCertificate = process.env.CLOUDFLARE_USE_ORIGIN_CERT !== 'false';
      
      if (useOriginCertificate) {
        try {
          const originCertConfigured = await cloudflareService.isOriginCertificateConfigured();
          
          if (originCertConfigured) {
            logger.info(`[SSLService] Using Cloudflare Origin Certificate for ${domain}`);
            const originResult = await cloudflareService.provisionOriginCertificate(domain);
            
            // Update Nginx config with Origin Certificate paths
            if (nginxService.isNginxAvailable()) {
              try {
                await nginxService.generateNginxConfig(
                  domain,
                  originResult.certPath,
                  originResult.keyPath
                );
                await nginxService.reloadNginx();
              } catch (nginxError) {
                logger.warn(`[SSLService] Nginx config update failed (non-critical): ${nginxError.message}`);
              }
            }

            await CustomDomainModel.updateSSLStatus(domainId, 'active', 'cloudflare', null, originResult.certPath, originResult.keyPath);
            logger.info(`[SSLService] SSL provisioned successfully for ${domain} via Cloudflare Origin Certificate`);
            return { 
              success: true, 
              provider: 'cloudflare', 
              type: 'origin_certificate',
              status: 'active',
              sslMode: originResult.sslMode,
              certPath: originResult.certPath,
              keyPath: originResult.keyPath,
            };
          }
        } catch (originError) {
          logger.warn(`[SSLService] Origin Certificate not available: ${originError.message}`);
          logger.info(`[SSLService] Falling back to Cloudflare Universal SSL for ${domain}`);
        }
      }

      // Fallback to Universal SSL (per-domain, automatic)
      logger.info(`[SSLService] Using Cloudflare Universal SSL for ${domain}`);
      const sslResult = await cloudflareService.enableSSL(domain);
      
      if (sslResult.success) {
        // Update Nginx config (if Nginx management is enabled)
        // For Universal SSL, Nginx can use HTTP (Flexible mode) or Origin Certificate (Full/Strict mode)
        if (nginxService.isNginxAvailable()) {
          try {
            // Check if Origin Certificate is available for Full/Strict mode
            const originCertConfigured = await cloudflareService.isOriginCertificateConfigured();
            
            if (originCertConfigured && (sslResult.sslMode === 'full' || sslResult.sslMode === 'strict')) {
              // Use Origin Certificate for Full/Strict mode
              const originCertPath = process.env.CLOUDFLARE_ORIGIN_CERT_PATH || '/etc/ssl/smartstore/certs/cloudflare-origin.crt';
              const originKeyPath = process.env.CLOUDFLARE_ORIGIN_KEY_PATH || '/etc/ssl/smartstore/keys/cloudflare-origin.key';
              
              await nginxService.generateNginxConfig(domain, originCertPath, originKeyPath);
            } else {
              // Use HTTP for Flexible mode (Cloudflare handles SSL)
              await nginxService.generateNginxConfig(domain, null, null);
            }
            
            await nginxService.reloadNginx();
          } catch (nginxError) {
            logger.warn(`[SSLService] Nginx config update failed (non-critical): ${nginxError.message}`);
          }
        }

        await CustomDomainModel.updateSSLStatus(domainId, 'active', 'cloudflare');
        logger.info(`[SSLService] SSL provisioned successfully for ${domain} via Cloudflare Universal SSL`);
        return { 
          success: true, 
          provider: 'cloudflare', 
          type: 'universal_ssl',
          status: 'active',
          sslMode: sslResult.sslMode,
        };
      } else {
        throw new Error('Cloudflare SSL enablement failed');
      }
    } catch (error) {
      logger.error(`[SSLService] Cloudflare SSL provisioning failed for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Provision SSL using Let's Encrypt
   */
  static async provisionLetsEncryptSSL(domainId, domain) {
    try {
      logger.info(`[SSLService] Provisioning SSL via Let's Encrypt for ${domain}`);

      // Provision certificate using certbot
      const certResult = await letsEncryptService.provisionCertificate(domain);
      
      if (certResult.success && certResult.certPath && certResult.keyPath) {
        // Update Nginx configuration with certificate paths
        if (nginxService.isNginxAvailable()) {
          try {
            await nginxService.updateSSLConfig(domain, certResult.certPath, certResult.keyPath);
            await nginxService.reloadNginx();
          } catch (nginxError) {
            logger.error(`[SSLService] Nginx config update failed: ${nginxError.message}`);
            throw new Error(`SSL certificate provisioned but Nginx configuration failed: ${nginxError.message}`);
          }
        }

        await CustomDomainModel.updateSSLStatus(domainId, 'active', 'letsencrypt');
        logger.info(`[SSLService] SSL provisioned successfully for ${domain} via Let's Encrypt`);
        return { 
          success: true, 
          provider: 'letsencrypt', 
          status: 'active',
          certPath: certResult.certPath,
          keyPath: certResult.keyPath,
        };
      } else {
        throw new Error('Let\'s Encrypt certificate provisioning failed');
      }
    } catch (error) {
      logger.error(`[SSLService] Let's Encrypt SSL provisioning failed for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Check Cloudflare SSL status
   */
  static async checkCloudflareSSL(domain) {
    try {
      if (!cloudflareService.isConfigured()) {
        return { active: false, provider: 'cloudflare', configured: false };
      }

      const status = await cloudflareService.checkSSLStatus(domain);
      return {
        active: status.active,
        provider: 'cloudflare',
        configured: status.configured,
        sslMode: status.sslMode,
        universalSSL: status.universalSSL,
      };
    } catch (error) {
      logger.error(`[SSLService] Error checking Cloudflare SSL for ${domain}:`, error);
      return { active: false, provider: 'cloudflare', error: error.message };
    }
  }


  /**
   * Check SSL certificate status
   */
  static async checkSSLStatus(domainId) {
    try {
      const customDomain = await CustomDomainModel.getCustomDomainById(domainId);
      if (!customDomain) {
        throw new Error('Custom domain not found');
      }

      const status = {
        ssl_status: customDomain.ssl_status,
        ssl_provider: customDomain.ssl_provider,
        domain: customDomain.domain,
        verified: customDomain.verified,
      };

      // Check actual certificate status
      if (status.ssl_status === 'active' && status.ssl_provider === 'cloudflare') {
        // Cloudflare SSL certificates are auto-renewed
        const cloudflareStatus = await this.checkCloudflareSSL(customDomain.domain);
        status.expires_at = null; // Cloudflare handles renewal
        status.auto_renew = true;
        status.sslMode = cloudflareStatus.sslMode;
        status.universalSSL = cloudflareStatus.universalSSL;
      } else if (status.ssl_status === 'active' && status.ssl_provider === 'letsencrypt') {
        // Check Let's Encrypt certificate expiration
        const certInfo = await letsEncryptService.checkCertificate(customDomain.domain);
        if (certInfo.exists) {
          status.expires_at = certInfo.expiresAt;
          status.daysUntilExpiry = certInfo.daysUntilExpiry;
          status.auto_renew = true; // Certbot handles renewal
          status.certPath = certInfo.certPath;
          status.keyPath = certInfo.keyPath;
        }
      }

      return status;
    } catch (error) {
      logger.error(`[SSLService] Error checking SSL status for domain ${domainId}:`, error);
      throw error;
    }
  }

  /**
   * Renew SSL certificate (if applicable)
   */
  static async renewSSL(domainId, domain) {
    try {
      const customDomain = await CustomDomainModel.getCustomDomainById(domainId);
      if (!customDomain) {
        throw new Error('Custom domain not found');
      }

      if (customDomain.ssl_provider === 'cloudflare') {
        // Cloudflare SSL is auto-renewed, just verify it's still active
        const status = await this.checkCloudflareSSL(domain);
        if (!status.active) {
          // Re-enable SSL if it's not active
          await this.provisionCloudflareSSL(domainId, domain);
        }
        return { success: true, message: 'Cloudflare SSL is automatically renewed' };
      } else if (customDomain.ssl_provider === 'letsencrypt') {
        // Trigger Let's Encrypt renewal
        await CustomDomainModel.updateSSLStatus(domainId, 'provisioning', 'letsencrypt');
        
        const renewResult = await letsEncryptService.renewCertificate(domain);
        
        if (renewResult.success) {
          // Update Nginx config if needed
          if (nginxService.isNginxAvailable() && renewResult.certPath && renewResult.keyPath) {
            await nginxService.updateSSLConfig(domain, renewResult.certPath, renewResult.keyPath);
            await nginxService.reloadNginx();
          }
          
          await CustomDomainModel.updateSSLStatus(domainId, 'active', 'letsencrypt');
          return { success: true, message: 'SSL certificate renewed successfully' };
        } else {
          throw new Error('SSL renewal failed');
        }
      } else {
        throw new Error('SSL provider not configured');
      }
    } catch (error) {
      logger.error(`[SSLService] Error renewing SSL for domain ${domainId}:`, error);
      await CustomDomainModel.updateSSLStatus(domainId, 'failed', null);
      throw error;
    }
  }

  /**
   * Auto-provision SSL when domain is verified
   * Called automatically after domain verification succeeds
   */
  static async autoProvisionSSL(domainId, domain) {
    try {
      logger.info(`[SSLService] Auto-provisioning SSL for verified domain: ${domain}`);
      
      // Provision SSL certificate
      const result = await this.provisionSSL(domainId, domain);
      
      return result;
    } catch (error) {
      logger.error(`[SSLService] Auto-provisioning SSL failed for ${domain}:`, error);
      // Don't throw - SSL failure shouldn't block domain verification
      // Domain is still verified, SSL can be retried later
      return { success: false, error: error.message };
    }
  }
}

module.exports = SSLService;

