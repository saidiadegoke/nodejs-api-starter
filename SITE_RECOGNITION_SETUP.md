# Site Recognition Setup - What's Needed

## Current Status: ❌ NOT WORKING

Site recognition is **not working yet** because:

1. **API Authentication Mismatch**: 
   - `smartstore-app` is trying to use `SMARTSTORE_API_KEY` for authentication
   - `smartstore-api` only supports **JWT authentication** (user login tokens)
   - No API key authentication is implemented

2. **Ownership Check Issue**:
   - Current endpoint `/sites/slug/:slug` requires `requireAuth` middleware
   - It checks `site.owner_id !== userId`, meaning only the owner can look up their site
   - `smartstore-app` needs to look up ANY site by slug for public rendering

3. **Missing Public Endpoints**:
   - No public endpoints exist for site lookup
   - Site lookup should be public for rendering purposes

## When Will It Work?

Site recognition will work when **ONE** of the following is implemented:

### Option A: Public Endpoints (RECOMMENDED) ✅

Create public endpoints that don't require authentication:

**Required Endpoints:**
- `GET /public/sites/by-slug/:slug` - Get site by slug (public, no auth)
- `GET /public/sites/:id/config` - Get site config (public, no auth)
- `GET /public/sites/:id/pages` - Get site pages (public, no auth)

**Implementation:**
```javascript
// smartstore-api/src/modules/sites/routes/public.routes.js
router.get('/public/sites/by-slug/:slug', async (req, res) => {
  // No authentication required
  // Only return sites with status === 'active'
  const site = await SiteModel.getSiteBySlug(req.params.slug);
  if (!site || site.status !== 'active') {
    return res.status(404).json({ error: 'Site not found' });
  }
  res.json({ success: true, data: site });
});
```

**Pros:**
- ✅ Clean separation of concerns
- ✅ Better performance (no auth overhead)
- ✅ Easier to cache
- ✅ More secure (only returns active sites)

**Cons:**
- ❌ Need to create new endpoints
- ❌ Need to handle rate limiting

---

### Option B: API Key Authentication ✅

Implement API key authentication for service-to-service requests:

**Implementation:**
```javascript
// smartstore-api/src/shared/middleware/apiKeyAuth.middleware.js
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const validApiKey = process.env.SMARTSTORE_API_KEY;
  
  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  // Attach service account info
  req.service = { type: 'smartstore-app' };
  next();
};
```

**Then modify site lookup to allow service accounts:**
```javascript
// smartstore-api/src/modules/sites/services/site.service.js
static async getSiteBySlug(slug, userId = null, isService = false) {
  const site = await SiteModel.getSiteBySlug(slug);
  if (!site) {
    throw new Error('Site not found');
  }
  
  // If service account, allow access
  if (isService) {
    return site;
  }
  
  // Otherwise, check ownership
  if (site.owner_id !== userId) {
    throw new Error('Unauthorized');
  }
  return site;
}
```

**Pros:**
- ✅ Works with existing endpoints
- ✅ More granular control
- ✅ Can track service requests

**Cons:**
- ❌ Still requires ownership check modification
- ❌ More complex authentication logic
- ❌ API key management needed

---

### Option C: Service Account System ✅

Create a service account system with special permissions:

**Implementation:**
```javascript
// Create service_accounts table
CREATE TABLE service_accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  api_key VARCHAR(255) UNIQUE NOT NULL,
  permissions JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

// Middleware to authenticate service accounts
const serviceAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const service = await ServiceAccountModel.getByApiKey(apiKey);
  
  if (!service) {
    return res.status(401).json({ error: 'Invalid service account' });
  }
  
  req.serviceAccount = service;
  next();
};
```

**Pros:**
- ✅ Most secure and flexible
- ✅ Audit trail for service requests
- ✅ Can have different permissions per service

**Cons:**
- ❌ Most complex to implement
- ❌ Requires database schema changes

---

## Recommended Solution: Option A (Public Endpoints)

**Why?**
- Simplest to implement
- Best performance
- Clear separation of concerns
- Public sites should be publicly accessible anyway

