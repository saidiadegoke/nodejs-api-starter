# Public API Endpoints - Implementation Status

## Overview

Public API endpoints have been created for `smartstore-app` to access site data without authentication. These endpoints are designed for site rendering and preview functionality.

## ✅ Implemented Endpoints

### 1. Get Site by Slug
**Endpoint:** `GET /public/sites/by-slug/:slug`
- **Auth:** None (public)
- **Purpose:** Lookup site by slug for rendering
- **Response:** Site data (only for active sites)
- **Status:** ✅ Implemented

**Example:**
```bash
curl http://localhost:4050/public/sites/by-slug/my-site
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "My Site",
    "slug": "my-site",
    "status": "active",
    "owner_id": "...",
    "template_id": 1,
    "primary_domain": "example.com",
    "engine_version": "v1.0.0",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

### 2. Get Site by Domain
**Endpoint:** `GET /public/sites/by-domain/:domain`
- **Auth:** None (public)
- **Purpose:** Lookup site by custom domain
- **Response:** Site data (only for active sites)
- **Status:** ✅ Implemented

**Example:**
```bash
curl http://localhost:4050/public/sites/by-domain/example.com
```

### 3. Get Site Configuration
**Endpoint:** `GET /public/sites/:id/config`
- **Auth:** None (public)
- **Purpose:** Get complete site configuration in one call
- **Response:** Site config (site, template, customization, pages - only published pages)
- **Status:** ✅ Implemented

**Example:**
```bash
curl http://localhost:4050/public/sites/1/config
```

**Response:**
```json
{
  "success": true,
  "data": {
    "site": { ... },
    "template": { ... },
    "customization": { ... },
    "pages": [ ... ] // Only published pages
  }
}
```

### 4. Get Draft Configuration
**Endpoint:** `GET /public/sites/:id/config/draft`
- **Auth:** None (public, for preview mode)
- **Purpose:** Get draft site configuration for preview
- **Response:** Site config (includes draft pages)
- **Status:** ✅ Implemented

**Example:**
```bash
curl http://localhost:4050/public/sites/1/config/draft
```

**Response:**
```json
{
  "success": true,
  "data": {
    "site": { ... },
    "template": { ... },
    "customization": { ... },
    "pages": [ ... ] // All pages (published + draft) for preview
  }
}
```

## 🔒 Security Considerations

### Access Control
- **Public Config:** Only returns data for `active` sites
- **Draft Config:** Returns data for `active` and `draft` sites (not `suspended`)
- **Pages:** Public config only includes published pages; draft config includes all pages

### Rate Limiting
- ⚠️ **TODO:** Add rate limiting middleware for public endpoints
- Recommended: 100 requests per minute per IP

### Data Filtering
- Public endpoints exclude sensitive fields:
  - No internal metadata
  - No owner details beyond ID
  - Only active sites are accessible
  - Only published pages in public config

## 📝 Implementation Details

### File: `src/modules/sites/routes/public.api.routes.js`
- New file created with all public API endpoints
- Handles JSONB parsing for content, config, customization
- Error handling with proper status codes
- Logging for debugging

### Registration: `src/routes/index.js`
- Routes registered at `/public/sites`
- Placed after preview routes, before test routes

### JSONB Parsing
- Automatically parses JSONB fields:
  - `page.content` (JSONB)
  - `page.meta_keywords` (JSONB)
  - `template.config` (JSONB)
  - `customization.colors` (JSONB)
  - `customization.fonts` (JSONB)
  - `customization.spacing` (JSONB)

## 🔄 smartstore-app Integration

### Updated Config: `config/api.config.ts`
```typescript
endpoints: {
  getSiteBySlug: (slug: string) => `/public/sites/by-slug/${slug}`,
  getSiteConfig: (id: string) => `/public/sites/${id}/config`,
  getDraftConfig: (id: string) => `/public/sites/${id}/config/draft`,
  getSiteByDomain: (domain: string) => `/public/sites/by-domain/${domain}`,
}
```

### Updated API Client: `lib/config/apiClient.ts`
- Removed Bearer token authentication
- Using optional `X-API-Key` header for service-to-service auth (future)
- Public endpoints work without authentication

## 🧪 Testing

### Test Public Endpoints
```bash
# Test site lookup by slug
curl http://localhost:4050/public/sites/by-slug/test-site

# Test site config
curl http://localhost:4050/public/sites/1/config

# Test draft config (for preview)
curl http://localhost:4050/public/sites/1/config/draft

# Test domain lookup
curl http://localhost:4050/public/sites/by-domain/example.com
```

### Expected Behavior
1. **Active Sites:** Should return data
2. **Draft Sites:** Should return 404 for public config, but work for draft config
3. **Suspended Sites:** Should return 404 for all endpoints
4. **Non-existent Sites:** Should return 404 with proper error message

## ✅ Status

**Implementation:** ✅ Complete
**Testing:** ⚠️ Pending
**Rate Limiting:** ⚠️ TODO
**Documentation:** ✅ Complete

## 🎯 Next Steps

1. **Testing** - Test all endpoints with real data
2. **Rate Limiting** - Add rate limiting middleware
3. **Caching** - Consider caching for frequently accessed sites
4. **Monitoring** - Add metrics for public endpoint usage
5. **Dashboard Integration** - Connect dashboard to use these endpoints


