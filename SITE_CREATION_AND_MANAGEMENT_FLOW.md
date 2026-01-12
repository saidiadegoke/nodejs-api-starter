# Site Creation and Management Flow - Comprehensive Guide

## Overview

This document provides a comprehensive explanation of the relationships between all components involved in creating and managing a site in the SmartStore platform. It identifies the complete flow, dependencies, and any missing pieces.

---

## Architecture Overview

### Core Entities and Relationships

The SmartStore platform follows a hierarchical structure:

```
Template (Reusable Structure)
  └─> Site (Instance with Overrides)
      └─> Pages (Based on Layout)
          └─> Layout (Defines Regions)
              └─> Blocks (Content Elements)
                  └─> Component Templates (React Components)
```

### Entity Definitions

1. **User** → The authenticated user who owns sites
2. **Template** → Reusable pre-built site structures that can be used by many sites
   - Contains default structure, sections, pages, theme defaults
   - Shared across multiple sites
   - Site settings override template defaults
3. **Site** → The primary container for all content (replaces old "Store" concept)
   - Based on a Template (optional)
   - Has its own settings that override template defaults
   - Settings: colors, fonts, logo, SEO, etc.
   - One template can be used by many sites
4. **Page** → Individual pages within a site, created based on a page layout
   - Each page uses a layout (can be block-based)
   - Layout defines regions where blocks can be placed
   - Pages have their own content independent of template
5. **Layout** → Page structure that defines regions for content placement
   - Can be block-based or region-based
   - Defines responsive regions (header, main, sidebar, footer, custom)
   - Supports responsive visibility and ordering
6. **Block** → Content elements placed within layout regions
   - Uses component templates for rendering
   - Contains data, styles, and settings
   - Can be static or dynamic
7. **Component Template** → React components that render blocks
   - Well-defined components: nav bar, hero, features list, subscription form, store list, shopping cart, etc.
   - Provided by smartstore.ng (official components)
   - Can be contributed/sold by third-party developers
   - Backed by React (server-side and client-side rendering)
   - Some are static, some are dynamic (with data/state)
8. **Customization** → Site-level styling that overrides template defaults
   - Colors, fonts, logo
   - SEO settings
   - Site-specific overrides
9. **Custom Domain** → User's own domain name (optional)

---

## Complete Site Creation and Management Flow

### Phase 1: User Registration & Authentication

**Flow:**
```
User Registration → Email/Phone Verification → Login → JWT Tokens → Redux Store
```

**Components:**
- **Frontend:** `app/auth/register/page.tsx`, `app/auth/login/page.tsx`
- **Backend:** `src/modules/auth/routes.js`, `src/modules/auth/controllers/auth.controller.js`
- **State Management:** Redux (`lib/redux/auth-slice.ts`)
- **API Client:** `lib/api/apiService.ts` with interceptors for token refresh

**Status:** ✅ Complete
- Registration with email/phone
- Login with JWT access/refresh tokens
- Redux-based auth state management
- Token refresh on expiry
- Client-side auth checks in dashboard layout

**Missing:** None

---

### Phase 2: Site Creation

**Flow:**
```
Dashboard → Create Site Dialog → Select Template (optional) → POST /sites → Site Created → Navigate to Site Management
```

**Components:**
- **Frontend:** 
  - `app/dashboard/stores/page.tsx` (sites list)
  - `components/sites/CreateSiteDialog.tsx`
  - `app/dashboard/sites/[id]/page.tsx` (site management)
- **Backend:**
  - `src/modules/sites/routes.js` - `POST /sites`
  - `src/modules/sites/controllers/site.controller.js`
  - `src/modules/sites/services/site.service.js`
  - `src/modules/sites/models/site.model.js`

**Database Tables:**
- `sites` - Core site information (name, slug, status, owner_id, template_id, engine_version)
- `site_customization` - Site-level customization (colors, fonts, logo_url)

**Data Structure:**
```javascript
{
  id: string
  name: string
  slug: string
  status: 'active' | 'draft' | 'suspended'
  owner_id: UUID
  template_id: string | null
  primary_domain: string | null
  engine_version: string
  created_at: timestamp
  updated_at: timestamp
}
```

**Status:** ✅ Complete
- Site creation with name and slug
- Optional template selection
- Site management page exists
- Sites list page exists
- ✅ Template application on site creation (template association, customization, and pages)
- ✅ Initial pages created from template when site is created
- ✅ Customization settings copied from template theme
- ✅ Robust error handling for template application failures

---

### Phase 3: Template System

**Flow:**
```
Template Gallery → Select Template → View Template → Create Site from Template → Apply Template Structure (Defaults)
```

**Key Concepts:**
- **Templates are reusable** - One template can be used by many sites
- **Templates provide defaults** - Colors, fonts, structure, page layouts
- **Site settings override template defaults** - Site customization (colors, fonts, SEO) overrides template defaults
- **Template application is one-time initialization** - When a site is created from a template, pages are created but site can diverge independently

**Components:**
- **Frontend:**
  - `app/dashboard/templates/page.tsx` (template gallery)
  - `app/dashboard/templates/[id]/builder/page.tsx` (template builder)
  - `components/templates/TemplateCard.tsx`
- **Backend:**
  - `src/modules/sites/routes/templates.routes.js`
  - `src/modules/sites/controllers/template.controller.js`
  - `src/modules/sites/models/template.model.js`

**Data Structure:**
```javascript
{
  id: string
  name: string
  description: string
  category: string
  config: {
    // Default theme settings (can be overridden by site)
    theme: {
      colors: Record<string, string>  // Default colors
      fonts: Record<string, string>   // Default fonts
    }
    // Page layouts/structures (used as starting point for site pages)
    pages: Array<PageTemplate> {
      slug: string
      title: string
      layout: string  // Layout template ID
      content: {
        blocks?: Array<Block>     // Block-based content
        regions?: Array<LayoutRegion>  // Region-based layout
      }
    }
  }
  thumbnail_url: string
  created_at: timestamp
}
```

**Template → Site Relationship:**
- Template provides **default structure** and **default settings**
- When a site is created from a template:
  1. Site references the template (stored in `sites.template_id`)
  2. Template's pages are created as site pages (initial state)
  3. Template's theme defaults are applied to site customization (can be overridden)
  4. After creation, site can be edited independently (no ongoing link)

