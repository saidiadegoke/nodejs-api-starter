# Automatic Certificate Management System

This document outlines the implementation of an automatic certificate management system for scaling to thousands of custom domains using Cloudflare Origin Certificates.

## Problem Statement

- Each Cloudflare Origin Certificate can cover up to 50 domains
- Need to support thousands of custom domains
- Manual certificate management doesn't scale
- Need automatic assignment of domains to certificates
- Need dashboard interface for monitoring and management

## Solution Architecture

### 1. Database Schema

#### Certificate Registry Table

```sql
-- Track all SSL certificates
CREATE TABLE IF NOT EXISTS ssl_certificates (
  id SERIAL PRIMARY KEY,
  certificate_name VARCHAR(255) NOT NULL,
  cloudflare_cert_id VARCHAR(255), -- Cloudflare certificate ID
  cert_path VARCHAR(500) NOT NULL,
  key_path VARCHAR(500) NOT NULL,
  domains_count INTEGER DEFAULT 0,
  max_domains INTEGER DEFAULT 50,
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'full', 'expired', 'archived'
  certificate_type VARCHAR(50) DEFAULT 'multi_domain', -- 'wildcard', 'multi_domain'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  notes TEXT
);

CREATE INDEX idx_ssl_certificates_status ON ssl_certificates(status);
CREATE INDEX idx_ssl_certificates_domains_count ON ssl_certificates(domains_count);
```

#### Certificate-Domain Mapping Table

```sql
-- Map domains to certificates
CREATE TABLE IF NOT EXISTS ssl_certificate_domains (
  id SERIAL PRIMARY KEY,
  certificate_id INTEGER NOT NULL REFERENCES ssl_certificates(id) ON DELETE CASCADE,
  custom_domain_id INTEGER NOT NULL REFERENCES custom_domains(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(custom_domain_id),
  UNIQUE(domain)
);

CREATE INDEX idx_ssl_cert_domains_cert_id ON ssl_certificate_domains(certificate_id);
CREATE INDEX idx_ssl_cert_domains_domain ON ssl_certificate_domains(domain);
CREATE INDEX idx_ssl_cert_domains_custom_domain_id ON ssl_certificate_domains(custom_domain_id);
```

#### Update Custom Domains Table

```sql
-- Add certificate_id to custom_domains table
ALTER TABLE custom_domains 
ADD COLUMN IF NOT EXISTS certificate_id INTEGER REFERENCES ssl_certificates(id);

CREATE INDEX idx_custom_domains_certificate_id ON custom_domains(certificate_id);
```

### 2. Certificate Manager Service

**File**: `smartstore-api/src/modules/sites/services/certificateManager.service.js`

