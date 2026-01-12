const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../../../shared/utils/logger');

const execAsync = promisify(exec);

class LetsEncryptService {
  constructor() {
    // Certbot paths and configuration
    this.certbotPath = process.env.CERTBOT_PATH || 'certbot';
    this.certbotEmail = process.env.CERTBOT_EMAIL || process.env.ADMIN_EMAIL || 'admin@smartstore.org';
    this.certDir = process.env.CERTBOT_CERT_DIR || '/etc/letsencrypt/live';
    this.webrootPath = process.env.CERTBOT_WEBROOT || '/var/www/html/.well-known/acme-challenge';
    this.useStandalone = process.env.CERTBOT_STANDALONE === 'true';
    this.useDNS = process.env.CERTBOT_DNS_CHALLENGE === 'true';
    this.dnsProvider = process.env.CERTBOT_DNS_PROVIDER || null; // 'cloudflare', 'route53', etc.
  }

  /**
   * Provision Let's Encrypt certificate for a domain
   */
  async provisionCertificate(domain) {
    try {
      logger.info(`[LetsEncryptService] Starting certificate provisioning for ${domain}`);

      // Check if certificate already exists
      const existingCert = await this.checkCertificate(domain);
      if (existingCert.exists) {
        logger.info(`[LetsEncryptService] Certificate already exists for ${domain}`);
        return {
          success: true,
          certPath: existingCert.certPath,
          keyPath: existingCert.keyPath,
          provider: 'letsencrypt',
        };
      }

      // Ensure webroot directory exists
      if (!this.useStandalone && !this.useDNS) {
        await fs.mkdir(this.webrootPath, { recursive: true });
      }

      // Build certbot command
      const certbotArgs = this.buildCertbotArgs(domain);
      const command = `${this.certbotPath} certonly --non-interactive --agree-tos --email ${this.certbotEmail} ${certbotArgs.join(' ')}`;

      logger.info(`[LetsEncryptService] Running certbot: ${command}`);

      // Execute certbot
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300000, // 5 minute timeout
      });

      if (stderr && !stderr.includes('Successfully received certificate')) {
        // Check if it's just a warning
        if (!stderr.includes('IMPORTANT NOTES')) {
          throw new Error(stderr);
        }
      }

      // Get certificate paths
      const certPaths = await this.getCertificatePaths(domain);

