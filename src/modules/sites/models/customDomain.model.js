const pool = require('../../../db/pool');
const { logger } = require('../../../shared/utils/logger');

class CustomDomainModel {
  /**
   * Create a new custom domain record
   */
  static async createCustomDomain(siteId, domain, verificationToken) {
    try {
      // Normalize domain (remove www, lowercase, trim)
      const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').trim();

      const result = await pool.query(
        `INSERT INTO custom_domains (site_id, domain, verification_token, verified, ssl_status)
         VALUES ($1, $2, $3, false, 'pending')
         RETURNING *`,
        [siteId, normalizedDomain, verificationToken]
      );

      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('This domain is already in use');
      }
      logger.error('Error creating custom domain:', error);
      throw error;
    }
  }

  /**
   * Get custom domain by domain name
   */
  static async getCustomDomainByDomain(domain) {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').trim();
    
    const result = await pool.query(
      'SELECT * FROM custom_domains WHERE domain = $1',
      [normalizedDomain]
    );

    return result.rows[0] || null;
  }

  /**
   * Get custom domain by ID
   */
  static async getCustomDomainById(domainId) {
    const result = await pool.query(
      'SELECT * FROM custom_domains WHERE id = $1',
      [domainId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all custom domains for a site
   */
  static async getCustomDomainsBySite(siteId) {
    const result = await pool.query(
      'SELECT * FROM custom_domains WHERE site_id = $1 ORDER BY created_at DESC',
      [siteId]
    );

    return result.rows;
  }

  /**
   * Update verification status
   */
  static async updateVerificationStatus(domainId, verified) {
    const query = verified
      ? `UPDATE custom_domains 
         SET verified = $1, verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`
      : `UPDATE custom_domains 
         SET verified = $1, verified_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`;
    
    const result = await pool.query(query, [verified, domainId]);

    if (result.rows.length === 0) {
      throw new Error('Custom domain not found');
    }

    return result.rows[0];
  }

  /**
   * Update traffic (CNAME) verification status
   */
  static async updateTrafficVerified(domainId, trafficVerified) {
    const result = await pool.query(
      `UPDATE custom_domains 
       SET traffic_verified = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [!!trafficVerified, domainId]
    );
    if (result.rows.length === 0) {
      throw new Error('Custom domain not found');
    }
    return result.rows[0];
  }

  /**
   * Update SSL status
   */
  static async updateSSLStatus(domainId, sslStatus, sslProvider = null) {
    const result = await pool.query(
      `UPDATE custom_domains 
       SET ssl_status = $1, ssl_provider = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [sslStatus, sslProvider, domainId]
    );

    if (result.rows.length === 0) {
      throw new Error('Custom domain not found');
    }

    return result.rows[0];
  }

  /**
   * Delete custom domain
   */
  static async deleteCustomDomain(domainId) {
    const result = await pool.query(
      'DELETE FROM custom_domains WHERE id = $1 RETURNING *',
      [domainId]
    );

    if (result.rows.length === 0) {
      throw new Error('Custom domain not found');
    }

    return result.rows[0];
  }

  /**
   * Check if domain is available (not in use by another site)
   */
  static async isDomainAvailable(domain, excludeSiteId = null) {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').trim();
    
    let query = 'SELECT COUNT(*) as count FROM custom_domains WHERE domain = $1';
    let params = [normalizedDomain];

    if (excludeSiteId) {
      query += ' AND site_id != $2';
      params.push(excludeSiteId);
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count) === 0;
  }
}

module.exports = CustomDomainModel;