```javascript
const pool = require('../../../db/pool');
const cloudflareService = require('./cloudflare.service');
const nginxService = require('./nginx.service');
const { logger } = require('../../../shared/utils/logger');
const fs = require('fs').promises;
const path = require('path');

class CertificateManagerService {
  /**
   * Automatically assign a domain to an available certificate
   * Creates new certificate if none available
   */
  static async autoAssignDomain(customDomainId, domain) {
    try {
      logger.info(`[CertificateManager] Auto-assigning domain: ${domain}`);

      // 1. Check if domain already assigned
      const existing = await this.getCertificateForDomain(domain);
      if (existing) {
        logger.info(`[CertificateManager] Domain ${domain} already assigned to certificate ${existing.certificate_id}`);
        return existing;
      }

      // 2. Find available certificate (< 50 domains)
      let certificate = await this.findAvailableCertificate();

      // 3. If no available certificate, create new one
      if (!certificate) {
        logger.info(`[CertificateManager] No available certificate, creating new one`);
        certificate = await this.createNewCertificate();
      }

      // 4. Add domain to certificate
      await this.addDomainToCertificate(certificate.id, customDomainId, domain);

      // 5. Update certificate domain count
      await this.updateCertificateDomainCount(certificate.id);

      // 6. If certificate is now full, mark it
      const updatedCert = await this.getCertificateById(certificate.id);
      if (updatedCert.domains_count >= 50) {
        await this.markCertificateAsFull(certificate.id);
      }

      // 7. Update Cloudflare certificate if needed
      await this.updateCloudflareCertificate(certificate.id);

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
   * Creates an empty certificate that will be populated with domains later
   * Or can be used to batch create when you have domains ready
   */
  static async createNewCertificate(initialDomains = []) {
    try {
      logger.info(`[CertificateManager] Creating new certificate${initialDomains.length > 0 ? ` with ${initialDomains.length} domains` : ''}`);

      let cloudflareCert = null;
      let certPath = null;
      let keyPath = null;
      let cloudflareCertId = null;

      // If initial domains provided, create certificate via Cloudflare API
      if (initialDomains.length > 0) {
        if (initialDomains.length > 50) {
          throw new Error('Cannot create certificate with more than 50 domains');
        }

        cloudflareCert = await cloudflareService.createOriginCertificate(initialDomains, {
          validityDays: 5475, // 15 years
          keyType: 'rsa',
          keyLength: 2048,
        });

        if (!cloudflareCert.success) {
          throw new Error('Failed to create Cloudflare Origin Certificate');
        }

        // Save certificate files
        certPath = `/etc/ssl/smartstore/certs/cert-${Date.now()}.crt`;
        keyPath = `/etc/ssl/smartstore/keys/cert-${Date.now()}.key`;
        
        await fs.mkdir(path.dirname(certPath), { recursive: true });
        await fs.mkdir(path.dirname(keyPath), { recursive: true });
        
        await fs.writeFile(certPath, cloudflareCert.certificate);
        await fs.writeFile(keyPath, cloudflareCert.privateKey);
        
        await fs.chmod(certPath, 0o644);
        await fs.chmod(keyPath, 0o600);

        cloudflareCertId = cloudflareCert.id;
      } else {
        // Empty certificate - will use shared certificate path
        // Domains will be added later, or certificate will be created when domains are ready
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
          initialDomains.length,
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
   * Add domain to certificate
   */
  static async addDomainToCertificate(certificateId, customDomainId, domain) {
    await pool.query(
      `INSERT INTO ssl_certificate_domains (certificate_id, custom_domain_id, domain)
       VALUES ($1, $2, $3)
       ON CONFLICT (custom_domain_id) DO NOTHING`,
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
        array_agg(scd.domain) as domains
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
   * Update Cloudflare certificate with new domains
   * This would call Cloudflare API to add domains to existing certificate
   * Note: Cloudflare doesn't support adding domains to existing certificates
   * So we need to create new certificate with all domains when updating
   */
  static async updateCloudflareCertificate(certificateId) {
    // This is a placeholder - actual implementation would:
    // 1. Get all domains for certificate
    // 2. Create new Cloudflare certificate with all domains
    // 3. Download and install new certificate
    // 4. Update certificate paths in database
    // Note: This is complex because Cloudflare doesn't support modifying existing certificates
    // Alternative: Batch create certificates when you have 50 domains ready
    logger.info(`[CertificateManager] Certificate ${certificateId} updated (placeholder)`);
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
      const certPath = `/etc/ssl/smartstore/certs/cert-${Date.now()}.crt`;
      const keyPath = `/etc/ssl/smartstore/keys/cert-${Date.now()}.key`;
      
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
      const certificateName = `cert-batch-${Date.now()}`;
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

      logger.info(`[CertificateManager] Batch certificate created: ${certificate.id} with ${domains.length} domains`);
      return certificate;
    } catch (error) {
      logger.error(`[CertificateManager] Error batch creating certificate:`, error);
      throw error;
    }
  }
}

module.exports = CertificateManagerService;
```

### 3. Integration with Custom Domain Service

**Update**: `smartstore-api/src/modules/sites/services/customDomain.service.js`

```javascript
const CertificateManagerService = require('./certificateManager.service');

// In verifyCustomDomain method, after verification:
static async verifyCustomDomain(domainId, siteId, userId) {
  // ... existing verification logic ...
  
  if (isVerified) {
    await CustomDomainModel.updateVerificationStatus(domainId, true);

    // Automatically assign to certificate
    const customDomain = await CustomDomainModel.getCustomDomainById(domainId);
    await CertificateManagerService.autoAssignDomain(domainId, customDomain.domain);

    // Trigger SSL provisioning
    try {
      await SSLService.autoProvisionSSL(domainId, customDomain.domain);
    } catch (sslError) {
      logger.warn(`[CustomDomainService] SSL provisioning failed:`, sslError);
    }

    return { verified: true, message: 'Domain verified successfully' };
  }
}
```

### 4. API Endpoints

**File**: `smartstore-api/src/modules/sites/routes/certificate.routes.js`

