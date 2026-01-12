# Site Deployment & Domain Management Implementation Plan

## Overview
This document outlines the complete implementation plan for deploying sites with subdomain and custom domain support, enabling users to create and deploy their sites after registration.

## Current State Analysis

### ✅ What's Already Implemented

1. **Site Status Management**
   - Sites have `status` field: `'active' | 'draft' | 'suspended'`
   - Sites created as `'draft'` by default
   - Status toggle UI exists (`StatusToggle` component)
   - Status API endpoints exist
   - Backend routing enforces status (only `active` sites are publicly accessible)

2. **Subdomain Routing**
   - `smartstore-app` has middleware for subdomain resolution
   - `SiteResolver` class handles subdomain → site lookup
   - Proxy middleware extracts hostname and resolves site
   - Supports: `{slug}.smartstore.ng` or `{slug}.localhost:3002`

3. **Custom Domain Backend Support**
   - `sites` table has `primary_domain` field
   - `SiteModel.getSiteByCustomDomain()` exists
   - `SiteModel.getSiteByHostname()` handles both subdomain and custom domain
   - Public API endpoint: `GET /public/sites/by-domain/:domain`

4. **Template System**
   - Sites reference templates for pages
   - Template application workflow exists
   - Sites must have template before activation

### ❌ What's Missing

1. ~~**Custom Domain Management UI**~~ ✅ **COMPLETED**
   - ✅ UI to add/manage custom domains
   - ✅ DNS verification UI
   - ✅ SSL certificate status display

2. ~~**DNS Verification**~~ ✅ **COMPLETED**
   - ✅ Automated DNS verification
   - ✅ TXT record verification
   - ✅ Domain ownership validation

3. ~~**SSL Certificate Management**~~ ✅ **COMPLETED**
   - ✅ Automatic SSL provisioning
   - ✅ Cloudflare/Let's Encrypt integration
   - ✅ SSL status monitoring

4. **Deployment Workflow UI** ✅ **COMPLETED**
   - ✅ Clear "Deploy" button/flow
   - ✅ Deployment status tracking
   - ✅ Deployment history (Phase 6)

5. **User Registration → Site Creation Flow** ✅ **COMPLETED**
   - ✅ Setup wizard on dashboard (`/dashboard/get-started`)
   - ✅ Setup progress tracking (`GetStartedSection`)
   - ✅ Multi-step wizard (Store, Products, Pages, Sales Channels, Marketing)
   - ⚠️ Optional: Auto site creation on registration (not required, wizard handles it)

6. **Production Nginx Configuration** ✅ **COMPLETED**
   - ✅ Nginx service for dynamic configs
   - ✅ Production base Nginx config template
   - ✅ Wildcard SSL setup documentation

---

## Implementation Plan

### Phase 1: Site Activation & Deployment UI (Priority: HIGH)

#### 1.1 Enhanced Site Management Page
**File:** `smartstore-web/app/dashboard/sites/[id]/page.tsx`

**Features:**
- Clear "Deploy Site" section
- Deployment status indicator
- Site URL display (subdomain)
- Activation requirements checklist:
  - ✅ Template applied
  - ✅ At least one page exists
  - ✅ Site name configured
- One-click activation button

**Implementation:**
```typescript
// Add deployment section
<div className="space-y-4">
  <h3>Deploy Your Site</h3>
  {site.status === 'draft' && (
    <div>
      <p>Your site is in draft mode. Activate it to make it live.</p>
      <Button onClick={handleActivate}>
        Activate Site
      </Button>
    </div>
  )}
  {site.status === 'active' && (
    <div>
      <p>Your site is live!</p>
      <a href={`https://${site.slug}.smartstore.ng`}>
        {site.slug}.smartstore.ng
      </a>
    </div>
  )}
</div>
```

#### 1.2 Deployment Status Component
**File:** `smartstore-web/components/sites/DeploymentStatus.tsx`

**Features:**
- Visual deployment status
- Site URL display
- Last deployed timestamp
- Deployment history link

---

### Phase 2: Custom Domain Management (Priority: HIGH)

#### 2.1 Custom Domain Database Schema
**File:** `smartstore-api/src/db/migrations/XXX_create_custom_domains.sql`

```sql
CREATE TABLE IF NOT EXISTS custom_domains (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(255),
  verification_method VARCHAR(50) DEFAULT 'dns_txt', -- 'dns_txt', 'file', 'meta_tag'
  ssl_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'provisioning', 'active', 'failed'
  ssl_certificate_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP,
  UNIQUE(domain)
);

