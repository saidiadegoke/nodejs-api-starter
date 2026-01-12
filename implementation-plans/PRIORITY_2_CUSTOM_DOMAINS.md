# Custom Domain Management - Implementation Plan

## Overview
Implement full custom domain management: add domains, verify ownership via DNS, manage SSL certificates, and route custom domains to sites.

## Architecture

### Custom Domain Structure
```typescript
interface CustomDomain {
  id: string
  siteId: string
  domain: string  // e.g., "myshop.com"
  verified: boolean
  verificationToken: string
  sslStatus: 'pending' | 'active' | 'failed' | 'expired'
  sslProvider: 'cloudflare' | 'letsencrypt' | 'manual'
  sslCertificate?: string
  sslKey?: string
  createdAt: string
  updatedAt: string
}
```

## Key Components

### 1. Domain Management Page
**File:** `smartstore-web/app/dashboard/sites/[id]/domains/page.tsx`

**Functionality:**
- List all domains for site
- Add new domain
- Domain status display
- SSL status display
- Remove domain

**Technologies:**
- Next.js App Router
- React
- Redux for state

### 2. Add Domain Dialog
**File:** `smartstore-web/components/domains/AddDomainDialog.tsx`

**Functionality:**
- Domain input
- Domain validation
- Instructions display
- Verification status

**Technologies:**
- React components
- Form validation
- Zod validation

### 3. Domain Verification Component
**File:** `smartstore-web/components/domains/DomainVerification.tsx`

**Functionality:**
- Show verification instructions
- DNS record display
- Verify button
- Verification status
- Auto-check verification

**Technologies:**
- React components
- Polling for verification status

### 4. SSL Status Component
**File:** `smartstore-web/components/domains/SSLStatus.tsx`

**Functionality:**
- SSL status display
- SSL provider info
- Certificate expiry
- Renew SSL button
- SSL error messages

**Technologies:**
- React components
- Status indicators

### 5. Domain Instructions
**File:** `smartstore-web/components/domains/DomainInstructions.tsx`

**Functionality:**
- Step-by-step instructions
- DNS record examples
- Copy-to-clipboard
- Visual guide

**Technologies:**
- React components
- Copy to clipboard API

## Backend Components

### 1. Domain Management API
**File:** `smartstore-api/src/modules/sites/routes/domains.routes.js`

**Endpoints:**
- `GET /sites/:siteId/domains` - List all domains
- `POST /sites/:siteId/domains` - Add domain
- `GET /sites/:siteId/domains/:domainId` - Get domain details
- `POST /sites/:siteId/domains/:domainId/verify` - Verify domain
- `GET /sites/:siteId/domains/:domainId/status` - Get verification/SSL status
- `DELETE /sites/:siteId/domains/:domainId` - Remove domain
- `POST /sites/:siteId/domains/:domainId/ssl/renew` - Renew SSL

**Technologies:**
- Express.js
- PostgreSQL
- DNS verification library

### 2. DNS Verification Service
**File:** `smartstore-api/src/modules/sites/services/dnsVerification.service.js`

**Functionality:**
- Generate verification token
- Check DNS TXT record
- Verify domain ownership
- Update verification status

**Technologies:**
- `dns` module (Node.js)
- DNS lookup utilities

### 3. SSL Management Service
**File:** `smartstore-api/src/modules/sites/services/sslManagement.service.js`