**What to do:**
1. Create public routes in `smartstore-api/src/modules/sites/routes/public.api.routes.js`
2. Add middleware to only return `status === 'active'` sites
3. Add rate limiting for public endpoints
4. Update `smartstore-app` to use new endpoints

---

## Current Issue: SMARTSTORE_API_KEY

**Question:** Is `SMARTSTORE_API_KEY` defined in smartstore-api?

**Answer:** ❌ NO

The environment variable `SMARTSTORE_API_KEY` is:
- ✅ Defined in `smartstore-app` (.env.local)
- ❌ NOT implemented in `smartstore-api`
- ❌ NOT used anywhere in `smartstore-api` code

**What exists:**
- `JWT_SECRET` - For user JWT tokens
- `JWT_REFRESH_SECRET` - For refresh tokens
- No API key authentication system

---

## Next Steps to Fix

### Step 1: Create Public Endpoints (Recommended)

Create file: `smartstore-api/src/modules/sites/routes/public.api.routes.js`

```javascript
const express = require('express');
const router = express.Router();
const SiteModel = require('../models/site.model');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, NOT_FOUND } = require('../../../shared/constants/statusCodes');

// Public endpoint: Get site by slug (no auth required)
router.get('/by-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const site = await SiteModel.getSiteBySlug(slug);
    
    // Only return active sites
    if (!site || site.status !== 'active') {
      return sendError(res, 'Site not found', NOT_FOUND);
    }
    
    // Don't return sensitive information
    const publicSite = {
      id: site.id,
      name: site.name,
      slug: site.slug,
      status: site.status,
      template_id: site.template_id,
      engine_version: site.engine_version,
    };
    
    return sendSuccess(res, publicSite, 'Site retrieved successfully', OK);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
});

// Public endpoint: Get site config (no auth required)
router.get('/:id/config', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get site (must be active)
    const site = await SiteModel.getSiteById(id);
    if (!site || site.status !== 'active') {
      return sendError(res, 'Site not found', NOT_FOUND);
    }
    
    // Get related data
    const [customization, pages, template] = await Promise.all([
      CustomizationModel.getCustomization(site.id),
      PageModel.getSitePages(site.id, { published: true }),
      site.template_id ? TemplateModel.getTemplateById(site.template_id) : null,
    ]);
    
    const config = {
      site,
      customization,
      pages,
      template,
    };
    
    return sendSuccess(res, config, 'Site config retrieved successfully', OK);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
});

module.exports = router;
```

### Step 2: Register Public Routes

In `smartstore-api/src/app.js`:

```javascript
// Add before other routes
const publicSiteRoutes = require('./modules/sites/routes/public.api.routes');
app.use('/public/sites', publicSiteRoutes);
```

### Step 3: Update smartstore-app API Client

In `smartstore-app/config/api.config.ts`:

```typescript
endpoints: {
  // Use public endpoints (no auth needed)
  getSiteBySlug: (slug: string) => `/public/sites/by-slug/${slug}`,
  getSiteConfig: (id: string) => `/public/sites/${id}/config`,
  // ... other endpoints
}
```

### Step 4: Remove API Key Requirement

In `smartstore-app/lib/config/apiClient.ts`:

```typescript
// Remove API key from headers - public endpoints don't need it
this.client = axios.create({
  baseURL: apiConfig.baseUrl,
  timeout: apiConfig.timeout,
  headers: {
    'Content-Type': 'application/json',
    // Remove: ...(apiConfig.apiKey && { 'Authorization': `Bearer ${apiConfig.apiKey}` }),
  },
});
```

---

## Summary

**Current Status:** ❌ Site recognition NOT working

**Blockers:**
1. ❌ No API key authentication in smartstore-api
2. ❌ Site lookup requires JWT auth + ownership check
3. ❌ No public endpoints for site lookup

**Solution:**
1. ✅ Create public endpoints (recommended)
2. ✅ Update smartstore-app to use public endpoints
3. ✅ Test with a site with `status === 'active'`

**After Implementation:**
- ✅ Site recognition will work
- ✅ smartstore-app can look up sites by slug
- ✅ Public sites can be rendered
- ✅ No authentication needed for public rendering


