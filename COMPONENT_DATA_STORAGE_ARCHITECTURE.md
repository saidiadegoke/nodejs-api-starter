# Component Data Storage Architecture

## Overview

This document explains how the system stores component data and customizations when multiple sites/templates use the same component but customize it differently.

## Storage Layers

### 1. Global Component Definitions (Shared)

**Location**: `component_registry` table

**Purpose**: Stores component definitions that are shared across all sites and templates.

**Contains**:
- Component schema (what fields can be customized)
- Default values (`defaultContent`, `defaultPresentation`, `defaultLayout`, `defaultSettings`)
- Component metadata (name, description, category)
- Template definitions (for components with templates)

**Example**:
```json
{
  "id": 6,
  "name": "Hero Section",
  "type": "hero",
  "componentType": "system",
  "config": {
    "schema": {
      "data": { ... },
      "presentation": { ... },
      "layout": { ... }
    },
    "defaultContent": {
      "headline": "Default Headline",
      "description": "Default Description"
    },
    "defaultPresentation": {
      "accentColor": "text-primary"
    }
  }
}
```

**Key Point**: This is **read-only** for sites. Sites cannot modify component definitions.

---

### 2. Site-Specific Block Instances (Per-Site)

**Location**: `pages.content` (JSONB field)

**Purpose**: Stores actual block instances with site-specific customizations.

**Structure**:
```json
{
  "regions": [
    {
      "id": "header",
      "blocks": [
        {
          "id": "block-1",
          "componentId": 6,  // ← References global component
          "type": "hero",    // ← Component type
          "data": {          // ← Site-specific content
            "headline": "Site A's Custom Headline",
            "description": "Site A's Description"
          },
          "presentation": {  // ← Site-specific presentation
            "accentColor": "text-blue-600"
          },
          "layout": {        // ← Site-specific layout
            "visualLayout": "sideBy"
          },
          "settings": {      // ← Site-specific settings
            "styles": { ... }
          }
        }
      ]
    }
  ]
}
```

**Key Points**:
- Each site has its own `pages` table rows
- Each page has its own `content` JSONB field
- Each block in `content.regions[].blocks[]` stores site-specific customizations
- Blocks reference the global component via `componentId`

---

### 3. Site-Level Customization (Per-Site)

**Location**: `site_customization` table

**Purpose**: Stores site-wide customization settings (colors, fonts, logo, spacing).

**Structure**:
```json
{
  "site_id": 1,
  "colors": {
    "primary": "#3b82f6",
    "secondary": "#8b5cf6"
  },
  "fonts": {
    "heading": "Inter",
    "body": "Roboto"
  },
  "logo_url": "https://...",
  "spacing": { ... }
}
```

**Key Point**: These are site-wide defaults that apply to all components unless overridden at the block level.

---

## Data Flow: Multiple Sites Using Same Component

### Scenario: Site A and Site B both use Hero Component

#### 1. Component Definition (Shared)
```
component_registry
├── id: 6
├── type: "hero"
├── config.defaultContent: { headline: "Default", ... }
└── config.defaultPresentation: { accentColor: "text-primary" }
```

#### 2. Site A's Block Instance
```
sites (id: 1) → pages (id: 10) → content.regions[0].blocks[0]
├── componentId: 6  ← References shared component
├── data: { headline: "Site A Headline", ... }  ← Site A's custom data
├── presentation: { accentColor: "text-blue-600" }  ← Site A's custom colors
└── layout: { visualLayout: "sideBy" }  ← Site A's custom layout
```

#### 3. Site B's Block Instance
```
sites (id: 2) → pages (id: 20) → content.regions[0].blocks[0]
├── componentId: 6  ← References same shared component
├── data: { headline: "Site B Headline", ... }  ← Site B's custom data
├── presentation: { accentColor: "text-red-600" }  ← Site B's custom colors
└── layout: { visualLayout: "fullWidth" }  ← Site B's custom layout
```

**Result**: Both sites use the same component definition, but each has its own customized block instance.

---

## Rendering Precedence (Merging Order)

When rendering a block, the system merges data in this order (highest to lowest priority):

```
1. Block-level overrides (from pages.content.regions[].blocks[])
   ↓
2. Component defaults (from component_registry.config.default*)
   ↓
3. Template theme (from templates.config.theme)
   ↓
4. Site customization (from site_customization)
```

**Example**:
```typescript
// Final rendered data for Site A's hero block:
{
  // Start with component defaults
  headline: "Default Headline",
  accentColor: "text-primary",
  
  // Apply site customization (if block doesn't override)
  // (site customization doesn't override block data, only provides defaults)
  
  // Apply block overrides (highest priority)
  headline: "Site A Headline",  // ← Overrides default
  accentColor: "text-blue-600"  // ← Overrides default
}
```