**Functionality:**
- Request SSL certificate (Let's Encrypt)
- Check SSL status
- Renew SSL certificates
- Handle SSL errors
- Cloudflare SSL integration

**Technologies:**
- Certbot (Let's Encrypt)
- Cloudflare API (if using Cloudflare)
- SSL certificate management

### 4. Domain Routing Middleware
**File:** `smartstore-api/src/modules/sites/middleware/domainRouting.js`

**Functionality:**
- Detect custom domain from request
- Lookup site by domain
- Route to correct site
- Handle www/non-www redirects

**Technologies:**
- Express.js middleware
- Site lookup

### 5. Nginx Configuration Generator
**File:** `smartstore-api/src/modules/sites/services/nginxConfig.service.js`

**Functionality:**
- Generate Nginx config for domain
- SSL certificate paths
- Proxy configuration
- Reload Nginx

**Technologies:**
- File system operations
- Nginx config templates
- Shell commands

## Data Flow

1. **Add Domain**
   - User enters domain
   - Validate domain format
   - Generate verification token
   - Store in database
   - Show DNS instructions

2. **Verify Domain**
   - User adds DNS TXT record
   - User clicks verify
   - Backend checks DNS
   - Update verification status
   - Request SSL certificate

3. **SSL Provisioning**
   - Domain verified
   - Request SSL from Let's Encrypt
   - Store certificate
   - Update Nginx config
   - Reload Nginx
   - Update SSL status

4. **Domain Routing**
   - User visits custom domain
   - Middleware detects domain
   - Lookup site by domain
   - Route to site
   - Apply SSL

## Implementation Steps

### Phase 1: Domain Management (Week 1)
- [ ] Domain management UI
- [ ] Add domain API
- [ ] Domain validation
- [ ] Domain list display

### Phase 2: DNS Verification (Week 2)
- [ ] DNS verification service
- [ ] Verification UI
- [ ] Auto-check verification
- [ ] Verification status updates

### Phase 3: SSL Management (Week 3)
- [ ] Let's Encrypt integration
- [ ] SSL certificate request
- [ ] SSL status tracking
- [ ] SSL renewal

### Phase 4: Routing & Nginx (Week 4)
- [ ] Domain routing middleware
- [ ] Nginx config generator
- [ ] Nginx reload automation
- [ ] Testing & polish

## Technologies

### Frontend
- **Next.js 14+** - Framework
- **React** - UI library
- **Zod** - Domain validation
- **Tailwind CSS** - Styling

### Backend
- **Express.js** - API framework
- **PostgreSQL** - Database
- **dns** (Node.js) - DNS lookup
- **Certbot** - SSL certificates
- **Cloudflare API** - If using Cloudflare
- **Nginx** - Reverse proxy

## File Structure

```
smartstore-web/
├── app/
│   └── dashboard/
│       └── sites/
│           └── [id]/
│               └── domains/
│                   └── page.tsx
└── components/
    └── domains/
        ├── AddDomainDialog.tsx
        ├── DomainVerification.tsx
        ├── SSLStatus.tsx
        └── DomainInstructions.tsx

smartstore-api/
└── src/
    └── modules/
        └── sites/
            ├── routes/
            │   └── domains.routes.js
            ├── controllers/
            │   └── domain.controller.js
            ├── services/
            │   ├── dnsVerification.service.js
            │   ├── sslManagement.service.js
            │   └── nginxConfig.service.js
            └── middleware/
                └── domainRouting.js
```

## DNS Verification

```javascript
const verifyDomain = async (domain, verificationToken) => {
  try {
    const records = await dns.resolveTxt(domain)
    const verificationRecord = records.flat().find(
      record => record.includes(`smartstore-verification=${verificationToken}`)
    )
    return !!verificationRecord
  } catch (error) {
    console.error('DNS verification error:', error)
    return false
  }
}
```

## SSL Certificate Request

```javascript
const requestSSLCertificate = async (domain) => {
  try {
    // Using Certbot
    const { exec } = require('child_process')
    const command = `certbot certonly --nginx -d ${domain} -d www.${domain} --non-interactive --agree-tos --email admin@smartstore.ng`
    
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error)
        } else {
          resolve({
            certificate: `/etc/letsencrypt/live/${domain}/fullchain.pem`,
            key: `/etc/letsencrypt/live/${domain}/privkey.pem`
          })
        }
      })
    })
  } catch (error) {
    throw new Error(`SSL certificate request failed: ${error.message}`)
  }
}
```

## Nginx Config Template

```nginx
server {
    listen 80;
    server_name {{domain}} www.{{domain}};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name {{domain}} www.{{domain}};

    ssl_certificate {{sslCertificate}};
    ssl_certificate_key {{sslKey}};

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Success Criteria

- [ ] Users can add custom domains
- [ ] Domain verification works via DNS
- [ ] SSL certificates are automatically provisioned
- [ ] Custom domains route to correct sites
- [ ] SSL status is tracked and displayed
- [ ] SSL renewal works automatically
- [ ] Domain removal works correctly
- [ ] Error handling is comprehensive