CREATE INDEX idx_custom_domains_site_id ON custom_domains(site_id);
CREATE INDEX idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX idx_custom_domains_verified ON custom_domains(verified);
```

#### 2.2 Custom Domain Model
**File:** `smartstore-api/src/modules/sites/models/customDomain.model.js`

**Methods:**
- `createCustomDomain(siteId, domain)` - Create domain record
- `getCustomDomainByDomain(domain)` - Lookup by domain
- `getCustomDomainsBySite(siteId)` - Get all domains for site
- `updateVerificationStatus(domainId, verified)` - Update verification
- `updateSSLStatus(domainId, status)` - Update SSL status

#### 2.3 Custom Domain API
**File:** `smartstore-api/src/modules/sites/routes/customDomain.routes.js`

**Endpoints:**
- `POST /sites/:siteId/custom-domains` - Add custom domain
- `GET /sites/:siteId/custom-domains` - List custom domains
- `DELETE /sites/:siteId/custom-domains/:domainId` - Remove domain
- `POST /sites/:siteId/custom-domains/:domainId/verify` - Verify domain
- `GET /sites/:siteId/custom-domains/:domainId/status` - Get verification/SSL status

#### 2.4 DNS Verification Service
**File:** `smartstore-api/src/modules/sites/services/dnsVerification.service.js`

**Features:**
- Generate verification token
- Check DNS TXT record
- Verify domain ownership
- Automatic retry mechanism

**Implementation:**
```javascript
class DNSVerificationService {
  static async generateVerificationToken(domain) {
    // Generate unique token
    const token = `smartstore-verify=${crypto.randomBytes(16).toString('hex')}`;
    return token;
  }