**Status:** ✅ Complete
- Template gallery with search/filter
- Template builder with sections, blocks, pages, theme tabs
- Template preview
- Template selection during site creation
- ✅ Template application on site creation (pages and customization defaults)
- ✅ Site settings override template defaults

**Missing:**
- ⚠️ Template update notifications (if template changes, sites aren't notified)
- ⚠️ "Reapply Template" functionality to update site from template (optional feature)

---

### Phase 4: Page Management

**Flow:**
```
Site Management → Pages Tab → Create/Edit Page → Select Layout → Add Blocks to Regions → Configure Blocks → Save
```

**Key Concepts:**
- **Pages are created based on layouts** - Each page uses a layout template (linear, regions, etc.)
- **Layouts define regions** - Header, main, sidebar, footer, custom regions
- **Blocks are placed in regions** - Blocks use component templates for rendering
- **Pages can be block-based or rich text** - Blocks use React components, rich text is HTML

**Components:**
- **Frontend:**
  - `app/dashboard/cms/page.tsx` (CMS page - uses `/sites/` endpoints)
  - `app/dashboard/sites/[id]/page.tsx` (Pages tab)
  - `app/dashboard/sites/[id]/pages/[pageId]/edit/page.tsx` (Rich text editor)
  - `app/dashboard/sites/[id]/pages/[pageId]/blocks/page.tsx` (Block editor with layout)
  - `components/blocks/LayoutSelector.tsx` (Layout template selector)
  - `components/blocks/LayoutRegion.tsx` (Region component)
  - `components/cms/page-editor.tsx` (Page creation modal)
- **Backend:**
  - `src/modules/sites/routes.js` - Page endpoints
  - `src/modules/sites/controllers/page.controller.js`
  - `src/modules/sites/models/page.model.js`
  - `src/modules/sites/services/page.service.js`

**API Endpoints:**
- `GET /sites/:siteId/pages` - Get all pages for a site
- `GET /sites/:siteId/pages/:pageId` - Get page by ID
- `POST /sites/:siteId/pages` - Create new page
- `PUT /sites/:siteId/pages/:pageId` - Update page
- `DELETE /sites/:siteId/pages/:pageId` - Delete page
- `GET /sites/:siteId/pages/:pageId/versions` - Get page versions
- `POST /sites/:siteId/pages/:pageId/versions/:versionId/restore` - Restore version

**Data Structure:**
```javascript
{
  id: string
  site_id: string
  title: string
  slug: string
  content: {
    // Rich text content (HTML)
    html?: string
    
    // Block-based content (linear list)
    blocks?: Array<Block>
    
    // Layout-based content (regions with blocks)
    regions?: Array<LayoutRegion> {
      id: string
      name: string
      type: 'header' | 'main' | 'sidebar' | 'footer' | 'custom'
      blocks: Array<Block>
      responsive?: {
        mobile?: { visible: boolean; order?: number }
        tablet?: { visible: boolean; order?: number }
        desktop?: { visible: boolean; order?: number }
      }
      styles?: {
        backgroundColor?: string
        padding?: string
        maxWidth?: string
      }
    }
  }
  layout?: string  // Layout template ID (linear, regions, etc.)
  meta_description: string
  meta_keywords: string[]
  status: 'draft' | 'published'
  published: boolean
  created_at: timestamp
  updated_at: timestamp
}
```

**Status:** ✅ Mostly Complete
- Page CRUD operations work
- Block-based editor with layouts implemented
- Layout regions system implemented
- Rich text editor (Lexical) implemented
- Page versions (backend support exists)
- ✅ CMS page uses correct `/sites/` endpoints

**Missing:**
- ⚠️ Page version history UI not implemented in frontend
- ⚠️ Page duplication endpoint doesn't exist (currently done client-side)
- ⚠️ Layout templates not stored/managed separately (currently hardcoded in frontend)

---

### Phase 5: Customization

**Flow:**
```
Site Management → Customization Tab → Color/Font/Logo Customization → Save → Customization Applied
```

**Components:**
- **Frontend:**
  - `app/dashboard/sites/[id]/customize/page.tsx`
  - `components/customization/ColorCustomizer.tsx`
  - `components/customization/FontSelector.tsx`
  - `components/customization/LogoUploader.tsx`
  - `components/customization/LivePreview.tsx`
- **Backend:**
  - `src/modules/sites/routes/customization.routes.js`
  - `src/modules/sites/controllers/customization.controller.js`
  - `src/modules/sites/services/customization.service.js`
  - `src/modules/sites/models/customization.model.js`

**API Endpoints:**
- `GET /sites/:siteId/customization` - Get customization settings
- `PUT /sites/:siteId/customization` - Update customization settings
- `POST /sites/:siteId/customization/reset` - Reset to defaults

**Data Structure:**
```javascript
{
  site_id: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
    textSecondary: string
  }
  fonts: {
    heading: string
    body: string
    button: string
  }
  logo_url: string | null
  spacing: JSON | null
  updated_at: timestamp
}
```

**Status:** ✅ Complete
- Color customization with custom color picker
- Font selection with Google Fonts
- Logo upload via files API
- Live preview
- Customization saved correctly

**Missing:**
- ⚠️ Logo not displaying when loaded from API (fixed - field name mismatch)
- ⚠️ Template customization not automatically applied when template selected

---

### Phase 6: Preview System

**Flow:**
```
Site Management → Preview Button → Preview Service → Render HTML with Customization → Display in Iframe
```

**Rendering Pipeline:**
1. **Load Site Data** - Site, pages, customization, template (if any)
2. **Apply Site Customization** - Override template defaults with site settings
3. **Render Page Layout** - Layout regions or linear blocks
4. **Render Blocks** - Each block uses component template
5. **Generate HTML** - Full HTML with styles, scripts, meta tags
6. **Return HTML** - Send to frontend for preview

**Components:**
- **Frontend:**
  - `app/dashboard/sites/[id]/preview/page.tsx`
  - `components/preview/PreviewFrame.tsx` (if exists)
- **Backend:**
  - `src/modules/sites/routes.js` - Preview routes
  - `src/modules/sites/controllers/preview.controller.js`
  - `src/modules/sites/services/preview.service.js`
  - `src/modules/sites/services/blockRenderer.service.js`

**API Endpoints:**
- `GET /sites/preview/:siteId` - Preview entire site (homepage)
- `GET /sites/preview/:siteId/:pageId` - Preview specific page
- **Note:** Preview endpoints are public (no auth required)

**Current Implementation:**
- ✅ Preview service generates full HTML
- ✅ Block renderer renders blocks/regions as HTML strings
- ✅ Tailwind CSS included
- ✅ Customization applied (colors, fonts, logo)
- ✅ Template sections rendered (if template exists)
- ✅ Site settings override template defaults

**Gap:** ⚠️ **CRITICAL**
- Blocks are rendered as HTML strings, not React components
- No React SSR for component templates
- Dynamic components can't work (no client-side JavaScript)
- Component interactivity is lost in preview

**Missing:**
- ❌ **CRITICAL:** React SSR service for component templates
- ❌ **CRITICAL:** Client-side hydration for dynamic components
- ❌ Component template React rendering (currently HTML strings)
- ⚠️ Device selector UI (desktop/tablet/mobile) not fully implemented
- ⚠️ Preview iframe may need responsive adjustments
- ⚠️ Preview doesn't support dynamic component state

---

### Phase 7: Site Status Management

**Flow:**
```
Site Management → Settings Tab → Status Toggle → Confirmation → Update Status → Status History Recorded
```

**Components:**
- **Frontend:**
  - `app/dashboard/sites/[id]/page.tsx` (Settings tab)
  - `components/sites/StatusToggle.tsx`
- **Backend:**
  - `src/modules/sites/routes/status.routes.js`
  - `src/modules/sites/controllers/status.controller.js`
  - `src/modules/sites/services/status.service.js`
  - `src/modules/sites/models/status.model.js`

**API Endpoints:**
- `GET /sites/:siteId/status` - Get current status
- `PUT /sites/:siteId/status` - Update status
- `GET /sites/:siteId/status/history` - Get status history

**Database Tables:**
- `sites` - Contains `status` field
- `site_status_history` - Tracks status changes ⚠️ **MIGRATION NEEDED**

**Status:** ✅ Backend Complete, ⚠️ Frontend Complete, ❌ Migration Missing
- Status toggle UI exists
- Backend endpoints exist
- Status history tracking exists

**Missing:**
- ❌ **CRITICAL:** `site_status_history` table migration not run (404 error on status update)
- ⚠️ Status history UI not implemented in frontend

---

### Phase 8: Engine Versioning

**Flow:**
```
Site Management → Engine Tab → View Current Version → Select New Version → Update → Version History Recorded
```

**Components:**
- **Frontend:**
  - `app/dashboard/sites/[id]/page.tsx` (Engine tab - inline)
  - `components/engine/VersionCard.tsx`
  - `components/engine/UpdateDialog.tsx`
  - `components/engine/RollbackDialog.tsx`
  - `components/engine/VersionHistory.tsx`
- **Backend:**
  - `src/modules/engine/routes.js`
  - `src/modules/engine/controllers/engine.controller.js`
  - `src/modules/engine/services/engine.service.js`

**Status:** ✅ Complete
- Engine version management UI exists
- Update and rollback functionality
- Version history display
- Engine tab shows inline (no navigation)

**Missing:** None

---

### Phase 9: Multi-Tenant Routing & Public Site Serving

**Flow:**
```
User visits subdomain/custom domain → Hostname Extraction → Site Lookup → Status Check → Load Engine → Render Site → Return HTML
```

**Rendering Pipeline (Public):**
1. **Extract Hostname** - Get subdomain or custom domain from request
2. **Lookup Site** - Find site by subdomain or custom domain
3. **Check Status** - Verify site is active (draft/suspended sites handled differently)
4. **Load Engine** - Load site's engine version (default v1.0.0)
5. **Render Site** - Use engine to render site/homepage
6. **Return HTML** - Send rendered HTML to client

**Components:**
- **Backend:**
  - `src/modules/sites/middleware/hostnameExtractor.js` (Extract hostname from request)
  - `src/modules/sites/middleware/siteRouter.js` (Site lookup and routing)
  - `src/modules/sites/routes/public.routes.js` (Public routes for site serving)
  - `src/modules/sites/services/siteRenderer.service.js` (Site rendering service)
  - `src/modules/sites/services/engineLoader.service.js` (Engine version loader)
  - `src/app.js` (Multi-tenant routing middleware)

**Public Routes:**
- `GET /` - Homepage (via subdomain/custom domain)
- `GET /:pageSlug` - Page routes (via subdomain/custom domain)
- **Note:** These routes are accessed via subdomain or custom domain, not `/sites/` prefix

**Rendering Flow:**
```
Request (subdomain.example.com) 
  → siteRouter middleware (extracts hostname, finds site)
  → public.routes.js (handles / and /:pageSlug)
  → SiteRendererService.renderSite() or renderPage()
  → EngineLoaderService.loadEngine() (loads site's engine version)
  → Engine.renderSite() or renderPage() (renders using engine)
  → Returns HTML
```

**Current Implementation:**
- ✅ Hostname extraction works
- ✅ Site lookup by subdomain or custom domain
- ✅ Status checking (active/draft/suspended)
- ✅ Public route handler exists
- ✅ Engine versioning support
- ✅ Fallback to PreviewService if engine fails

**Gap:** ⚠️ **CRITICAL**
- Blocks are rendered as HTML strings, not React components
- No React SSR for component templates in production
- Dynamic components can't work (no client-side JavaScript)
- Component interactivity is lost in production

**Missing:**
- ❌ **CRITICAL:** React SSR service for component templates in production
- ❌ **CRITICAL:** Client-side JavaScript bundle for dynamic components
- ❌ **CRITICAL:** Component hydration on client-side
- ❌ Component template React rendering (currently HTML strings)
- ⚠️ Custom domain verification UI not implemented
- ⚠️ SSL certificate management UI not implemented
- ⚠️ Custom domain DNS verification not implemented
- ⚠️ Dynamic component state management in production

---

### Phase 10: Block-Based Builder

**Flow:**
```
Page Editor → Switch to Block Editor → Layout Selector → Add Blocks → Select Component Template → Configure Blocks → Reorder → Save
```

**Key Concepts:**
- **Blocks use component templates** - Each block type maps to a React component template
- **Component templates are React components** - Nav bar, hero, features, forms, cart, etc.
- **Component templates provided by smartstore.ng** - Official components
- **Third-party component templates** - Developers can contribute and sell components
- **Static and dynamic components** - Some components are static, some are dynamic (with data/state)
- **Blocks are rendered server-side** - Component templates are rendered to HTML on the server

**Components:**
- **Frontend:**
  - `components/blocks/BlockLibrary.tsx` (Block selector)
  - `components/blocks/BlockList.tsx` (Block list with reordering)
  - `components/blocks/BlockConfigPanel.tsx` (Block configuration)
  - `components/blocks/BlockRenderer.tsx` (Client-side React rendering)
  - `components/blocks/LayoutSelector.tsx` (Layout template selector)
  - `components/blocks/LayoutRegion.tsx` (Region component)
  - `components/blocks/RegionConfigPanel.tsx` (Region configuration)
  - `lib/blocks/blockRegistry.ts` (Block type registry)
  - `lib/blocks/layoutRegistry.ts` (Layout template registry)
  - `components/blocks/types/[BlockType].tsx` (React components for each block type)
- **Backend:**
  - `src/modules/sites/services/blockRenderer.service.js` (Server-side HTML rendering)

**Block Structure:**
```javascript
{
  id: string
  type: BlockType  // Maps to component template
  data: Record<string, any>  // Data for component template
  styles?: Record<string, any>  // Inline styles
  settings?: Record<string, any>  // Component settings
  order: number
  regionId?: string  // Which region this block belongs to
}

// Block types map to component templates
type BlockType = 
  | 'hero'        // HeroSection component
  | 'text'        // TextBlock component
  | 'image'       // ImageBlock component
  | 'gallery'     // GalleryBlock component
  | 'features'    // FeaturesBlock component
  | 'testimonials' // TestimonialsBlock component
  | 'cta'         // CTABlock component
  | 'form'        // FormBlock component
  | 'video'       // VideoBlock component
  | 'code'        // CodeBlock component
  | 'spacer'      // SpacerBlock component
  | 'divider'     // DividerBlock component
  | 'nav'         // NavBar component
  | 'cart'        // ShoppingCart component
  | 'product-list' // ProductList component
  // ... more component templates
```

**Component Template System:**
- **Official Components** (smartstore.ng):
  - Basic: hero, text, image, gallery, video, code
  - Marketing: features, testimonials, cta, form
  - E-commerce: product-list, product-card, cart, checkout
  - Navigation: nav-bar, breadcrumb, pagination
  - Utility: spacer, divider, container
  
- **Third-Party Components** (future):
  - Component marketplace
  - Developer contribution system
  - Component versioning
  - Component licensing

**Status:** ✅ Partially Complete
- Block registry with block types ✅
- Layout regions system ✅
- Drag-and-drop reordering ✅
- Block configuration panels ✅
- Frontend React rendering ✅
- Backend HTML rendering ✅ (but uses string templates, not React)
- Integration into template builder ✅
- Integration into page editor ✅

**Missing:**
- ❌ **CRITICAL:** Component templates are rendered as HTML strings, not React components
- ❌ **CRITICAL:** Server-side rendering doesn't use actual React components
- ❌ Component template marketplace system (contribution, licensing)
- ❌ Component template versioning
- ❌ Dynamic component state management (for dynamic components)
- ❌ Component template preview system
- ❌ Third-party component integration

**Gap Analysis:**
The current implementation renders blocks as HTML strings on the server (`blockRenderer.service.js`). This works but doesn't leverage React components. For a true component template system:
1. Component templates should be React components
2. Server-side rendering should use React SSR (renderToString/hydrate)
3. Client-side hydration should work with server-rendered HTML
4. Dynamic components need state management
5. Component marketplace needs component storage, versioning, licensing

---

### Phase 11: Component Templates

**Flow:**
```
Component Library → Select Component Template → Configure → Add to Block → Render
```

**Key Concepts:**
- **Component templates are React components** - Well-defined React components
- **Provided by smartstore.ng** - Official component library
- **Third-party contributions** - Developers can contribute and sell
- **Static and dynamic** - Some are static (text, image), some are dynamic (cart, forms)
- **Server-side and client-side rendering** - Components should work both ways

**Components:**
- **Frontend:**
  - `components/blocks/types/[BlockType].tsx` (React components)
  - Component library UI (not yet implemented)
  - Component marketplace UI (not yet implemented)
- **Backend:**
  - Component template storage (not yet implemented)
  - Component template registry (not yet implemented)
  - React SSR service (not yet implemented)

**Component Template Structure:**
```typescript
interface ComponentTemplate {
  id: string
  name: string
  type: BlockType
  category: 'basic' | 'marketing' | 'ecommerce' | 'navigation' | 'utility'
  version: string
  provider: 'smartstore' | 'third-party' | 'user'
  author?: string
  license?: string
  price?: number  // For marketplace components
  reactComponent: React.ComponentType<ComponentProps>
  defaultData: Record<string, any>
  defaultStyles?: Record<string, any>
  defaultSettings?: Record<string, any>
  schema: ZodSchema  // For validation
  isDynamic: boolean  // Whether component has state/interactivity
  requiresAuth?: boolean  // Whether component requires authentication
  dependencies?: string[]  // Other components this depends on
}

interface ComponentProps {
  data: Record<string, any>
  styles?: Record<string, any>
  settings?: Record<string, any>
  siteId?: string
  site?: Site
  customization?: Customization
}
```

**Status:** ❌ Not Implemented
- Current blocks are rendered as HTML strings
- No React component template system
- No component marketplace
- No component versioning
- No SSR for React components

**Missing:**
- ❌ **CRITICAL:** React SSR service for component templates
- ❌ Component template registry and storage
- ❌ Component marketplace system
- ❌ Component versioning system
- ❌ Component licensing system
- ❌ Third-party component contribution system
- ❌ Component template preview system
- ❌ Dynamic component state management

---

## Critical Missing Pieces

### 1. React Component Template System ❌ **CRITICAL**

**Problem:** Blocks are currently rendered as HTML strings, not React components. This prevents:
- Dynamic component functionality (interactivity, state management)
- Third-party component integration
- Component marketplace
- Proper SSR with React hydration

**Current Implementation:**
- Blocks rendered as HTML strings in `blockRenderer.service.js`
- No React SSR
- No client-side JavaScript for dynamic components
- Component interactivity is lost

**What Should Happen:**
1. Component templates are React components (not HTML strings)
2. Server-side rendering uses React SSR (`renderToString` or `renderToPipeableStream`)
3. Client-side hydration for dynamic components
4. Component registry stores React components
5. Marketplace allows third-party components

**Fix Required:**
- Implement React SSR service for component templates
- Convert block renderer to use React components
- Add client-side JavaScript bundle for dynamic components
- Implement component hydration on client-side
- Create component template registry system
- Add component marketplace infrastructure

**Files to Create/Update:**
- `smartstore-api/src/modules/components/` - Component template system
- `smartstore-api/src/modules/components/services/reactSSR.service.js` - React SSR service
- `smartstore-api/src/modules/components/models/componentTemplate.model.js` - Component storage
- `smartstore-api/src/modules/sites/services/blockRenderer.service.js` - Update to use React SSR
- `smartstore-api/src/modules/sites/services/preview.service.js` - Update to use React SSR
- `smartstore-api/src/modules/sites/services/siteRenderer.service.js` - Update to use React SSR

**Priority:** CRITICAL - Blocks core functionality

---

### 2. Component Template Registry & Marketplace ❌ **HIGH PRIORITY**

**Problem:** No system to manage, store, version, or sell component templates.

**What Should Happen:**
1. Component templates stored in database/registry
2. Versioning for component templates
3. Marketplace for third-party components
4. Licensing system for paid components
5. Component discovery and search

**Fix Required:**
- Create component template registry database table
- Implement component versioning
- Build component marketplace UI
- Add component licensing system
- Create component contribution system

**Priority:** HIGH - Enables third-party ecosystem

---

### 3. Site Status History Migration ❌ **CRITICAL** ✅ **FIXED**

**Problem:** `site_status_history` table doesn't exist, causing 404 errors when updating site status.

**Status:** ✅ **FIXED** - Migration has been run, table exists

**Fix Required:**
- ✅ Run migration: `004_add_site_status_history.sql` - DONE

---

### 4. Template Application on Site Creation ✅ **FIXED**

**Problem:** When a user selects a template during site creation, the template's structure is not automatically applied.

**Status:** ✅ **FIXED** - Template application implemented

**What Happens Now:**
1. ✅ User creates site with template_id
2. ✅ System copies template's pages to site
3. ✅ System copies template's customization settings (as defaults)
4. ✅ System copies template's block/region structure
5. ✅ Site is ready to use with template content

**Note:** Site settings override template defaults (as designed)

---

### 3. CMS Page API Endpoints Mismatch ⚠️ **HIGH PRIORITY**

**Problem:** CMS page uses `/cms/stores/` endpoints which don't exist. Should use `/sites/` endpoints.

**Current Endpoints (Wrong):**
- `GET /cms/stores/:storeId`
- `GET /cms/stores/:storeId/pages`
- `POST /cms/stores/:storeId/pages`
- `PUT /cms/stores/:storeId/pages/:pageId`
- `DELETE /cms/stores/:storeId/pages/:pageId`

**Correct Endpoints:**
- `GET /sites/:siteId`
- `GET /sites/:siteId/pages`
- `POST /sites/:siteId/pages`
- `PUT /sites/:siteId/pages/:pageId`
- `DELETE /sites/:siteId/pages/:pageId`

**Status:** ✅ **FIXED** - Updated CMS page to use correct endpoints

---

### 4. Page Creation from Template Structure ⚠️ **MEDIUM PRIORITY**

**Problem:** When a site is created from a template, the template's pages are not automatically created as site pages.

**What Should Happen:**
- Template has pages defined in `template.config.pages`
- When site is created with template, these pages should be created as actual `pages` records
- Each page should have content from template's page definition

**Fix Required:**
- In `SiteService.createSite()`, after creating site:
  - Load template
  - For each page in `template.config.pages`:
    - Create page record in `pages` table
    - Copy page content (blocks/regions or HTML)
    - Set page status to 'draft'

---

### 5. Template Customization Copy ⚠️ **MEDIUM PRIORITY**

**Problem:** When a template is selected, its customization settings (colors, fonts) are not copied to the site.

**What Should Happen:**
- Template has `config.theme` with colors and fonts
- When site is created with template, create `site_customization` record with template's theme
- Logo might be copied or left empty for user to upload

**Fix Required:**
- In `SiteService.createSite()`, after creating site:
  - If template has `config.theme`:
    - Create site_customization record
    - Copy colors and fonts from template.theme

---

### 6. Page Version History UI ⚠️ **LOW PRIORITY**

**Problem:** Backend supports page versioning, but frontend UI doesn't exist.

**Status:** Backend complete, frontend missing

**Fix Required:**
- Create version history component
- Display versions in page editor
- Add "Restore Version" functionality

---

### 7. Custom Domain Management ⚠️ **MEDIUM PRIORITY**

**Problem:** Custom domain functionality is partially implemented but missing UI and verification.

**Current Status:**
- Site model supports `primary_domain` field
- Backend can store custom domain
- DNS verification not implemented
- SSL certificate provisioning not implemented

**Fix Required:**
- Custom domain management UI
- DNS verification process
- SSL certificate management (Cloudflare integration)
- Domain status tracking

---

### 8. Site Templates Association ⚠️ **MEDIUM PRIORITY**

**Problem:** Sites can reference templates, but the relationship is not fully utilized.

**Current State:**
- `sites.template_id` field exists
- Template can be selected during site creation
- Template structure not automatically applied

**Fix Required:**
- Implement template application on site creation (see #1)
- Add "Reapply Template" functionality to update site from template
- Template update notifications if template changes

---

## Data Flow Diagrams

### Site Creation Flow (Current vs. Ideal)

**Current Flow:**
```
1. User clicks "Create Site"
2. Enters site name and slug
3. Optionally selects template
4. Site created with template_id stored
5. Site management page opens
6. User manually creates pages, customization, etc.
```

**Ideal Flow:**
```
1. User clicks "Create Site"
2. Enters site name and slug
3. Selects template (or creates empty site)
4. Site created
5. If template selected:
   a. Template pages copied to site pages
   b. Template customization applied to site
   c. Template blocks/regions copied to pages
6. Site management page opens with pre-populated content
7. User can customize and publish
```

---

### Page Editing Flow

**Current Flow:**
```
1. Navigate to site management → Pages tab
2. Click "Create Page" or edit existing
3. Use CMS modal (old endpoints) OR
4. Navigate to /sites/:id/pages/:pageId/edit (rich text) OR
5. Navigate to /sites/:id/pages/:pageId/blocks (block editor)
6. Edit content
7. Save → API call → Page updated
8. Preview available
```

**Issues:**
- CMS page uses wrong endpoints (fixed)
- Page creation doesn't support template selection properly
- No unified page creation flow

---

### Customization Flow

**Current Flow:**
```
1. Navigate to site management → Customization tab OR
2. Navigate to /sites/:id/customize
3. Customize colors, fonts, logo
4. Save → PUT /sites/:id/customization
5. Customization applied
6. Live preview updates
```

**Status:** ✅ Complete and working

---

### Preview Flow

**Current Flow:**
```
1. Click Preview button from site management OR
2. Navigate to /sites/:id/preview
3. GET /sites/:id/preview API call
4. Backend generates HTML with:
   - Site customization (colors, fonts, logo)
   - Page content (blocks/regions or HTML)
   - Tailwind CSS
   - Template sections (if any)
5. HTML returned and displayed in preview
```

**Status:** ✅ Complete

---

## Integration Points

### 1. Site ↔ Template Relationship

**Current:** One-way (site references template)
**Ideal:** Bi-directional with versioning

**Improvements Needed:**
- Template changes should notify affected sites
- Option to "Update from Template" in site management
- Template versioning to track changes

---

### 2. Site ↔ Pages Relationship

**Current:** One-to-many (site has many pages)
**Status:** ✅ Working correctly

**Missing:**
- Page hierarchy (parent/child pages)
- Page ordering/custom order
- Home page designation

---

### 3. Site ↔ Customization Relationship

**Current:** One-to-one (site has one customization)
**Status:** ✅ Working correctly

**Missing:** None

---

### 4. Pages ↔ Blocks/Regions Relationship

**Current:** Pages can have blocks or regions
**Status:** ✅ Working correctly

**Missing:** None

---

### 5. Template ↔ Pages Relationship

**Current:** Template defines pages in config
**Status:** ⚠️ Partially working

**Missing:**
- Pages from template not automatically created for site
- Template page editing not fully integrated

---

## Component Template Architecture

### Current vs. Ideal Architecture

**Current Architecture (HTML Strings):**
```
Block → BlockRendererService → HTML String → Sent to Client
```
- Blocks are rendered as HTML strings
- No React components
- No interactivity
- No dynamic state management

**Ideal Architecture (React Components):**
```
Block → Component Template Registry → React Component → React SSR → HTML + JavaScript Bundle → Client Hydration
```
- Blocks use React component templates
- Server-side rendering with React SSR
- Client-side hydration for dynamic components
- Full interactivity support

### Component Template System Requirements

**1. Component Template Registry**
```typescript
interface ComponentTemplate {
  id: string
  name: string
  type: BlockType
  category: 'basic' | 'marketing' | 'ecommerce' | 'navigation' | 'utility'
  version: string
  provider: 'smartstore' | 'third-party' | 'user'
  author?: string
  license?: 'MIT' | 'Commercial' | 'Custom'
  price?: number
  reactComponent: React.ComponentType<ComponentProps>
  defaultData: Record<string, any>
  defaultStyles?: Record<string, any>
  defaultSettings?: Record<string, any>
  schema: ZodSchema
  isDynamic: boolean
  requiresAuth?: boolean
  dependencies?: string[]
  createdAt: timestamp
  updatedAt: timestamp
}
```

**2. React SSR Service**
- Server-side rendering using `react-dom/server`
- Support for `renderToString` (sync) or `renderToPipeableStream` (async)
- Inject site customization and props
- Generate HTML with component output
- Bundle JavaScript for client-side hydration

**3. Client-Side Hydration**
- JavaScript bundle for dynamic components
- Hydration on client-side using `react-dom/client`
- State management for dynamic components
- Event handlers for interactivity

**4. Component Marketplace**
- Component storage and versioning
- Licensing system (MIT, Commercial, Custom)
- Payment integration for paid components
- Developer contribution portal
- Component discovery and search

### Rendering Pipeline (Ideal)

**Server-Side Rendering:**
```
1. Load Site Data (site, pages, customization, template)
2. Apply Site Customization (override template defaults)
3. Load Page Layout (regions or linear blocks)
4. For each Block:
   a. Load Component Template from Registry
   b. Prepare Props (data, styles, settings, site, customization)
   c. Render Component with React SSR
   d. Generate HTML + Script Tags
5. Bundle JavaScript for Client-Side Hydration
6. Generate Full HTML Document
7. Return HTML + JavaScript Bundle
```

**Client-Side Hydration:**
```
1. Load JavaScript Bundle
2. Hydrate React Components on Client
3. Initialize State for Dynamic Components
4. Attach Event Handlers
5. Enable Interactivity
```

---

## API Endpoint Mapping

### Sites API (Authenticated)
- `GET /sites` - Get user's sites ✅
- `POST /sites` - Create site ✅
- `GET /sites/:id` - Get site by ID ✅
- `PUT /sites/:id` - Update site ✅
- `DELETE /sites/:id` - Delete site ✅
- `GET /sites/:id/pages` - Get site pages ✅
- `POST /sites/:id/pages` - Create page ✅
- `GET /sites/:id/pages/:pageId` - Get page ✅
- `PUT /sites/:id/pages/:pageId` - Update page ✅
- `DELETE /sites/:id/pages/:pageId` - Delete page ✅
- `GET /sites/:id/customization` - Get customization ✅
- `PUT /sites/:id/customization` - Update customization ✅
- `GET /sites/:id/status` - Get status ✅
- `PUT /sites/:id/status` - Update status ✅
- `GET /sites/:id/status/history` - Get status history ✅

### Preview API (Public - No Auth)
- `GET /preview/:siteId` - Preview entire site (homepage) ✅
  - **Route:** `/preview/:siteId` (separate from `/sites/` prefix)
  - **Service:** `PreviewService.renderSite()`
  - **Current:** Returns HTML string (blocks rendered as HTML via `BlockRendererService`)
  - **Required:** Should use React SSR for component templates
  - **Gap:** ❌ No React SSR, blocks are HTML strings, no client-side JavaScript
  
- `GET /preview/:siteId/:pageId` - Preview specific page ✅
  - **Route:** `/preview/:siteId/:pageId` (separate from `/sites/` prefix)
  - **Service:** `PreviewService.renderPage()`
  - **Current:** Returns HTML string (blocks rendered as HTML via `BlockRendererService`)
  - **Required:** Should use React SSR for component templates
  - **Gap:** ❌ No React SSR, blocks are HTML strings, no client-side JavaScript

### Public Site Serving (Multi-Tenant Routing)
- `GET /` - Homepage (via subdomain/custom domain) ✅
  - **Route:** `public.routes.js` - `/`
  - **Middleware:** `siteRouter.js` (extracts hostname, finds site)
  - **Service:** `SiteRendererService.renderSite()`
  - **Engine:** Loads site's engine version, renders using engine
  - **Current:** HTML string rendering (blocks as HTML)
  - **Required:** React SSR for component templates
  - **Gap:** No React SSR, no client-side JavaScript bundle
  
- `GET /:pageSlug` - Page routes (via subdomain/custom domain) ✅
  - **Route:** `public.routes.js` - `/:pageSlug`
  - **Middleware:** `siteRouter.js` (extracts hostname, finds site)
  - **Service:** `SiteRendererService.renderPage()`
  - **Engine:** Loads site's engine version, renders using engine
  - **Current:** HTML string rendering (blocks as HTML)
  - **Required:** React SSR for component templates
  - **Gap:** No React SSR, no client-side JavaScript bundle

### Component Templates API (Not Yet Implemented)
- `GET /components` - Get all component templates ❌
- `GET /components/:id` - Get component template by ID ❌
- `GET /components/marketplace` - Browse marketplace ❌
- `POST /components` - Create component template ❌
- `PUT /components/:id` - Update component template ❌
- `DELETE /components/:id` - Delete component template ❌
- `POST /components/:id/versions` - Create new version ❌
- `GET /components/:id/versions` - Get version history ❌

### Templates API
- `GET /templates` - Get all templates ✅
- `GET /templates/:id` - Get template by ID ✅
- `POST /templates` - Create template ✅
- `PUT /templates/:id` - Update template ✅
- `DELETE /templates/:id` - Delete template ✅
- `GET /templates/:id/preview` - Preview template ✅

### Engine API
- `GET /sites/:id/engine` - Get engine version ✅
- `PUT /sites/:id/engine` - Update engine version ✅
- `POST /sites/:id/engine/rollback` - Rollback version ✅
- `GET /sites/:id/engine/history` - Get version history ✅

---

## Frontend Route Structure

### Site Management Routes
- `/dashboard/stores` - Sites list ✅
- `/dashboard/sites/[id]` - Site management (tabs: Settings, Engine, Pages, Customization) ✅
- `/dashboard/sites/[id]/pages/[pageId]/edit` - Rich text page editor ✅
- `/dashboard/sites/[id]/pages/[pageId]/blocks` - Block-based page editor ✅
- `/dashboard/sites/[id]/customize` - Customization page ✅
- `/dashboard/sites/[id]/preview` - Preview page ✅

### Template Routes
- `/dashboard/templates` - Template gallery ✅
- `/dashboard/templates/[id]/builder` - Template builder ✅
- `/dashboard/templates/[id]/pages/[pageSlug]/edit` - Template page editor ✅

### CMS Route (Legacy/Alternative)
- `/dashboard/cms?siteId=:id` - CMS page (pages, themes, settings tabs) ⚠️ Fixed to use correct endpoints

---

## Database Schema Relationships

```
users
  └─> sites (owner_id)
      ├─> pages (site_id)
      │   └─> page_versions (page_id) [if versioning enabled]
      ├─> site_customization (site_id)
      ├─> site_status_history (site_id)
      └─> site_engine_versions (site_id)
      
templates
  └─> template_config (JSONB)
      ├─> sections (Array)
      ├─> pages (Array<PageTemplate>)
      ├─> theme (ThemeConfig)
      ├─> blocks (Array<Block>) [optional]
      └─> regions (Array<LayoutRegion>) [optional]
```

**Relationships:**
- `sites.template_id` → `templates.id` (Foreign key)
- `pages.site_id` → `sites.id` (Foreign key)
- `site_customization.site_id` → `sites.id` (Foreign key)
- `site_status_history.site_id` → `sites.id` (Foreign key)
- `site_status_history.changed_by` → `users.id` (Foreign key)

---

## Architecture Gaps & Missing Integrations

### 1. React Component Template System ❌ **CRITICAL**
**Status:** ❌ Not implemented (blocks are HTML strings)
**Impact:** CRITICAL - Blocks are static, no interactivity, no third-party components, no marketplace
**Gap:** Current implementation renders blocks as HTML strings instead of React components

### 2. Server-Side Rendering (SSR) for React Components ❌ **CRITICAL**
**Status:** ❌ Not implemented
**Impact:** CRITICAL - Can't render React components on server, dynamic components don't work
**Gap:** No React SSR service, blocks are rendered as HTML strings

### 3. Client-Side Hydration ❌ **CRITICAL**
**Status:** ❌ Not implemented
**Impact:** CRITICAL - Dynamic components can't work, no interactivity in production
**Gap:** No client-side JavaScript bundle, no hydration system

### 4. Component Template Registry ❌ **HIGH PRIORITY**
**Status:** ❌ Not implemented
**Impact:** HIGH - No way to store, version, or manage component templates
**Gap:** Component templates are hardcoded in frontend, no database/registry

### 5. Component Marketplace ❌ **HIGH PRIORITY**
**Status:** ❌ Not implemented
**Impact:** HIGH - Can't enable third-party developer ecosystem
**Gap:** No marketplace infrastructure, no licensing system, no payment integration

### 6. Template → Site Initialization ✅ **FIXED**
**Status:** ✅ Implemented
**Impact:** Previously high, now resolved

### 7. Status History Migration ✅ **FIXED**
**Status:** ✅ Migration run, table exists
**Impact:** Previously critical, now resolved

### 8. Custom Domain Verification ⚠️ **MEDIUM PRIORITY**
**Status:** ❌ Not implemented
**Impact:** Medium - Custom domains can't be verified
**Gap:** No DNS verification, no domain verification UI

### 9. SSL Certificate Management ⚠️ **MEDIUM PRIORITY**
**Status:** ❌ Not implemented
**Impact:** Medium - HTTPS not automatically configured for custom domains
**Gap:** No SSL certificate provisioning, no Cloudflare/Let's Encrypt integration

### 10. Page Version History UI ⚠️ **LOW PRIORITY**
**Status:** ❌ Frontend missing
**Impact:** Low - Backend supports it but users can't access it
**Gap:** No UI for viewing/restoring page versions

---

## Recommendations

### Immediate Fixes (Priority 1 - CRITICAL)
1. **Implement React Component Template System** - Blocks must use React components, not HTML strings
2. **Implement React SSR Service** - Server-side rendering for React component templates
3. **Implement Client-Side Hydration** - JavaScript bundle for dynamic components, hydration system
4. **Create Component Template Registry** - Database/registry for component templates

**Why Critical:**
- Current implementation renders blocks as HTML strings, losing all interactivity
- Dynamic components (forms, cart, etc.) can't work
- Third-party component marketplace is impossible
- Component templates are hardcoded in frontend

### Short-term Improvements (Priority 2 - HIGH)
1. **Component Marketplace Infrastructure** - Storage, versioning, licensing, payment
2. **Component Contribution System** - Developer portal for submitting components
3. **Component Versioning System** - Version management for component templates
4. **Dynamic Component State Management** - State management for dynamic components

### Medium-term Enhancements (Priority 3 - MEDIUM)
1. **Custom Domain Verification UI** - DNS verification, domain management
2. **SSL Certificate Management** - Cloudflare/Let's Encrypt integration
3. **Page Version History UI** - Display and restore page versions
4. **Template Update Notifications** - Notify users when template updates

### Long-term Enhancements (Priority 4 - LOW)
1. **Site Cloning** - Allow users to duplicate sites
2. **Bulk Operations** - Bulk page operations (publish, delete, etc.)
3. **Component Analytics** - Track component usage and performance
4. **Component A/B Testing** - Test different component versions

---

## Testing Checklist

### Site Creation Flow
- [ ] Create site without template
- [ ] Create site with template
- [ ] Verify pages are created from template
- [ ] Verify customization is copied from template
- [ ] Verify site appears in sites list
- [ ] Verify navigation to site management works

### Page Management Flow
- [ ] Create page via CMS modal
- [ ] Create page via site management
- [ ] Edit page with rich text editor
- [ ] Edit page with block editor
- [ ] Save page changes
- [ ] Verify page persists after refresh
- [ ] Delete page
- [ ] Duplicate page

### Customization Flow
- [ ] Update colors
- [ ] Update fonts
- [ ] Upload logo
- [ ] Verify customization saves
- [ ] Verify customization persists
- [ ] Verify preview updates

### Status Management Flow
- [ ] Toggle site status (active/draft/suspended)
- [ ] Verify status history is recorded
- [ ] Verify status change requires confirmation
- [ ] Verify status change persists

---

## Executive Summary

### Architecture Hierarchy
```
Template (Reusable Structure)
  └─> Site (Instance with Overrides)
      └─> Pages (Based on Layout)
          └─> Layout (Defines Regions)
              └─> Blocks (Content Elements)
                  └─> Component Templates (React Components)
```

### Key Principles
1. **Templates are reusable** - One template can be used by many sites
2. **Site settings override template defaults** - Colors, fonts, SEO, etc. override template defaults
3. **Pages are created based on layouts** - Layouts define regions where blocks can be placed
4. **Blocks use component templates** - Blocks are rendered using React component templates
5. **Component templates are React components** - Well-defined React components (nav, hero, cart, etc.)
6. **Component templates provided by smartstore.ng** - Official component library
7. **Third-party component templates** - Developers can contribute and sell components
8. **Static and dynamic components** - Some are static, some are dynamic (with state/interactivity)

### Current Status

**✅ Completed:**
- Template system (reusable templates)
- Site creation with template application
- Page management with layouts and blocks
- Customization system (site settings override template defaults)
- Preview system (HTML string rendering)
- Public site serving (multi-tenant routing)
- Engine versioning
- Status management

**❌ Critical Gaps:**
- React Component Template System (blocks are HTML strings, not React components)
- Server-Side Rendering (SSR) for React components
- Client-Side Hydration for dynamic components
- Component Template Registry (no storage/versioning)
- Component Marketplace (no infrastructure)

### Critical Architecture Gap

**The Block System is Incomplete**

Current implementation renders blocks as HTML strings instead of React components. This prevents:
- Dynamic component functionality (forms, cart, interactive elements)
- Third-party component marketplace
- Component reusability and versioning
- Proper SSR with React hydration

**Required Changes:**
1. Implement React Component Template System
2. Add React SSR Service for server-side rendering
3. Add Client-Side Hydration for dynamic components
4. Create Component Template Registry
5. Build Component Marketplace Infrastructure

---

## Conclusion

The site creation and management system has **completed core functionality** but has **critical architecture gaps**:

### ✅ Completed Features
1. ✅ Authentication and authorization - Complete
2. ✅ Site CRUD operations - Complete
3. ✅ Page management - Complete
4. ✅ Customization - Complete (site settings override template defaults)
5. ✅ Template application on site creation - Complete
6. ✅ Status history - Migration complete, table exists
7. ✅ Preview system - Complete (but uses HTML strings, not React)
8. ✅ Block-based builder UI - Complete
9. ✅ Engine versioning - Complete
10. ✅ Multi-tenant routing - Complete

### ❌ Critical Architecture Gaps

**1. React Component Template System (CRITICAL)**
- **Current:** Blocks are rendered as HTML strings
- **Required:** Blocks must use React components with SSR and hydration
- **Impact:** Dynamic components don't work, no interactivity, no marketplace
- **Priority:** CRITICAL - Blocks core functionality

**2. Server-Side Rendering (SSR) (CRITICAL)**
- **Current:** HTML string generation
- **Required:** React SSR service (`renderToString` or `renderToPipeableStream`)
- **Impact:** Can't render React components on server
- **Priority:** CRITICAL - Required for component template system

**3. Client-Side Hydration (CRITICAL)**
- **Current:** No client-side JavaScript for dynamic components
- **Required:** JavaScript bundle and hydration system
- **Impact:** Dynamic components (forms, cart, etc.) can't work
- **Priority:** CRITICAL - Required for dynamic components

**4. Component Template Registry (HIGH)**
- **Current:** Component templates hardcoded in frontend
- **Required:** Database/registry for component templates
- **Impact:** Can't version, manage, or sell component templates
- **Priority:** HIGH - Enables marketplace ecosystem

**5. Component Marketplace (HIGH)**
- **Current:** No marketplace infrastructure
- **Required:** Storage, versioning, licensing, payment integration
- **Impact:** Can't enable third-party developer ecosystem
- **Priority:** HIGH - Enables component ecosystem

### Summary

The platform has a solid foundation but needs a **fundamental architecture shift** from HTML string rendering to a **React component template system** with proper SSR and hydration. This is critical for:

- Dynamic component functionality (forms, cart, interactive elements)
- Third-party component marketplace
- Component reusability and versioning
- Proper separation of concerns (component templates vs. blocks vs. pages)

Without this shift, the block system remains static and limited, preventing the full potential of the platform.

