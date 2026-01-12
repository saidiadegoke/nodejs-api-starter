# Preview System - Phase 1 Implementation

## Overview

Unified preview system that supports previewing **components**, **templates**, **pages**, and **sites** via `smartstore-app`.

**Flow**: `smartstore-web` (dashboard) → `smartstore-api` (preview config) → `smartstore-app` (rendering)

## Preview Types

### 1. Component Preview
**Endpoint**: `GET /preview/component/:componentId`

**Supports**:
- System components (e.g., `text`, `image`, `hero`)
- Custom components (based on system components)
- Composite components (groups of components)

**Backend (`smartstore-api`)**:
- Fetches component from `component_registry`
- Creates minimal site config with component as a block
- For composite components, resolves child component types

**Frontend (`smartstore-app`)**:
- Route: `/preview?type=component&componentId=:id&device=:device`
- Fetches preview config from API
- Renders component using React implementation

**Dashboard (`smartstore-web`)**:
- `ComponentPreviewModal` uses unified preview URL
- Generates: `http://localhost:3002/preview?type=component&componentId=1&device=desktop`

### 2. Template Preview
**Endpoint**: `GET /preview/template/:templateId`

**Supports**:
- All template pages
- Template components
- Template theme/config

**Backend (`smartstore-api`)**:
- Fetches template from `templates` table
- Parses template config (pages, components, theme)
- Creates site config from template

**Frontend (`smartstore-app`)**:
- Route: `/preview?type=template&templateId=:id&pageSlug=:slug&device=:device`
- Fetches preview config from API
- Renders template with selected page

**Dashboard (`smartstore-web`)**:
- Template preview uses unified preview URL
- Generates: `http://localhost:3002/preview?type=template&templateId=1&pageSlug=home&device=desktop`

### 3. Page Preview
**Endpoint**: `GET /preview/page/:pageId?siteId=:siteId`

**Supports**:
- Individual page within a site
- Page blocks and regions
- Site customization applied

**Backend (`smartstore-api`)**:
- Fetches page from `pages` table
- Gets parent site and customization
- Creates site config with selected page

**Frontend (`smartstore-app`)**:
- Route: `/preview?type=page&pageId=:id&siteId=:siteId&device=:device`
- Fetches preview config from API
- Renders page with site customization

**Dashboard (`smartstore-web`)**:
- Page preview uses unified preview URL
- Generates: `http://localhost:3002/preview?type=page&pageId=1&siteId=46&device=desktop`

### 4. Site Preview
**Endpoint**: `GET /preview/site/:siteId?pageSlug=:pageSlug`

**Supports**:
- Complete site with all pages
- Site customization
- Template (if applied)
- Draft pages (for preview mode)

**Backend (`smartstore-api`)**:
- Fetches site from `sites` table
- Gets all pages (including draft for preview)
- Gets customization and template
- Creates complete site config

**Frontend (`smartstore-app`)**:
- Route (new): `/preview?type=site&siteId=:id&pageSlug=:slug&device=:device`
- Route (legacy): `/{siteSlug}/preview?page=:pageSlug&device=:device`
- Fetches preview config from API
- Renders site with selected page

**Dashboard (`smartstore-web`)**:
- Site preview uses unified preview URL
- Generates: `http://localhost:3002/preview?type=site&siteId=46&pageSlug=home&device=desktop`

## API Endpoints

### smartstore-api Routes

**Main Preview Routes** (`/preview/*`):
```javascript
// Component preview
GET /preview/component/:componentId
// Returns: { success, data: SiteConfig }

// Template preview
GET /preview/template/:templateId
// Returns: { success, data: SiteConfig }

// Page preview
GET /preview/page/:pageId?siteId=:siteId
// Returns: { success, data: SiteConfig }

// Site preview
GET /preview/site/:siteId?pageSlug=:pageSlug
// Returns: { success, data: SiteConfig }
```

**Legacy HTML Endpoints** (backward compatibility):
```javascript
// Site HTML preview
GET /preview/:siteId/html
// Returns: HTML string

// Page HTML preview
GET /preview/:siteId/:pageId/html
// Returns: HTML string
```

## smartstore-app Routes

**Unified Preview Route** (`/preview`):
```typescript
// Supports query params:
// ?type=component&componentId=:id
// ?type=template&templateId=:id&pageSlug=:slug
// ?type=page&pageId=:id&siteId=:siteId
// ?type=site&siteId=:id&pageSlug=:slug
// &device=mobile|tablet|desktop
// &token=:token (optional)
```

**Legacy Route** (`/{siteSlug}/preview`):
```typescript
// Backward compatibility for site preview via slug
// ?page=:pageSlug&device=:device&token=:token
```

## Preview Config Structure

All preview types return a `SiteConfig` object:

```typescript
interface SiteConfig {
  site: {
    id: string | number
    name: string
    slug: string
    status: 'active' | 'draft' | 'suspended'
    owner_id: string | number
    template_id?: string | number | null
    primary_domain?: string | null
    engine_version?: string | null
    created_at: string
    updated_at: string
  }
  customization: {
    colors: {
      primary: string
      secondary: string
      accent: string
      background: string
      text: string
    }
    fonts: {
      heading: string
      body: string
      button: string
    }
    logo_url?: string | null
    spacing?: any | null
  }
  pages: Array<{
    id: string | number
    site_id: string | number
    slug: string
    title: string
    content: {
      blocks?: Block[]
      regions?: LayoutRegion[]
      html?: string
    }
    published: boolean
    status: 'published' | 'draft' | 'archived'
    meta_description?: string
    meta_keywords?: string[]
  }>
  template?: {
    id: string | number
    name: string
    slug: string
    category?: string
    config: TemplateConfig
    thumbnail_url?: string
    created_at: string
    updated_at: string
  } | null
  components?: ComponentConfig[] // For template/component previews
  previewPage?: string // Which page to render (slug)
  previewType?: 'component' | 'template' | 'page' | 'site'
}
```

## Component Preview Details

### System Components
- Component exists in `smartstore-app/components/smartstore/[type]/index.tsx`
- Registered in `smartstore-api` `component_registry` table
- Preview config uses `componentType` directly

### Custom Components
- Based on system component via `baseComponentType`
- Preview config uses `baseComponentType` (resolves to system component)
- Uses saved config from `component.config.defaultContent`

### Composite Components
- Contains `children` array with component references
- Preview config resolves each child's component type
- Creates blocks from resolved children
- Layout and responsive settings applied

## Usage Examples

### Component Preview (from dashboard)
```typescript
// In ComponentPreviewModal.tsx
const previewUrl = generateComponentPreviewUrl(
  component.id,      // component ID from registry
  'desktop',         // device
  undefined          // token (optional)
)
// Returns: http://localhost:3002/preview?type=component&componentId=1&device=desktop
```

### Template Preview (from dashboard)
```typescript
// In TemplatePreviewModal.tsx
const previewUrl = generateTemplatePreviewUrl(
  template.id,       // template ID
  'desktop',         // device
  'home',            // page slug (optional)
  undefined          // token (optional)
)
// Returns: http://localhost:3002/preview?type=template&templateId=1&pageSlug=home&device=desktop
```

### Page Preview (from dashboard)
```typescript
// In PagePreviewModal.tsx
const previewUrl = generatePagePreviewUrl(
  page.id,           // page ID
  site.id,           // site ID
  'mobile',          // device
  undefined          // token (optional)
)
// Returns: http://localhost:3002/preview?type=page&pageId=5&siteId=46&device=mobile
```

### Site Preview (from dashboard)
```typescript
// In SitePreviewModal.tsx
const previewUrl = generateSitePreviewUrl(
  site.id,           // site ID
  site.slug,         // site slug (optional, for path routing)
  'about',           // page slug (optional)
  'desktop',         // device
  undefined          // token (optional)
)
// Returns: http://localhost:3002/preview?type=site&siteId=46&siteSlug=test-site&pageSlug=about&device=desktop
// Or (legacy): http://localhost:3002/test-site/preview?page=about&device=desktop
```

## Implementation Status

### ✅ Backend (`smartstore-api`)
- ✅ PreviewService updated with all preview types
- ✅ PreviewController updated with all endpoints
- ✅ Routes configured in main router
- ✅ Component preview handles system/custom/composite
- ✅ Template preview returns complete template config
- ✅ Page preview includes site customization
- ✅ Site preview includes draft pages

### ✅ Frontend (`smartstore-app`)
- ✅ Unified preview route (`/preview`)
- ✅ Legacy route maintained (`/{siteSlug}/preview`)
- ✅ SiteConfigService updated with preview methods
- ✅ ApiClient updated with preview endpoints
- ✅ Preview URL utilities support all types

### ✅ Dashboard (`smartstore-web`)
- ✅ ComponentPreviewModal uses unified preview
- ✅ Preview URL utilities updated
- ⚠️ Template/Page/Site preview modals need to be created/updated

## Next Steps

1. **Create Template Preview Modal** in `smartstore-web`
   - Similar to ComponentPreviewModal
   - Shows template with page selector
   - Supports device switching

2. **Create Page Preview Modal** in `smartstore-web`
   - Shows individual page within site context
   - Supports device switching

3. **Enhance Site Preview** in `smartstore-web` dashboard
   - Update site management page preview
   - Support page navigation within preview

4. **Test All Preview Types**
   - Component preview (system, custom, composite)
   - Template preview (with page navigation)
   - Page preview (within site context)
   - Site preview (full site with all pages)

5. **Add Preview Navigation** (Future)
   - Navigate between pages in preview
   - Preview component variations
   - Preview template variants

## Error Handling

All preview endpoints should handle:
- **404**: Component/Template/Page/Site not found
- **400**: Invalid parameters
- **500**: Server errors

Preview routes in `smartstore-app` show friendly error messages in the UI.

## Security

- Preview endpoints are **public** (no auth required) for Phase 1
- Token validation can be added in production
- Preview tokens can be generated for secure preview links
- Draft content only shown in preview mode (not in public sites)