  static async verifyDNSRecord(domain, expectedToken) {
    // Use DNS lookup library (dns.promises or external service)
    // Check for TXT record: _smartstore-verification.{domain}
    // Return true if token matches
  }
}
```

#### 2.5 Custom Domain UI
**File:** `smartstore-web/app/dashboard/sites/[id]/domains/page.tsx`

**Features:**
- Add custom domain form
- Domain verification status
- DNS instructions
- SSL certificate status
- Remove domain option

**UI Flow:**
1. User enters domain (e.g., `mysite.com`)
2. System generates verification token
3. User adds DNS TXT record: `_smartstore-verification.mysite.com` → `smartstore-verify=abc123`
4. User clicks "Verify Domain"
5. System checks DNS and marks as verified
6. System provisions SSL certificate
7. Domain becomes active

---

### Phase 3: SSL Certificate Management (Priority: MEDIUM)

#### 3.1 SSL Service
**File:** `smartstore-api/src/modules/sites/services/ssl.service.js`

**Features:**
- Cloudflare SSL integration (preferred)
- Let's Encrypt fallback
- Automatic certificate provisioning
- Certificate renewal
- SSL status monitoring

**Implementation Options:**

**Option A: Cloudflare (Recommended)**
- Use Cloudflare API for SSL
- Automatic SSL for proxied domains
- Free SSL certificates
- Easy integration

**Option B: Let's Encrypt**
- Use `acme-client` library
- Automatic certificate generation
- Certificate renewal via cron
- More complex setup

#### 3.2 SSL Status Monitoring
- Background job to check SSL status
- Alert on certificate expiration
- Automatic renewal before expiration

---

### Phase 4: Production Nginx Configuration (Priority: HIGH) ✅ **COMPLETED**

#### 4.1 Nginx Configuration
**File:** `nginx.conf` (production)

```nginx
# Wildcard subdomain for smartstore.ng
server {
    listen 80;
    server_name *.smartstore.ng;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name *.smartstore.ng;

    ssl_certificate /etc/ssl/smartstore/wildcard.crt;
    ssl_certificate_key /etc/ssl/smartstore/wildcard.key;

    location / {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Custom domains (dynamic)
# Note: Use include directive to load custom domain configs
include /etc/nginx/sites-enabled/custom-domains/*.conf;
```

#### 4.2 Dynamic Nginx Configuration
**File:** `smartstore-api/src/modules/sites/services/nginx.service.js`

**Features:**
- Generate Nginx config for custom domains
- Reload Nginx when domain added/removed
- SSL certificate path configuration

---

### Phase 5: User Registration → Site Creation Flow (Priority: HIGH)

#### 5.1 Onboarding Flow
**File:** `smartstore-web/app/onboarding/page.tsx`

**Flow:**
1. User registers account
2. Redirect to onboarding
3. Create first site:
   - Site name
   - Site slug (auto-generated, editable)
   - Choose template (optional, can skip)
4. Site created as `draft`
5. Redirect to site management

#### 5.2 Auto Site Creation on Registration
**File:** `smartstore-api/src/modules/auth/services/registration.service.js`

**Option:** Automatically create a default site when user registers
- Site name: "My First Site"
- Slug: `user-{userId}` or `site-{timestamp}`
- Status: `draft`
- Template: None (user can add later)

---

### Phase 6: Deployment Status & History (Priority: MEDIUM) ✅ **COMPLETED**

#### 6.1 Deployment Model
**File:** `smartstore-api/src/db/migrations/XXX_create_deployments.sql`

```sql
CREATE TABLE IF NOT EXISTS deployments (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'building', 'success', 'failed'
  deployed_at TIMESTAMP,
  deployed_by INTEGER REFERENCES users(id),
  deployment_url VARCHAR(500),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deployments_site_id ON deployments(site_id);
CREATE INDEX idx_deployments_status ON deployments(status);
```

#### 6.2 Deployment Service
**File:** `smartstore-api/src/modules/sites/services/deployment.service.js`

**Features:**
- Record deployment events
- Track deployment status
- Store deployment URLs
- Error tracking

---

## Implementation Priority

### Week 1: Core Deployment
1. ✅ Enhanced site activation UI
2. ✅ Deployment status component
3. ✅ One-click activation workflow
4. ✅ Site URL display

### Week 2: Custom Domain Foundation
1. ✅ Custom domain database schema
2. ✅ Custom domain model & API
3. ✅ Add domain UI
4. ✅ Domain list display

### Week 3: DNS Verification
1. ✅ DNS verification service
2. ✅ Verification UI
3. ✅ DNS instructions display
4. ✅ Automatic verification check

### Week 4: SSL & Production Setup
1. ✅ SSL service (Cloudflare or Let's Encrypt)
2. ✅ SSL status monitoring
3. ✅ Nginx configuration
4. ✅ Production deployment

### Week 5: User Onboarding
1. ✅ Registration → site creation flow
2. ✅ Onboarding UI
3. ✅ First site setup wizard

---

## Technical Requirements

### Environment Variables

```bash
# Base domain for subdomains
BASE_DOMAIN=smartstore.ng
NEXT_PUBLIC_BASE_DOMAIN=smartstore.ng

# SSL Configuration
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ZONE_ID=xxx
# OR
LETS_ENCRYPT_EMAIL=admin@smartstore.ng
LETS_ENCRYPT_DIR=/etc/letsencrypt

# DNS Verification
DNS_VERIFICATION_TIMEOUT=30000
DNS_VERIFICATION_RETRIES=3
```

### Dependencies

```json
{
  "dependencies": {
    "dns": "^0.2.2", // DNS lookup
    "cloudflare": "^3.0.0", // Cloudflare API
    "acme-client": "^4.2.5", // Let's Encrypt
    "node-cron": "^3.0.3" // SSL renewal cron
  }
}
```

---

## User Flow

### New User Registration
1. User signs up → Account created
2. Redirect to onboarding
3. Create first site:
   - Enter site name: "My Store"
   - Slug auto-generated: "my-store"
   - Choose template (optional)
4. Site created as `draft`
5. Redirect to site management

### Site Activation
1. User goes to site management
2. Sees activation checklist:
   - ✅ Template applied
   - ✅ Pages exist
3. Clicks "Activate Site"
4. Site status → `active`
5. Site accessible at: `my-store.smartstore.ng`

### Custom Domain Setup
1. User goes to "Custom Domains" tab
2. Enters domain: `mystore.com`
3. System generates verification token
4. User sees DNS instructions:
   ```
   Add TXT record:
   Name: _smartstore-verification
   Value: smartstore-verify=abc123
   ```
5. User adds DNS record
6. User clicks "Verify"
7. System verifies DNS
8. System provisions SSL
9. Domain active: `mystore.com` → site

---

## Testing Checklist

- [ ] Site activation workflow
- [ ] Subdomain routing works
- [ ] Custom domain addition
- [ ] DNS verification
- [ ] SSL certificate provisioning
- [ ] Custom domain routing
- [ ] Site status enforcement
- [ ] User onboarding flow
- [x] Deployment history tracking ✅

---

## Security Considerations

1. **Domain Verification**
   - Must verify ownership before activation
   - Prevent domain hijacking
   - Rate limit verification attempts

2. **SSL Certificates**
   - Automatic renewal
   - Monitor expiration
   - Fallback to HTTP if SSL fails

3. **Subdomain Security**
   - Validate slug format
   - Prevent reserved subdomains (www, api, admin, etc.)
   - Rate limit site creation

4. **Custom Domain Security**
   - One domain per site (or allow multiple with verification)
   - Domain transfer verification
   - SSL certificate validation

---

## Next Steps

1. ✅ **Phase 1** - Site activation UI (COMPLETED)
2. ✅ **Phase 2** - Custom domain management (COMPLETED)
3. ✅ **Phase 3** - SSL automation (COMPLETED)
4. ✅ **Phase 4** - Production Nginx configuration (COMPLETED)
5. ✅ **Phase 5** - User experience / Setup wizard (COMPLETED)
6. ✅ **Phase 6** - Deployment history tracking (COMPLETED)

**All phases are now complete!** This plan provides a complete path from user registration to deployed site with custom domain support.

