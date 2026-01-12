const pool = require('../../../db/pool');
const cloudflareService = require('./cloudflare.service');
const nginxService = require('./nginx.service');
const { logger } = require('../../../shared/utils/logger');
const fs = require('fs').promises;
const path = require('path');

class CertificateManagerService {
  /**
   * Automatically assign a domain to an available certificate
   * Creates new certificate via Cloudflare API if none available
   */
  static async autoAssignDomain(customDomainId, domain) {
    try {
      logger.info(`[CertificateManager] Auto-assigning domain: ${domain}`);

      // 1. Check if domain already assigned
      const existing = await this.getCertificateForDomain(domain);
      if (existing) {
        logger.info(`[CertificateManager] Domain ${domain} already assigned to certificate ${existing.id}`);
        return existing;
      }

      // 2. Find available certificate (< 50 domains)
      let certificate = await this.findAvailableCertificate();

      // 3. If no available certificate, create new one via Cloudflare API
      if (!certificate) {
        logger.info(`[CertificateManager] No available certificate, creating new one via Cloudflare API`);
        
        // Create certificate with just this domain via Cloudflare API
        // Cloudflare allows up to 50 domains per certificate
        certificate = await this.createNewCertificateViaAPI([domain]);
        
        // Link the domain to the newly created certificate
        await this.addDomainToCertificate(certificate.id, customDomainId, domain);
        await this.updateCertificateDomainCount(certificate.id);
      } else {
        // 4. Add domain to existing certificate
        // IMPORTANT: Cloudflare doesn't support adding domains to existing certificates
        // We track it in our DB for reference, but the actual Cloudflare certificate
        // won't include this domain. This is a limitation we need to work around.
        // 
        // TODO: Consider creating a new certificate that includes all domains from
        // the existing certificate plus the new domain, then migrate domains.
        // For now, we'll track in DB and the certificate will work for domains
        // that were included when it was created.
        logger.warn(`[CertificateManager] Adding domain ${domain} to existing certificate ${certificate.id}, but Cloudflare certificate won't include it. Consider creating a new certificate.`);
        await this.addDomainToCertificate(certificate.id, customDomainId, domain);
        await this.updateCertificateDomainCount(certificate.id);
      }

      // 5. If certificate is now full, mark it
      const updatedCert = await this.getCertificateById(certificate.id);
      if (updatedCert.domains_count >= 50) {
        await this.markCertificateAsFull(certificate.id);
      }

      logger.info(`[CertificateManager] Domain ${domain} assigned to certificate ${certificate.id}`);
      return certificate;
    } catch (error) {
      logger.error(`[CertificateManager] Error auto-assigning domain ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Find available certificate with < 50 domains
   */
  static async findAvailableCertificate() {
    const result = await pool.query(
      `SELECT * FROM ssl_certificates 
       WHERE status = 'active' AND domains_count < max_domains 
       ORDER BY domains_count DESC 
       LIMIT 1`
    );
    return result.rows[0] || null;
  }

  /**
   * Create new certificate via Cloudflare API
   */
  static async createNewCertificateViaAPI(domains = []) {
    try {
      logger.info(`[CertificateManager] Creating new certificate via Cloudflare API${domains.length > 0 ? ` with ${domains.length} domains` : ''}`);

      let cloudflareCert = null;
      let certPath = null;
      let keyPath = null;
      let cloudflareCertId = null;

      // If domains provided, create certificate via Cloudflare API
      if (domains.length > 0) {
        if (domains.length > 50) {
          throw new Error('Cannot create certificate with more than 50 domains');
        }

        cloudflareCert = await cloudflareService.createOriginCertificate(domains, {
          validityDays: 5475, // 15 years
          keyType: 'rsa',
          keyLength: 2048,
        });

        if (!cloudflareCert.success) {
          throw new Error('Failed to create Cloudflare Origin Certificate');
        }

        // Save certificate files
        const timestamp = Date.now();
        certPath = `/etc/ssl/smartstore/certs/cert-${timestamp}.crt`;
        keyPath = `/etc/ssl/smartstore/keys/cert-${timestamp}.key`;
        
        // Ensure directories exist
        await fs.mkdir(path.dirname(certPath), { recursive: true });
        await fs.mkdir(path.dirname(keyPath), { recursive: true });
        
        await fs.writeFile(certPath, cloudflareCert.certificate);
        await fs.writeFile(keyPath, cloudflareCert.privateKey);
        
        await fs.chmod(certPath, 0o644);
        await fs.chmod(keyPath, 0o600);

        cloudflareCertId = cloudflareCert.id;
      } else {
        // Empty certificate placeholder - will use shared certificate path
        certPath = process.env.CLOUDFLARE_ORIGIN_CERT_PATH || '/etc/ssl/smartstore/certs/cloudflare-origin.crt';
        keyPath = process.env.CLOUDFLARE_ORIGIN_KEY_PATH || '/etc/ssl/smartstore/keys/cloudflare-origin.key';
      }

      const certificateName = `cert-${Date.now()}`;
      const result = await pool.query(
        `INSERT INTO ssl_certificates 
         (certificate_name, cloudflare_cert_id, cert_path, key_path, domains_count, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)
         RETURNING *`,
        [
          certificateName,
          cloudflareCertId,
          certPath,
          keyPath,
          domains.length,
          cloudflareCert?.expiresOn ? new Date(cloudflareCert.expiresOn) : null
        ]
      );

      const certificate = result.rows[0];
      logger.info(`[CertificateManager] Created certificate ${certificate.id}`);
      return certificate;
    } catch (error) {
      logger.error(`[CertificateManager] Error creating certificate:`, error);
      throw error;
    }
  }

  /**
   * Add domain to certificate (database only)
   * Note: Cloudflare doesn't support modifying existing certificates
   * So we track in DB and will batch recreate when needed
   */
  static async addDomainToCertificate(certificateId, customDomainId, domain) {
    await pool.query(
      `INSERT INTO ssl_certificate_domains (certificate_id, custom_domain_id, domain)
       VALUES ($1, $2, $3)
       ON CONFLICT (custom_domain_id) DO UPDATE
       SET certificate_id = $1, domain = $3`,
      [certificateId, customDomainId, domain]
    );

    // Update custom_domains table
    await pool.query(
      `UPDATE custom_domains SET certificate_id = $1 WHERE id = $2`,
      [certificateId, customDomainId]
    );
  }

  /**
   * Update certificate domain count
   */
  static async updateCertificateDomainCount(certificateId) {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM ssl_certificate_domains WHERE certificate_id = $1`,
      [certificateId]
    );
    const count = parseInt(result.rows[0].count);

    await pool.query(
      `UPDATE ssl_certificates SET domains_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [count, certificateId]
    );
  }

  /**
   * Mark certificate as full
   */
  static async markCertificateAsFull(certificateId) {
    await pool.query(
      `UPDATE ssl_certificates SET status = 'full', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [certificateId]
    );
  }

  /**
   * Get certificate for a domain
   */
  static async getCertificateForDomain(domain) {
    const result = await pool.query(
      `SELECT sc.* FROM ssl_certificates sc
       JOIN ssl_certificate_domains scd ON sc.id = scd.certificate_id
       WHERE scd.domain = $1`,
      [domain]
    );
    return result.rows[0] || null;
  }

  /**
   * Get certificate by ID
   */
  static async getCertificateById(certificateId) {
    const result = await pool.query(
      `SELECT * FROM ssl_certificates WHERE id = $1`,
      [certificateId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all certificates with domain counts
   */
  static async getAllCertificates() {
    const result = await pool.query(
      `SELECT 
        sc.*,
        COUNT(scd.id) as actual_domains_count,
        array_agg(scd.domain ORDER BY scd.assigned_at DESC) FILTER (WHERE scd.domain IS NOT NULL) as domains
       FROM ssl_certificates sc
       LEFT JOIN ssl_certificate_domains scd ON sc.id = scd.certificate_id
       GROUP BY sc.id
       ORDER BY sc.created_at DESC`
    );
    return result.rows;
  }

  /**
   * Get domains for a certificate
   */
  static async getCertificateDomains(certificateId) {
    const result = await pool.query(
      `SELECT scd.*, cd.site_id, cd.verified, cd.ssl_status
       FROM ssl_certificate_domains scd
       JOIN custom_domains cd ON scd.custom_domain_id = cd.id
       WHERE scd.certificate_id = $1
       ORDER BY scd.assigned_at DESC`,
      [certificateId]
    );
    return result.rows;
  }

  /**
   * Batch create certificate with multiple domains via Cloudflare API
   * More efficient than creating certificates one-by-one
   */
  static async batchCreateCertificate(domains) {
    try {
      if (domains.length > 50) {
        throw new Error('Cannot create certificate with more than 50 domains');
      }

      logger.info(`[CertificateManager] Batch creating certificate with ${domains.length} domains`);

      // 1. Create Cloudflare Origin Certificate via API
      const cloudflareCert = await cloudflareService.createOriginCertificate(domains, {
        validityDays: 5475, // 15 years
        keyType: 'rsa',
        keyLength: 2048,
      });

      if (!cloudflareCert.success) {
        throw new Error('Failed to create Cloudflare Origin Certificate');
      }

      // 2. Save certificate files
      const timestamp = Date.now();
      const certPath = `/etc/ssl/smartstore/certs/cert-${timestamp}.crt`;
      const keyPath = `/etc/ssl/smartstore/keys/cert-${timestamp}.key`;
      
      // Ensure directories exist
      await fs.mkdir(path.dirname(certPath), { recursive: true });
      await fs.mkdir(path.dirname(keyPath), { recursive: true });
      
      // Write certificate and key
      await fs.writeFile(certPath, cloudflareCert.certificate);
      await fs.writeFile(keyPath, cloudflareCert.privateKey);
      
      // Set permissions
      await fs.chmod(certPath, 0o644);
      await fs.chmod(keyPath, 0o600);

      // 3. Create database record
      const certificateName = `cert-batch-${timestamp}`;
      const result = await pool.query(
        `INSERT INTO ssl_certificates 
         (certificate_name, cloudflare_cert_id, cert_path, key_path, domains_count, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)
         RETURNING *`,
        [
          certificateName,
          cloudflareCert.id,
          certPath,
          keyPath,
          domains.length,
          cloudflareCert.expiresOn ? new Date(cloudflareCert.expiresOn) : null
        ]
      );

      const certificate = result.rows[0];

      // 4. Link all domains to certificate
      for (const domain of domains) {
        const customDomain = await pool.query(
          `SELECT id FROM custom_domains WHERE domain = $1`,
          [domain]
        );
        
        if (customDomain.rows[0]) {
          await this.addDomainToCertificate(
            certificate.id,
            customDomain.rows[0].id,
            domain
          );
        }
      }

      // Update domain count
      await this.updateCertificateDomainCount(certificate.id);

      // Mark as full if needed
      if (domains.length >= 50) {
        await this.markCertificateAsFull(certificate.id);
      }

      logger.info(`[CertificateManager] Batch certificate created: ${certificate.id} with ${domains.length} domains`);
      return certificate;
    } catch (error) {
      logger.error(`[CertificateManager] Error batch creating certificate:`, error);
      throw error;
    }
  }

  /**
   * Remove domain from certificate
   */
  static async removeDomainFromCertificate(certificateId, customDomainId) {
    await pool.query(
      `DELETE FROM ssl_certificate_domains 
       WHERE certificate_id = $1 AND custom_domain_id = $2`,
      [certificateId, customDomainId]
    );

    // Update custom_domains table
    await pool.query(
      `UPDATE custom_domains SET certificate_id = NULL WHERE id = $1`,
      [customDomainId]
    );

    // Update certificate domain count
    await this.updateCertificateDomainCount(certificateId);

    // If certificate is no longer full, mark as active
    const cert = await this.getCertificateById(certificateId);
    if (cert && cert.status === 'full' && cert.domains_count < 50) {
      await pool.query(
        `UPDATE ssl_certificates SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [certificateId]
      );
    }
  }

  /**
   * Delete certificate
   */
  static async deleteCertificate(certificateId) {
    const certificate = await this.getCertificateById(certificateId);
    if (!certificate) {
      throw new Error('Certificate not found');
    }

    // Revoke from Cloudflare if it has a Cloudflare ID
    if (certificate.cloudflare_cert_id) {
      try {
        await cloudflareService.revokeOriginCertificate(certificate.cloudflare_cert_id);
      } catch (error) {
        logger.warn(`[CertificateManager] Failed to revoke Cloudflare certificate: ${error.message}`);
      }
    }

    // Delete certificate files (optional - might want to keep for backup)
    // await fs.unlink(certificate.cert_path).catch(() => {});
    // await fs.unlink(certificate.key_path).catch(() => {});

    // Delete from database (cascade will delete domain mappings)
    await pool.query(
      `DELETE FROM ssl_certificates WHERE id = $1`,
      [certificateId]
    );

    logger.info(`[CertificateManager] Certificate ${certificateId} deleted`);
    return true;
  }

  /**
   * Get or create base origin certificate for smartstore.ng and *.smartstore.ng
   * This is a special certificate for the platform's own domains
   */
  static async getBaseOriginCertificate() {
    try {
      // Check if base certificate already exists
      const result = await pool.query(
        `SELECT sc.* FROM ssl_certificates sc
         JOIN ssl_certificate_domains scd ON sc.id = scd.certificate_id
         WHERE scd.domain IN ('smartstore.ng', '*.smartstore.ng')
         AND sc.certificate_type = 'wildcard'
         LIMIT 1`
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      return null;
    } catch (error) {
      logger.error(`[CertificateManager] Error getting base origin certificate:`, error);
      throw error;
    }
  }

  /**
   * Create base origin certificate for smartstore.ng and *.smartstore.ng
   */
  static async createBaseOriginCertificate() {
    try {
      // Check if it already exists
      const existing = await this.getBaseOriginCertificate();
      if (existing) {
        logger.info(`[CertificateManager] Base origin certificate already exists: ${existing.id}`);
        return existing;
      }

      logger.info(`[CertificateManager] Creating base origin certificate for smartstore.ng and *.smartstore.ng`);

      // Create certificate via Cloudflare API with both domains
      const domains = ['smartstore.ng', '*.smartstore.ng'];
      const cloudflareCert = await cloudflareService.createOriginCertificate(domains, {
        validityDays: 5475, // 15 years
        keyType: 'rsa',
        keyLength: 2048,
      });

      if (!cloudflareCert.success) {
        throw new Error('Failed to create Cloudflare Origin Certificate');
      }

      // Save certificate files
      const certPath = process.env.CLOUDFLARE_ORIGIN_CERT_PATH || '/etc/ssl/smartstore/certs/cloudflare-origin.crt';
      const keyPath = process.env.CLOUDFLARE_ORIGIN_KEY_PATH || '/etc/ssl/smartstore/keys/cloudflare-origin.key';
      
      // Ensure directories exist
      await fs.mkdir(path.dirname(certPath), { recursive: true });
      await fs.mkdir(path.dirname(keyPath), { recursive: true });
      
      // Write certificate and key
      await fs.writeFile(certPath, cloudflareCert.certificate);
      await fs.writeFile(keyPath, cloudflareCert.privateKey);
      
      // Set permissions
      await fs.chmod(certPath, 0o644);
      await fs.chmod(keyPath, 0o600);

      // Create database record
      const certificateName = 'smartstore-base-origin-cert';
      const result = await pool.query(
        `INSERT INTO ssl_certificates 
         (certificate_name, cloudflare_cert_id, cert_path, key_path, domains_count, status, certificate_type, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'active', 'wildcard', $6)
         RETURNING *`,
        [
          certificateName,
          cloudflareCert.id,
          certPath,
          keyPath,
          domains.length,
          cloudflareCert.expiresOn ? new Date(cloudflareCert.expiresOn) : null
        ]
      );

      const certificate = result.rows[0];

      // Link domains to certificate
      // Note: For base domains, we don't have a custom_domain_id, so we use NULL
      // We need to handle the unique constraint on custom_domain_id
      for (const domain of domains) {
        // First, try to insert with NULL custom_domain_id
        // If domain already exists, update it
        await pool.query(
          `INSERT INTO ssl_certificate_domains (certificate_id, custom_domain_id, domain)
           VALUES ($1, NULL, $2)
           ON CONFLICT (domain) DO UPDATE SET certificate_id = $1`,
          [certificate.id, domain]
        );
      }

      // Update domain count
      await this.updateCertificateDomainCount(certificate.id);

      logger.info(`[CertificateManager] Base origin certificate created: ${certificate.id}`);
      return certificate;
    } catch (error) {
      logger.error(`[CertificateManager] Error creating base origin certificate:`, error);
      throw error;
    }
  }
}

module.exports = CertificateManagerService;

