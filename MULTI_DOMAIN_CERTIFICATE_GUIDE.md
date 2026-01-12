# Multi-Domain Origin Certificate Guide

This guide explains how to create and manage multi-domain Cloudflare Origin Certificates for custom domains.

## What is a Multi-Domain Certificate?

A multi-domain certificate is a single SSL certificate that covers multiple different domains. This is useful when you have many custom domains (user's own domains) that aren't subdomains of your base domain.

## When to Use Multi-Domain Certificates

**Use multi-domain certificates when:**
- You have many custom domains (user's own domains)
- Domains are not subdomains of your base domain
- You want to manage multiple domains with one certificate
- You need to scale to hundreds or thousands of custom domains

**Examples:**
- User domains: `acmecorp.com`, `shop.example.com`, `blog.anothersite.com`
- Not subdomains of your base domain (e.g., `smartstore.ng`)

## How to Create Multi-Domain Certificates

### Step 1: Access Cloudflare Dashboard

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select any zone (the certificate is account-wide, not zone-specific)
3. Go to **SSL/TLS** → **Origin Server**
4. Click **Create Certificate**

### Step 2: Configure Certificate

1. **Certificate Type**: Select **Origin Certificate**

2. **Hostnames**: Add multiple domains (up to 50 per certificate)
   - Enter one domain per line, or separate by commas
   - Include both www and non-www versions if needed
   - Use wildcards for subdomains when possible

   **Example:**
   ```
   acmecorp.com
   www.acmecorp.com
   shop.example.com
   blog.example.com
   *.example.com
   anothersite.com
   www.anothersite.com
   ```

3. **Validity**: 15 years (default)

4. **Private Key Type**: 
   - RSA (2048) - Recommended for compatibility
   - ECDSA (P-256) - Smaller, faster, but less compatible

5. Click **Create**

### Step 3: Download Certificate and Key

After creating the certificate, you'll see:
- **Origin Certificate** (the certificate file)
- **Private Key** (the private key file)

**Important**: Download both immediately - the private key is only shown once!

### Step 4: Install on Nginx Server

**Option A: Single Certificate for All Custom Domains**

If you have one multi-domain certificate covering all custom domains:

```bash
# Save certificate
cat > /etc/ssl/smartstore/certs/cloudflare-origin-custom.crt << 'EOF'
-----BEGIN CERTIFICATE-----
[Paste your Origin Certificate here]
-----END CERTIFICATE-----
EOF

# Save private key
cat > /etc/ssl/smartstore/keys/cloudflare-origin-custom.key << 'EOF'
-----BEGIN PRIVATE KEY-----
[Paste your Private Key here]
-----END PRIVATE KEY-----
EOF

# Set permissions
chmod 644 /etc/ssl/smartstore/certs/cloudflare-origin-custom.crt
chmod 600 /etc/ssl/smartstore/keys/cloudflare-origin-custom.key
```

**Option B: Multiple Certificates for Different Domain Groups**

If you have multiple certificates for different domain groups:

```bash
# Certificate 1 (for customer group A)
/etc/ssl/smartstore/certs/cloudflare-origin-group-a.crt
/etc/ssl/smartstore/keys/cloudflare-origin-group-a.key

# Certificate 2 (for customer group B)
/etc/ssl/smartstore/certs/cloudflare-origin-group-b.crt
/etc/ssl/smartstore/keys/cloudflare-origin-group-b.key
```

### Step 5: Configure Environment Variables

**For single multi-domain certificate:**
```env
CLOUDFLARE_ORIGIN_CERT_PATH=/etc/ssl/smartstore/certs/cloudflare-origin-custom.crt
CLOUDFLARE_ORIGIN_KEY_PATH=/etc/ssl/smartstore/keys/cloudflare-origin-custom.key
```

**For multiple certificates:**
The API service will need to be configured to select the appropriate certificate based on the domain. This may require custom logic or configuration mapping.

## Certificate Limits

- **Maximum hostnames per certificate**: 50
- **Certificate validity**: 15 years
- **Number of certificates**: Unlimited (create as many as needed)

## Scaling Strategy

### Strategy 1: One Certificate for All Custom Domains

**Pros:**
- Simple management
- One certificate to install
- Easy to update

**Cons:**
- Limited to 50 domains per certificate
- All domains must be known upfront
- Adding new domains requires creating a new certificate

**Best for:** Small to medium deployments (< 50 custom domains)

### Strategy 2: Multiple Certificates by Domain Group

**Pros:**
- Can scale to thousands of domains
- Group related domains together
- Can add new certificates as needed

**Cons:**
- More complex management
- Need to track which certificate covers which domains
- May need custom logic to select the right certificate

**Best for:** Large deployments (50+ custom domains)

### Strategy 3: Hybrid Approach

- Use one certificate for base domain: `smartstore.ng`, `*.smartstore.ng`
- Use multiple certificates for custom domains, grouped by:
  - Customer
  - Domain registration date
  - Geographic region
  - Any other logical grouping

**Best for:** Production deployments with mixed domain types

## Example: Creating a Certificate for 50 Custom Domains

1. **Prepare domain list** (up to 50 domains):
   ```
   customer1.com
   www.customer1.com
   customer2.com
   www.customer2.com
   shop.customer3.com
   blog.customer3.com
   *.customer4.com
   ... (up to 50 total)
   ```

2. **Create certificate in Cloudflare**:
   - Go to SSL/TLS → Origin Server
   - Click Create Certificate
   - Paste all 50 domains in Hostnames field
   - Create certificate

3. **Download and install**:
   - Download certificate and key
   - Install on Nginx server
   - Configure environment variables

4. **Result**: One certificate covers all 50 domains!

## Managing Multiple Certificates

If you need more than 50 domains, create multiple certificates:

**Certificate 1** (Domains 1-50):
```
domain1.com
domain2.com
...
domain50.com
```

**Certificate 2** (Domains 51-100):
```
domain51.com
domain52.com
...
domain100.com
```

**Certificate 3** (Domains 101-150):
```
domain101.com
domain102.com
...
domain150.com
```

Install all certificates on Nginx and configure the API service to select the appropriate certificate based on the domain.

## Verification

**Check certificate coverage:**
```bash
openssl x509 -in /etc/ssl/smartstore/certs/cloudflare-origin-custom.crt -text -noout | grep -A 1 "Subject Alternative Name"
```

This will show all domains covered by the certificate.

**Test with a domain:**
```bash
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com
```

## Best Practices

1. **Group related domains**: Create certificates for logical groups (e.g., all domains for one customer)

2. **Use wildcards when possible**: `*.example.com` covers all subdomains instead of listing each one

3. **Include www and non-www**: Add both `example.com` and `www.example.com` to avoid issues

4. **Plan for growth**: Leave room in certificates for future domains, or plan to create new certificates

5. **Document certificate coverage**: Keep track of which domains are in which certificate

6. **Backup certificates**: Store certificates and keys securely (encrypted backup)

7. **Monitor expiration**: Although certificates are 15-year, set reminders to renew before expiration

## Troubleshooting

### Certificate doesn't cover a domain

**Error**: `SSL certificate doesn't match domain`

**Solution**:
1. Verify the domain is in the certificate's hostname list
2. Check certificate with: `openssl x509 -in cert.crt -text -noout | grep DNS`
3. If missing, create a new certificate that includes the domain
4. Install new certificate on Nginx
5. Reload Nginx

### Need to add more domains

**Option 1**: Create a new certificate with the new domains
- Install alongside existing certificate
- Configure API service to use appropriate certificate

**Option 2**: Create a new certificate that includes both old and new domains
- Replace old certificate with new one
- Update Nginx configuration

### Certificate limit reached (50 domains)

**Solution**: Create additional certificates
- Certificate 1: Domains 1-50
- Certificate 2: Domains 51-100
- Certificate 3: Domains 101-150
- etc.

Install all certificates and configure API service to select the right one.

## Automatic Certificate Management for Thousands of Domains

For scaling to thousands of domains, you need an automatic certificate management system. Here's how to implement it:

### Architecture Overview

1. **Certificate Pool System**: Maintain a pool of certificates, each covering up to 50 domains
2. **Automatic Assignment**: When a new domain is added, automatically assign it to an available certificate
3. **Certificate Rotation**: When a certificate reaches 50 domains, create a new one
4. **Dashboard Management**: Web interface to view and manage certificates

### Implementation Strategy

#### Step 1: Certificate Registry Database

Create a database table to track certificates:

```sql
CREATE TABLE ssl_certificates (
  id SERIAL PRIMARY KEY,
  certificate_name VARCHAR(255) NOT NULL,
  cert_path VARCHAR(500) NOT NULL,
  key_path VARCHAR(500) NOT NULL,
  domains_count INTEGER DEFAULT 0,
  max_domains INTEGER DEFAULT 50,
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'full', 'expired'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ssl_certificate_domains (
  id SERIAL PRIMARY KEY,
  certificate_id INTEGER REFERENCES ssl_certificates(id),
  domain VARCHAR(255) NOT NULL,
  custom_domain_id INTEGER REFERENCES custom_domains(id),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(domain)
);
```

#### Step 2: Automatic Certificate Assignment Logic

When a new custom domain is verified:

1. **Check existing certificates** for available slots (< 50 domains)
2. **If available**: Add domain to existing certificate
3. **If full**: Create new certificate via Cloudflare API
4. **Update Nginx config** with appropriate certificate

#### Step 3: Cloudflare API Integration

Use Cloudflare API to programmatically create certificates:

```javascript
// Pseudo-code for automatic certificate creation
async function createCloudflareOriginCertificate(domains) {
  const response = await fetch('https://api.cloudflare.com/client/v4/certificates', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'origin',
      hosts: domains, // Array of up to 50 domains
      validity_days: 5475, // 15 years
      key_type: 'rsa',
      key_length: 2048
    })
  });
  
  return await response.json();
}
```

#### Step 4: Certificate Management Service

Create a service to manage certificates:

```javascript
class CertificateManagerService {
  // Find or create certificate with available slot
  async assignDomainToCertificate(domain) {
    // 1. Find certificate with < 50 domains
    let certificate = await this.findAvailableCertificate();
    
    // 2. If none available, create new one
    if (!certificate) {
      certificate = await this.createNewCertificate();
    }
    
    // 3. Add domain to certificate
    await this.addDomainToCertificate(certificate.id, domain);
    
    // 4. If certificate now has 50 domains, mark as full
    if (certificate.domains_count + 1 >= 50) {
      await this.markCertificateAsFull(certificate.id);
    }
    
    return certificate;
  }
  
  // Create new certificate via Cloudflare API
  async createNewCertificate() {
    // Start with empty certificate, add domains as needed
    // Or batch create when you have enough domains
  }
}
```

### Dashboard Management Interface

#### Certificate Overview Page

Display all certificates with:
- Certificate name/ID
- Number of domains (X/50)
- Status (Active, Full, Expired)
- List of domains covered
- Actions: View, Edit, Renew, Delete

#### Domain Assignment View

When adding a custom domain:
- Show which certificate it will be assigned to
- Show certificate status (available slots)
- Auto-assign or allow manual selection

#### Certificate Creation Workflow

1. **Automatic**: System creates new certificate when needed
2. **Manual**: Admin can create certificate via dashboard
3. **Bulk**: Create certificate with multiple domains at once

### Scaling Strategy for Thousands of Domains

#### Strategy: Certificate Pool with Auto-Rotation

1. **Initial Setup**: Create first certificate (empty or with a few domains)

2. **Domain Assignment Flow**:
   ```
   New Domain Added
   ↓
   Check Certificate Pool
   ↓
   Find Certificate with < 50 domains
   ↓
   If Found: Add domain to certificate
   If Not Found: Create new certificate → Add domain
   ↓
   Update Nginx Config
   ↓
   Reload Nginx
   ```

3. **Certificate Lifecycle**:
   - **Active**: 0-49 domains (accepting new domains)
   - **Full**: 50 domains (no more domains can be added)
   - **Expired**: Needs renewal (15 years, but monitor)

4. **Batching Strategy** (Optional):
   - Instead of creating certificates one-by-one, batch domains
   - When you have 50 domains waiting, create certificate with all 50
   - More efficient, but requires queuing system

### Implementation Example

#### API Endpoints Needed

```javascript
// Certificate Management
GET    /api/admin/certificates              // List all certificates
GET    /api/admin/certificates/:id          // Get certificate details
POST   /api/admin/certificates              // Create new certificate
PUT    /api/admin/certificates/:id          // Update certificate
DELETE /api/admin/certificates/:id          // Delete certificate

// Domain Assignment
POST   /api/admin/certificates/:id/domains // Add domain to certificate
DELETE /api/admin/certificates/:id/domains/:domainId // Remove domain

// Automatic Assignment
POST   /api/custom-domains/:id/assign-certificate // Auto-assign certificate
```

#### Dashboard Components

1. **Certificate List View**:
   - Table showing all certificates
   - Status indicators (Active/Full)
   - Domain count (X/50)
   - Quick actions

2. **Certificate Detail View**:
   - Certificate information
   - List of all domains
   - Add/remove domains
   - Certificate file download

3. **Domain Assignment Modal**:
   - Show available certificates
   - Auto-select best certificate
   - Allow manual override

### Best Practices for Scale

1. **Pre-create Certificates**: Create certificates in advance (e.g., create 10 certificates when you have 400 domains)

2. **Monitor Certificate Usage**: Alert when certificates are 80% full (40/50 domains)

3. **Batch Operations**: Group certificate operations to reduce API calls

4. **Certificate Rotation**: Periodically consolidate domains to optimize certificate usage

5. **Fallback Strategy**: If Cloudflare API fails, queue domain for later assignment

6. **Dashboard Alerts**: Show warnings when certificates are getting full

### Example: Managing 1000 Domains

**Certificates Needed**: 1000 ÷ 50 = 20 certificates

**Management**:
- Create 20 certificates (or create as needed)
- Each certificate covers 50 domains
- Dashboard shows all 20 certificates
- System automatically assigns domains to available certificates
- When certificate 1 is full (50 domains), automatically use certificate 2
- And so on...

**Dashboard View**:
```
Certificate 1: 50/50 domains [FULL] ✅
Certificate 2: 50/50 domains [FULL] ✅
Certificate 3: 50/50 domains [FULL] ✅
...
Certificate 20: 0/50 domains [ACTIVE] ✅
```

### Future Enhancements

1. **Smart Assignment**: Assign related domains to same certificate (e.g., same customer)

2. **Certificate Optimization**: Periodically reorganize domains to minimize certificate count

3. **Auto-Renewal**: Monitor certificate expiration and auto-renew before expiration

4. **Certificate Analytics**: Track certificate usage, domain growth, etc.

5. **Multi-Certificate Nginx Config**: Nginx can use multiple certificates, select based on domain

## Summary

- **Automatic Management**: System automatically assigns domains to certificates
- **Certificate Pool**: Maintain pool of certificates, create new ones as needed
- **Dashboard Interface**: Web UI to view and manage certificates
- **Scales to Thousands**: Each certificate covers 50 domains, create as many as needed
- **API Integration**: Use Cloudflare API to programmatically create certificates
- **Best for**: Large-scale deployments with thousands of custom domains

