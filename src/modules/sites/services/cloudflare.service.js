const { logger } = require('../../../shared/utils/logger');

class CloudflareService {
  constructor() {
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.apiKey = process.env.CLOUDFLARE_API_KEY;
    this.apiEmail = process.env.CLOUDFLARE_API_EMAIL;
    this.apiUrl = 'https://api.cloudflare.com/client/v4';
    
    // Determine authentication method
    this.authMethod = this.apiToken ? 'token' : this.apiKey && this.apiEmail ? 'key' : null;
  }

  /**
   * Get authentication headers for Cloudflare API
   */
  getAuthHeaders() {
    if (this.authMethod === 'token') {
      return {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      };
    } else if (this.authMethod === 'key') {
      return {
        'X-Auth-Email': this.apiEmail,
        'X-Auth-Key': this.apiKey,
        'Content-Type': 'application/json',
      };
    } else {
      throw new Error('Cloudflare API credentials not configured. Set CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY and CLOUDFLARE_API_EMAIL');
    }
  }

  /**
   * Check if Cloudflare is configured
   */
  isConfigured() {
    return this.authMethod !== null;
  }

  /**
   * Find zone ID for a domain
   */
  async findZoneId(domain) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Cloudflare API not configured');
      }

      // Extract root domain (e.g., example.com from www.example.com)
      const rootDomain = this.extractRootDomain(domain);
      
      const response = await fetch(`${this.apiUrl}/zones?name=${rootDomain}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Cloudflare API error: ${data.errors?.map(e => e.message).join(', ') || 'Unknown error'}`);
      }

      if (!data.result || data.result.length === 0) {
        throw new Error(`Zone not found for domain: ${rootDomain}`);
      }

      const zone = data.result[0];
      logger.info(`[CloudflareService] Found zone ${zone.id} for domain ${rootDomain}`);
      
      return {
        zoneId: zone.id,
        zoneName: zone.name,
        status: zone.status,
      };
    } catch (error) {
      logger.error(`[CloudflareService] Error finding zone for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Check SSL/TLS settings for a zone
   */
  async getSSLSettings(domain) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Cloudflare API not configured');
      }

      const { zoneId } = await this.findZoneId(domain);
      
      // Get SSL/TLS settings
      const sslResponse = await fetch(`${this.apiUrl}/zones/${zoneId}/settings/ssl`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!sslResponse.ok) {
        throw new Error(`Cloudflare API error: ${sslResponse.status}`);
      }

      const sslData = await sslResponse.json();
      
      if (!sslData.success) {
        throw new Error(`Cloudflare API error: ${sslData.errors?.map(e => e.message).join(', ')}`);
      }

      // Get Universal SSL status
      const universalSSLResponse = await fetch(`${this.apiUrl}/zones/${zoneId}/ssl/universal/settings`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      let universalSSL = null;
      if (universalSSLResponse.ok) {
        const universalSSLData = await universalSSLResponse.json();
        if (universalSSLData.success) {
          universalSSL = universalSSLData.result;
        }
      }

      return {
        sslMode: sslData.result.value, // 'off', 'flexible', 'full', 'strict'
        universalSSL: universalSSL?.enabled || false,
        universalSSLStatus: universalSSL?.status || null, // 'active', 'pending', etc.
      };
    } catch (error) {
      logger.error(`[CloudflareService] Error getting SSL settings for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Check if domain is proxied through Cloudflare (orange cloud)
   */
  async isDomainProxied(domain) {
    try {
      if (!this.isConfigured()) {
        return false;
      }

      const { zoneId } = await this.findZoneId(domain);
      
      // Get DNS records for the domain
      const dnsResponse = await fetch(`${this.apiUrl}/zones/${zoneId}/dns_records?name=${domain}&type=A`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!dnsResponse.ok) {
        return false;
      }

      const dnsData = await dnsResponse.json();
      
      if (!dnsData.success || !dnsData.result || dnsData.result.length === 0) {
        return false;
      }

      // Check if any A record is proxied (orange cloud)
      const proxiedRecord = dnsData.result.find(record => record.proxied === true);
      return !!proxiedRecord;
    } catch (error) {
      logger.error(`[CloudflareService] Error checking if domain is proxied:`, error);
      return false;
    }
  }

  /**
   * Enable SSL/TLS for a domain (if using Cloudflare)
   */
  async enableSSL(domain) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Cloudflare API not configured');
      }

      const { zoneId } = await this.findZoneId(domain);
      
      // Check if domain is proxied
      const isProxied = await this.isDomainProxied(domain);
      
      if (!isProxied) {
        logger.warn(`[CloudflareService] Domain ${domain} is not proxied. SSL will be limited.`);
      }

      // Get current SSL settings
      const sslSettings = await this.getSSLSettings(domain);
      
      // If SSL is already enabled, return success
      if (sslSettings.sslMode === 'full' || sslSettings.sslMode === 'strict') {
        logger.info(`[CloudflareService] SSL already enabled for ${domain}`);
        return {
          success: true,
          sslMode: sslSettings.sslMode,
          universalSSL: sslSettings.universalSSL,
          message: 'SSL is already enabled via Cloudflare',
        };
      }

      // Set SSL mode to 'full' (or 'strict' if preferred)
      const desiredMode = process.env.CLOUDFLARE_SSL_MODE || 'full';
      
      const response = await fetch(`${this.apiUrl}/zones/${zoneId}/settings/ssl`, {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ value: desiredMode }),
      });

      if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Cloudflare API error: ${data.errors?.map(e => e.message).join(', ')}`);
      }

      logger.info(`[CloudflareService] SSL enabled for ${domain} with mode: ${desiredMode}`);
      
      return {
        success: true,
        sslMode: data.result.value,
        universalSSL: true, // Cloudflare Universal SSL is automatic
        message: `SSL enabled with mode: ${desiredMode}`,
      };
    } catch (error) {
      logger.error(`[CloudflareService] Error enabling SSL for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Check SSL certificate status for a domain
   */
  async checkSSLStatus(domain) {
    try {
      if (!this.isConfigured()) {
        return {
          configured: false,
          active: false,
          message: 'Cloudflare API not configured',
        };
      }

      const sslSettings = await this.getSSLSettings(domain);
      const isProxied = await this.isDomainProxied(domain);
      
      const isActive = (sslSettings.sslMode === 'full' || sslSettings.sslMode === 'strict') && 
                       (sslSettings.universalSSL || isProxied);

      return {
        configured: true,
        active: isActive,
        sslMode: sslSettings.sslMode,
        universalSSL: sslSettings.universalSSL,
        universalSSLStatus: sslSettings.universalSSLStatus,
        isProxied,
        provider: 'cloudflare',
      };
    } catch (error) {
      logger.error(`[CloudflareService] Error checking SSL status for ${domain}:`, error);
      return {
        configured: false,
        active: false,
        error: error.message,
      };
    }
  }

  /**
   * Extract root domain from subdomain
   * e.g., www.example.com -> example.com
   */
  extractRootDomain(domain) {
    const parts = domain.split('.');
    if (parts.length <= 2) {
      return domain;
    }
    // Return last two parts
    return parts.slice(-2).join('.');
  }

  /**
   * Provision SSL using Cloudflare Origin Certificate
   * This is the recommended approach for scalability (unlimited certificates)
   * 
   * Note: Origin certificates must be manually created in Cloudflare dashboard
   * and installed on the Nginx server. This method verifies the certificate exists.
   * 
   * @param {string} domain - Domain to provision SSL for
   * @returns {Promise<Object>} SSL provisioning result
   */
  async provisionOriginCertificate(domain) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Cloudflare API not configured');
      }

      // Check if Origin Certificate is configured
      const originCertPath = process.env.CLOUDFLARE_ORIGIN_CERT_PATH || '/etc/ssl/smartstore/certs/cloudflare-origin.crt';
      const originKeyPath = process.env.CLOUDFLARE_ORIGIN_KEY_PATH || '/etc/ssl/smartstore/keys/cloudflare-origin.key';

      const fs = require('fs').promises;
      
      try {
        // Verify certificate files exist
        await fs.access(originCertPath);
        await fs.access(originKeyPath);
        
        logger.info(`[CloudflareService] Origin certificate found for ${domain}`);
        
        // Check if domain is proxied (required for Origin Certificate to work)
      const isProxied = await this.isDomainProxied(domain);
      
      if (!isProxied) {
        logger.warn(`[CloudflareService] Domain ${domain} is not proxied. Origin certificate requires Cloudflare proxy.`);
      }

        // Get SSL settings to ensure Full (Strict) mode
        const sslSettings = await this.getSSLSettings(domain);
        
        // Set SSL mode to 'full' (or 'strict') if not already set
        if (sslSettings.sslMode !== 'full' && sslSettings.sslMode !== 'strict') {
          const { zoneId } = await this.findZoneId(domain);
          const desiredMode = process.env.CLOUDFLARE_SSL_MODE || 'full';
          
          const response = await fetch(`${this.apiUrl}/zones/${zoneId}/settings/ssl`, {
            method: 'PATCH',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ value: desiredMode }),
          });

          if (!response.ok) {
            throw new Error(`Failed to set SSL mode: ${response.status}`);
          }

          const data = await response.json();
          if (!data.success) {
            throw new Error(`Failed to set SSL mode: ${data.errors?.map(e => e.message).join(', ')}`);
          }
        }

        return {
          success: true,
          provider: 'cloudflare',
          type: 'origin_certificate',
          certPath: originCertPath,
          keyPath: originKeyPath,
          sslMode: sslSettings.sslMode || 'full',
          message: 'Origin certificate verified and SSL enabled',
        };
      } catch (fileError) {
        // Certificate files don't exist - provide instructions
        throw new Error(
          `Cloudflare Origin Certificate not found. Please:\n` +
          `1. Go to Cloudflare Dashboard → SSL/TLS → Origin Server\n` +
          `2. Create Origin Certificate (wildcard: *.${this.extractRootDomain(domain)} or multi-domain)\n` +
          `3. Download certificate and key\n` +
          `4. Install to: ${originCertPath} and ${originKeyPath}\n` +
          `5. Set CLOUDFLARE_ORIGIN_CERT_PATH and CLOUDFLARE_ORIGIN_KEY_PATH if using custom paths`
        );
      }
    } catch (error) {
      logger.error(`[CloudflareService] Error provisioning Origin Certificate for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Check if Cloudflare Origin Certificate is configured
   * @returns {Promise<boolean>} True if certificate files exist
   */
  async isOriginCertificateConfigured() {
    try {
      const originCertPath = process.env.CLOUDFLARE_ORIGIN_CERT_PATH || '/etc/ssl/smartstore/certs/cloudflare-origin.crt';
      const originKeyPath = process.env.CLOUDFLARE_ORIGIN_KEY_PATH || '/etc/ssl/smartstore/keys/cloudflare-origin.key';

      const fs = require('fs').promises;
      
      await fs.access(originCertPath);
      await fs.access(originKeyPath);
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create Origin Certificate via Cloudflare API
   * Note: Cloudflare Origin Certificates are account-wide, not zone-specific
   * 
   * @param {string[]} hostnames - Array of hostnames (up to 50)
   * @param {Object} options - Certificate options
   * @returns {Promise<Object>} Certificate data including certificate and private key
   */
  async createOriginCertificate(hostnames, options = {}) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Cloudflare API not configured');
      }

      if (!hostnames || hostnames.length === 0) {
        throw new Error('At least one hostname is required');
      }

      if (hostnames.length > 50) {
        throw new Error('Maximum 50 hostnames per certificate');
      }

      // Cloudflare API endpoint for creating Origin Certificates
      // Note: This endpoint is for account-level certificates
      const response = await fetch(`${this.apiUrl}/certificates`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          type: 'origin',
          hosts: hostnames,
          validity_days: options.validityDays || 5475, // 15 years (default)
          key_type: options.keyType || 'rsa', // 'rsa' or 'ecdsa'
          key_length: options.keyLength || 2048, // For RSA: 2048 or 4096, For ECDSA: 256
          request_type: options.requestType || 'origin-ca', // 'origin-ca' for Origin Certificates
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Cloudflare API error: ${response.status} ${response.statusText}. ${errorData.errors?.map(e => e.message).join(', ') || ''}`
        );
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          `Cloudflare API error: ${data.errors?.map(e => e.message).join(', ') || 'Unknown error'}`
        );
      }

      const certificate = data.result;

      logger.info(`[CloudflareService] Origin Certificate created with ID: ${certificate.id}`);

      return {
        success: true,
        id: certificate.id,
        certificate: certificate.certificate, // The certificate PEM
        privateKey: certificate.private_key, // The private key PEM
        hostnames: certificate.hostnames,
        expiresOn: certificate.expires_on,
        requestType: certificate.request_type,
        validityDays: certificate.validity_days,
      };
    } catch (error) {
      logger.error(`[CloudflareService] Error creating Origin Certificate:`, error);
      throw error;
    }
  }

  /**
   * Get Origin Certificate by ID
   * 
   * @param {string} certificateId - Cloudflare certificate ID
   * @returns {Promise<Object>} Certificate data
   */
  async getOriginCertificate(certificateId) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Cloudflare API not configured');
      }

      const response = await fetch(`${this.apiUrl}/certificates/${certificateId}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          `Cloudflare API error: ${data.errors?.map(e => e.message).join(', ') || 'Unknown error'}`
        );
      }

      return data.result;
    } catch (error) {
      logger.error(`[CloudflareService] Error getting Origin Certificate ${certificateId}:`, error);
      throw error;
    }
  }

  /**
   * List all Origin Certificates for the account
   * 
   * @returns {Promise<Array>} Array of certificate objects
   */
  async listOriginCertificates() {
    try {
      if (!this.isConfigured()) {
        throw new Error('Cloudflare API not configured');
      }

      const response = await fetch(`${this.apiUrl}/certificates`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          `Cloudflare API error: ${data.errors?.map(e => e.message).join(', ') || 'Unknown error'}`
        );
      }

      // Filter for Origin Certificates only
      const originCertificates = data.result.filter(
        cert => cert.request_type === 'origin-ca'
      );

      return originCertificates;
    } catch (error) {
      logger.error(`[CloudflareService] Error listing Origin Certificates:`, error);
      throw error;
    }
  }

  /**
   * Revoke/Delete Origin Certificate
   * 
   * @param {string} certificateId - Cloudflare certificate ID
   * @returns {Promise<boolean>} Success status
   */
  async revokeOriginCertificate(certificateId) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Cloudflare API not configured');
      }

      const response = await fetch(`${this.apiUrl}/certificates/${certificateId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          `Cloudflare API error: ${data.errors?.map(e => e.message).join(', ') || 'Unknown error'}`
        );
      }

      logger.info(`[CloudflareService] Origin Certificate ${certificateId} revoked`);
      return true;
    } catch (error) {
      logger.error(`[CloudflareService] Error revoking Origin Certificate ${certificateId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
const cloudflareService = new CloudflareService();
module.exports = cloudflareService;

