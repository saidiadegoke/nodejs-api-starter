# Multi-Tenant Routing - Implementation Plan

## Overview
Implement host-based routing that routes requests to the correct site based on subdomain (e.g., `john.smartstore.ng`) or custom domain (e.g., `myshop.com`). This is critical for the multi-tenant architecture.

## Architecture

### Routing Strategy
```typescript
interface SiteRoute {
  hostname: string  // Full hostname (e.g., "john.smartstore.ng" or "myshop.com")
  siteId: string
  siteSlug: string
  isCustomDomain: boolean
  sslEnabled: boolean
}

// Routing logic:
// 1. Extract hostname from request
// 2. Lookup site by hostname
// 3. Route to site's rendering engine
// 4. Apply site customization
```

### Routing Flow
```
Request → Extract Hostname → Lookup Site → Load Engine → Render Site → Response
```

## Key Components

### 1. Hostname Extractor Middleware
**File:** `smartstore-api/src/modules/sites/middleware/hostnameExtractor.js`

**Functionality:**
- Extract hostname from request
- Handle www/non-www
- Handle port numbers
- Normalize hostname

**Technologies:**
- Express.js middleware
- URL parsing

### 2. Site Lookup Service
**File:** `smartstore-api/src/modules/sites/services/siteLookup.service.js`

**Functionality:**
- Lookup site by subdomain
- Lookup site by custom domain
- Cache site lookups
- Handle not found

**Technologies:**
- PostgreSQL queries
- Redis caching (optional)
- Site model

### 3. Site Router Middleware
**File:** `smartstore-api/src/modules/sites/middleware/siteRouter.js`

**Functionality:**
- Main routing middleware
- Combine hostname extraction + site lookup
- Attach site to request
- Handle routing errors

**Technologies:**
- Express.js middleware
- Error handling

### 4. Site Renderer
**File:** `smartstore-api/src/modules/sites/services/siteRenderer.service.js`

**Functionality:**
- Load site engine
- Fetch site pages
- Apply customization
- Render HTML
- Return response

**Technologies:**
- Engine loader
- Template rendering
- Customization application

### 5. Public Routes Handler
**File:** `smartstore-api/src/modules/sites/routes/public.routes.js`

**Functionality:**
- Handle all public site routes
- Page routing
- 404 handling
- Error pages

**Technologies:**
- Express.js routes
- Site rendering

## Backend Components

### 1. Site Lookup API (Internal)
**File:** `smartstore-api/src/modules/sites/services/siteLookup.service.js`

**Methods:**
- `getSiteByHostname(hostname)` - Main lookup method
- `getSiteBySubdomain(subdomain)` - Subdomain lookup
- `getSiteByCustomDomain(domain)` - Custom domain lookup
- `cacheSiteLookup(site)` - Cache site data

**Technologies:**
- PostgreSQL
- Redis (optional caching)
- Site model

### 2. Routing Middleware Stack
**File:** `smartstore-api/src/app.js` or `server.js`

**Middleware Order:**
1. Hostname extractor
2. Site lookup
3. Site status check
4. Site router
5. Public routes

**Technologies:**
- Express.js middleware
- Middleware composition

### 3. Nginx Configuration
**File:** `nginx.conf` or dynamic config

**Functionality:**
- Wildcard subdomain handling
- Custom domain handling
- SSL termination
- Proxy to Node.js

**Technologies:**
- Nginx
- SSL certificates

## Data Flow

1. **Request Arrives**
   - Request comes to server
   - Extract hostname from headers
   - Normalize hostname (remove www, port)

2. **Site Lookup**
   - Check cache for site
   - If not cached, query database
   - Lookup by subdomain or custom domain
   - Cache result

3. **Site Routing**
   - Attach site to request
   - Check site status
   - Load site engine
   - Route to appropriate handler

4. **Site Rendering**
   - Fetch requested page
   - Apply customization
   - Render with engine
   - Return HTML response

