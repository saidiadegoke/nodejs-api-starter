const dns = require('dns').promises;
const crypto = require('crypto');
const { logger } = require('../../../shared/utils/logger');

class DNSVerificationService {
  /**
   * Generate verification token for domain
   */
  static generateVerificationToken() {
    const randomBytes = crypto.randomBytes(16).toString('hex');
    return `smartstore-verify=${randomBytes}`;
  }

  /**
   * Verify DNS TXT record for domain ownership
   */
  static async verifyDNSRecord(domain, expectedToken) {
    try {
      // Normalize domain
      const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').trim();
      
      // Check for TXT record at _smartstore-verification.{domain}
      const verificationDomain = `_smartstore-verification.${normalizedDomain}`;
      
      try {
        const txtRecords = await dns.resolveTxt(verificationDomain);
        
        // Flatten array of arrays (DNS TXT records can be arrays)
        const flatRecords = txtRecords.flat().map(record => 
          typeof record === 'string' ? record : record.join('')
        );
        
        // Check if any record matches the expected token
        const found = flatRecords.some(record => {
          // Handle both formats: "smartstore-verify=abc123" and "smartstore-verify=abc123 " (with space)
          const trimmed = record.trim();
          return trimmed === expectedToken || trimmed.startsWith(expectedToken);
        });
        
        return found;
      } catch (dnsError) {
        // DNS lookup failed - record doesn't exist or domain not found
        if (dnsError.code === 'ENOTFOUND' || dnsError.code === 'ENODATA') {
          return false;
        }
        throw dnsError;
      }
    } catch (error) {
      logger.error('Error verifying DNS record:', error);
      throw error;
    }
  }

  /**
   * Verify domain ownership with retry logic
   */
  static async verifyDomainOwnership(domain, expectedToken, maxRetries = 3, delayMs = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const verified = await this.verifyDNSRecord(domain, expectedToken);
        
        if (verified) {
          return true;
        }
        
        // If not verified and not the last attempt, wait before retrying
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        // If it's the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }
        // Otherwise wait and retry
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return false;
  }

  /**
   * Check if domain (or www.domain) CNAME points to the expected target (e.g. siteSlug.smartstore.ng).
   */
  static async verifyCnamePointsToTarget(domain, expectedTarget) {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').trim();
    const expectedLower = expectedTarget.toLowerCase().trim();
    const hostsToCheck = [`www.${normalizedDomain}`, normalizedDomain];

    for (const host of hostsToCheck) {
      try {
        const cnameRecords = await dns.resolveCname(host);
        const raw = Array.isArray(cnameRecords) ? cnameRecords[0] : cnameRecords;
        const cname = raw ? raw.toLowerCase().replace(/\.$/, '') : '';
        if (cname && (cname === expectedLower || cname.endsWith('.' + expectedLower))) {
          return true;
        }
      } catch (err) {
        if (err.code !== 'ENOTFOUND' && err.code !== 'ENODATA') {
          logger.warn('[DNSVerification] CNAME check failed for', host, err.message);
        }
      }
    }
    return false;
  }

  /**
   * Get DNS verification instructions
   */
  static getVerificationInstructions(domain, token) {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').trim();
    
    return {
      type: 'TXT',
      name: `_smartstore-verification.${normalizedDomain}`,
      value: token,
      instructions: [
        `Add a TXT record to your DNS settings:`,
        `Name/Host: _smartstore-verification`,
        `Value: ${token}`,
        `TTL: 3600 (or default)`,
        ``,
        `Note: DNS changes can take up to 24-48 hours to propagate, but usually take effect within a few minutes.`
      ]
    };
  }
}

module.exports = DNSVerificationService;