---

## Saving Block Customizations

### When User Customizes a Block on Web:

1. **User edits block** in `BlockConfigPanel`
2. **Changes are saved** to `pages.content` (via `PUT /sites/:siteId/pages/:pageId`)
3. **Block data is stored** in the page's `content.regions[].blocks[]` array
4. **Component reference** (`componentId`) remains unchanged
5. **Only block instance data** is updated, not the component definition

### API Endpoint:
```
PUT /sites/:siteId/pages/:pageId
Body: {
  content: {
    regions: [{
      blocks: [{
        id: "block-1",
        componentId: 6,  // ← Still references same component
        data: { ... },   // ← Updated with site-specific data
        presentation: { ... },
        layout: { ... }
      }]
    }]
  }
}
```

---

## Preview Flow

### Component Preview (Uses Saved Config from API)

1. **Web generates preview URL**:
   ```
   /preview?type=component&componentId=6&data={...}&settings={...}
   ```

2. **App fetches component config from API**:
   ```
   GET /preview/component/6
   → Returns component defaults from component_registry
   ```

3. **App applies URL overrides** (for testing/present context):
   ```
   - Component defaults (from API)
   - URL overrides (data, settings, styles) ← Only for testing
   ```

4. **Result**: Preview shows component with saved defaults + any URL overrides

### Block Preview (Uses Saved Block Data from Page)

1. **Web generates preview URL**:
   ```
   /preview?type=component&componentId=6&data={block.data}&settings={block.presentation,block.layout}
   ```

2. **App fetches component config from API**:
   ```
   GET /preview/component/6
   → Returns component defaults
   ```

3. **App applies block data as URL overrides**:
   ```
   - Component defaults (from API) ← Saved config
   - Block data from URL (data, settings) ← Saved block customization
   ```

4. **Result**: Preview shows component with saved block customizations

**Important**: URL overrides are only for **present context** (what user is currently editing). The saved block data comes from the page's `content` field in the database.

---

## Key Principles

1. **Component definitions are global** - Shared across all sites
2. **Block instances are site-specific** - Each site has its own block customizations
3. **Component registry is read-only** - Sites cannot modify component definitions
4. **Block data is stored per-page** - In `pages.content` JSONB field
5. **Merging happens at render time** - Component defaults + site customization + block overrides

---

## Database Schema Summary

```sql
-- Global component definitions
component_registry (
  id,
  type,              -- Component identifier (e.g., "hero")
  component_type,    -- Same as type (for backward compatibility)
  config JSONB       -- Schema, defaults, etc.
)

-- Site-specific pages
pages (
  id,
  site_id,           -- Links to specific site
  slug,
  content JSONB      -- Contains blocks with site-specific data
)

-- Site-wide customization
site_customization (
  site_id,
  colors JSONB,
  fonts JSONB,
  logo_url,
  spacing JSONB
)
```

---

## Example: Two Sites Using Same Hero Component

### Site A (id: 1)
```json
// pages.content for Site A
{
  "regions": [{
    "blocks": [{
      "componentId": 6,
      "data": { "headline": "Welcome to Site A" },
      "presentation": { "accentColor": "text-blue-600" }
    }]
  }]
}
```

### Site B (id: 2)
```json
// pages.content for Site B
{
  "regions": [{
    "blocks": [{
      "componentId": 6,  // ← Same component
      "data": { "headline": "Welcome to Site B" },  // ← Different data
      "presentation": { "accentColor": "text-red-600" }  // ← Different colors
    }]
  }]
}
```

**Both sites**:
- Reference the same component (`componentId: 6`)
- Have their own customized block data
- Store customizations in their own `pages.content` field
- Do not affect each other's customizations

---

## Summary

**Question**: How do you save data from different sites/templates using the same component/template and customizing it differently?

**Answer**:
1. **Component definitions** are stored globally in `component_registry` (shared)
2. **Block customizations** are stored per-site in `pages.content` (site-specific)
3. Each site's blocks reference the global component via `componentId`
4. Each site's blocks have their own `data`, `presentation`, `layout`, and `settings`
5. When rendering, the system merges: component defaults → site customization → block overrides

This architecture allows:
- ✅ Shared component definitions (DRY principle)
- ✅ Site-specific customizations (isolation)
- ✅ Component updates affect all sites (consistency)
- ✅ Block customizations don't affect other sites (independence)