      logger.info(`[LetsEncryptService] Certificate provisioned successfully for ${domain}`);
      return {
        success: true,
        certPath: certPaths.certPath,
        keyPath: certPaths.keyPath,
        provider: 'letsencrypt',
      };
    } catch (error) {
      logger.error(`[LetsEncryptService] Error provisioning certificate for ${domain}:`, error);
      throw new Error(`Failed to provision Let's Encrypt certificate: ${error.message}`);
    }
  }

  /**
   * Build certbot command arguments based on configuration
   */
  buildCertbotArgs(domain) {
    const args = [
      '--domains', domain,
      '--keep-until-expiring',
    ];

    if (this.useDNS) {
      // DNS challenge (requires DNS plugin)
      if (this.dnsProvider === 'cloudflare') {
        args.push('--dns-cloudflare');
        if (process.env.CLOUDFLARE_API_TOKEN) {
          // Certbot will use CLOUDFLARE_API_TOKEN env var
        }
      } else if (this.dnsProvider === 'route53') {
        args.push('--dns-route53');
      } else {
        throw new Error('DNS challenge requires DNS provider to be configured');
      }
    } else if (this.useStandalone) {
      // Standalone mode (certbot binds to port 80)
      args.push('--standalone');
      args.push('--preferred-challenges', 'http');
    } else {
      // Webroot mode (requires web server to serve challenges)
      args.push('--webroot');
      args.push('--webroot-path', this.webrootPath);
    }

    // Add test mode if in development
    if (process.env.NODE_ENV !== 'production' && process.env.CERTBOT_TEST_MODE === 'true') {
      args.push('--test-cert');
      logger.warn('[LetsEncryptService] Using Let\'s Encrypt staging environment (test mode)');
    }

    return args;
  }

  /**
   * Get certificate file paths for a domain
   */
  async getCertificatePaths(domain) {
    const certDir = path.join(this.certDir, domain);
    const certPath = path.join(certDir, 'fullchain.pem');
    const keyPath = path.join(certDir, 'privkey.pem');

    // Check if files exist
    try {
      await fs.access(certPath);
      await fs.access(keyPath);
      return { certPath, keyPath, exists: true };
    } catch (error) {
      return { certPath, keyPath, exists: false };
    }
  }

  /**
   * Check if certificate exists and is valid
   */
  async checkCertificate(domain) {
    try {
      const paths = await this.getCertificatePaths(domain);
      
      if (!paths.exists) {
        return { exists: false };
      }

      // Check certificate expiration
      const { stdout } = await execAsync(
        `openssl x509 -in ${paths.certPath} -noout -enddate 2>/dev/null || echo "invalid"`
      );

      if (stdout.includes('invalid')) {
        return { exists: false };
      }

      // Parse expiration date
      const expirationMatch = stdout.match(/notAfter=(.+)/);
      const expirationDate = expirationMatch ? new Date(expirationMatch[1]) : null;
      const daysUntilExpiry = expirationDate ? Math.floor((expirationDate - new Date()) / (1000 * 60 * 60 * 24)) : null;

      return {
        exists: true,
        certPath: paths.certPath,
        keyPath: paths.keyPath,
        expiresAt: expirationDate,
        daysUntilExpiry,
        isValid: daysUntilExpiry > 0,
      };
    } catch (error) {
      logger.error(`[LetsEncryptService] Error checking certificate for ${domain}:`, error);
      return { exists: false };
    }
  }

  /**
   * Renew certificate for a domain
   */
  async renewCertificate(domain) {
    try {
      logger.info(`[LetsEncryptService] Renewing certificate for ${domain}`);

      // Build renewal command
      const args = ['renew', '--cert-name', domain, '--non-interactive'];
      
      if (process.env.NODE_ENV !== 'production' && process.env.CERTBOT_TEST_MODE === 'true') {
        args.push('--test-cert');
      }

      const command = `${this.certbotPath} ${args.join(' ')}`;
      
      logger.info(`[LetsEncryptService] Running certbot renewal: ${command}`);
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300000, // 5 minute timeout
      });

      // Check if renewal was successful
      if (stderr && !stderr.includes('Congratulations') && !stderr.includes('No renewals were attempted')) {
        // Check if it's just informational
        if (!stderr.includes('Keeping the existing certificate')) {
          throw new Error(stderr);
        }
      }

      // Get updated certificate paths
      const certPaths = await this.getCertificatePaths(domain);

      logger.info(`[LetsEncryptService] Certificate renewal completed for ${domain}`);
      return {
        success: true,
        certPath: certPaths.certPath,
        keyPath: certPaths.keyPath,
        provider: 'letsencrypt',
      };
    } catch (error) {
      logger.error(`[LetsEncryptService] Error renewing certificate for ${domain}:`, error);
      throw new Error(`Failed to renew Let's Encrypt certificate: ${error.message}`);
    }
  }

  /**
   * Renew all certificates (for cron job)
   */
  async renewAllCertificates() {
    try {
      logger.info('[LetsEncryptService] Starting renewal of all certificates');

      const command = `${this.certbotPath} renew --non-interactive --quiet`;
      
      if (process.env.NODE_ENV !== 'production' && process.env.CERTBOT_TEST_MODE === 'true') {
        const testCommand = `${command} --test-cert`;
        await execAsync(testCommand, { timeout: 600000 });
      } else {
        await execAsync(command, { timeout: 600000 });
      }

      logger.info('[LetsEncryptService] Certificate renewal completed');
      return { success: true };
    } catch (error) {
      logger.error('[LetsEncryptService] Error renewing certificates:', error);
      throw error;
    }
  }
}

// Export singleton instance
const letsEncryptService = new LetsEncryptService();
module.exports = letsEncryptService;