## Implementation Steps

### Phase 1: Basic Routing (Week 1)
- [ ] Hostname extractor middleware
- [ ] Site lookup service
- [ ] Site router middleware
- [ ] Basic subdomain routing

### Phase 2: Custom Domains (Week 2)
- [ ] Custom domain lookup
- [ ] Domain routing
- [ ] www/non-www handling
- [ ] Domain caching

### Phase 3: Integration (Week 3)
- [ ] Integrate with site renderer
- [ ] Status checking
- [ ] Error handling
- [ ] 404 pages

### Phase 4: Optimization (Week 4)
- [ ] Caching layer
- [ ] Performance optimization
- [ ] Nginx configuration
- [ ] Testing & monitoring

## Technologies

### Backend
- **Express.js** - Framework
- **PostgreSQL** - Database
- **Redis** - Caching (optional)
- **Nginx** - Reverse proxy

## File Structure

```
smartstore-api/
├── src/
│   ├── app.js
│   └── modules/
│       └── sites/
│           ├── middleware/
│           │   ├── hostnameExtractor.js
│           │   ├── siteRouter.js
│           │   └── checkSiteStatus.js
│           ├── services/
│           │   ├── siteLookup.service.js
│           │   └── siteRenderer.service.js
│           └── routes/
│               └── public.routes.js
└── nginx/
    └── smartstore.conf
```

## Hostname Extractor

```javascript
const hostnameExtractor = (req, res, next) => {
  const hostname = req.hostname || req.get('host')
  
  // Remove port if present
  const cleanHostname = hostname.split(':')[0]
  
  // Remove www prefix
  const normalizedHostname = cleanHostname.replace(/^www\./, '')
  
  req.hostname = normalizedHostname
  req.isSubdomain = normalizedHostname.endsWith('.smartstore.ng')
  
  if (req.isSubdomain) {
    req.subdomain = normalizedHostname.split('.')[0]
  }
  
  next()
}
```

## Site Lookup

```javascript
const getSiteByHostname = async (hostname) => {
  // Check cache first
  const cached = await redis.get(`site:${hostname}`)
  if (cached) {
    return JSON.parse(cached)
  }
  
  // Check if subdomain
  if (hostname.endsWith('.smartstore.ng')) {
    const slug = hostname.split('.')[0]
    const site = await SiteModel.getSiteBySlug(slug)
    if (site) {
      await redis.setex(`site:${hostname}`, 3600, JSON.stringify(site))
      return site
    }
  }
  
  // Check custom domain
  const site = await SiteModel.getSiteByCustomDomain(hostname)
  if (site) {
    await redis.setex(`site:${hostname}`, 3600, JSON.stringify(site))
    return site
  }
  
  return null
}
```

## Site Router Middleware

```javascript
const siteRouter = async (req, res, next) => {
  try {
    const site = await getSiteByHostname(req.hostname)
    
    if (!site) {
      return res.status(404).render('404')
    }
    
    // Attach site to request
    req.site = site
    
    // Check site status
    if (site.status === 'suspended') {
      return res.status(403).render('suspended', { site })
    }
    
    if (site.status === 'draft') {
      // Allow owner preview
      if (req.user && req.user.id === site.owner_id) {
        req.isDraftPreview = true
      } else {
        return res.status(403).render('draft', { site })
      }
    }
    
    next()
  } catch (error) {
    console.error('Site routing error:', error)
    res.status(500).render('500')
  }
}
```

## Nginx Configuration

```nginx
# Wildcard subdomain
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
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Custom domains (dynamic - generated per domain)
# See nginxConfig.service.js for generation
```

## Success Criteria

- [ ] Subdomains route to correct sites
- [ ] Custom domains route to correct sites
- [ ] www/non-www handled correctly
- [ ] Site lookup is cached
- [ ] Routing is performant
- [ ] 404 pages work correctly
- [ ] Status checking integrated
- [ ] Nginx configuration is dynamic