```javascript
const express = require('express');
const router = express.Router();
const CertificateManagerService = require('../services/certificateManager.service');
const { requireAuth, requireAdmin } = require('../../../shared/middleware/auth.middleware');
const { sendSuccess, sendError } = require('../../../shared/utils/response');

// Get all certificates (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const certificates = await CertificateManagerService.getAllCertificates();
    sendSuccess(res, certificates, 'Certificates retrieved successfully');
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// Get certificate details
router.get('/:certificateId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { certificateId } = req.params;
    const certificate = await CertificateManagerService.getCertificateById(certificateId);
    const domains = await CertificateManagerService.getCertificateDomains(certificateId);
    
    sendSuccess(res, { ...certificate, domains }, 'Certificate retrieved successfully');
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// Create new certificate (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { domains } = req.body; // Optional: array of domains to include
    const certificate = domains && domains.length > 0
      ? await CertificateManagerService.batchCreateCertificate(domains)
      : await CertificateManagerService.createNewCertificate();
    
    sendSuccess(res, certificate, 'Certificate created successfully');
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// Manually assign domain to certificate
router.post('/:certificateId/domains', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { customDomainId, domain } = req.body;
    
    await CertificateManagerService.addDomainToCertificate(certificateId, customDomainId, domain);
    await CertificateManagerService.updateCertificateDomainCount(certificateId);
    
    sendSuccess(res, null, 'Domain assigned to certificate successfully');
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

module.exports = router;
```

### 5. Dashboard UI Components

#### Certificate List Component

**File**: `smartstore-web/components/admin/CertificateList.tsx`

```typescript
interface Certificate {
  id: number;
  certificate_name: string;
  domains_count: number;
  max_domains: number;
  status: 'active' | 'full' | 'expired';
  created_at: string;
  domains: string[];
}

export function CertificateList() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  
  // Display table with:
  // - Certificate name
  // - Domain count (X/50)
  // - Status badge
  // - Progress bar
  // - Actions (View, Edit, Delete)
}
```

#### Certificate Detail View

**File**: `smartstore-web/components/admin/CertificateDetail.tsx`

```typescript
export function CertificateDetail({ certificateId }: { certificateId: number }) {
  // Display:
  // - Certificate information
  // - List of all domains
  // - Add domain button
  // - Remove domain button
  // - Certificate file download
}
```

#### Domain Assignment Flow

When user adds custom domain:
1. Domain is verified
2. System automatically assigns to available certificate
3. Dashboard shows which certificate domain was assigned to
4. User can manually reassign if needed

### 6. Batch Processing Strategy

For efficiency, implement a queue system:

```javascript
// Queue domains for batch certificate creation
class CertificateQueue {
  static async queueDomain(domain) {
    // Add to queue
    // When queue reaches 50 domains, batch create certificate
  }

  static async processQueue() {
    // Get queued domains (up to 50)
    // Create certificate with all domains
    // Assign domains to certificate
  }
}
```

### 7. Monitoring and Alerts

- **Certificate Usage Alerts**: Alert when certificate is 80% full (40/50)
- **Certificate Status Dashboard**: Real-time view of all certificates
- **Domain Assignment Logs**: Track which domains are assigned to which certificates
- **Certificate Health Checks**: Monitor certificate expiration

## Implementation Steps

1. **Phase 1: Database Schema**
   - Create migration for certificate tables
   - Update custom_domains table

2. **Phase 2: Certificate Manager Service**
   - Implement auto-assignment logic
   - Implement batch creation
   - Integrate with Cloudflare API

3. **Phase 3: API Endpoints**
   - Certificate management endpoints
   - Domain assignment endpoints

4. **Phase 4: Dashboard UI**
   - Certificate list view
   - Certificate detail view
   - Domain assignment interface

5. **Phase 5: Integration**
   - Integrate with custom domain verification
   - Integrate with SSL provisioning
   - Add monitoring and alerts

## Scaling to Thousands of Domains

**Example: 1000 domains**

- **Certificates needed**: 1000 ÷ 50 = 20 certificates
- **Management**: Automatic assignment to available certificates
- **Dashboard**: View all 20 certificates, see which are full
- **New domains**: Automatically assigned to next available certificate

**Example: 10,000 domains**

- **Certificates needed**: 10,000 ÷ 50 = 200 certificates
- **Management**: Same automatic system, just more certificates
- **Dashboard**: Paginated list, search/filter capabilities
- **Performance**: Batch operations, efficient queries

## Benefits

1. **Automatic**: No manual certificate management
2. **Scalable**: Handles thousands of domains
3. **Efficient**: Batch operations when possible
4. **Transparent**: Dashboard shows certificate status
5. **Flexible**: Can manually override if needed
6. **Reliable**: Automatic fallback and error handling

