# Architecture vs Implementation Analysis

This document compares what the architecture specifies vs what has actually been implemented.

---

## 1. Template Structure

### Architecture Specification

According to `dashboard-architecture-comparison.md`, a template should have:

```javascript
{
  id: "template-1",
  name: "Modern Business",
  category: "business",
  preview: "/templates/template-1-preview.jpg",
  config: {
    sections: [
      // Array of section/component definitions
      {
        type: "hero",
        settings: { ... },
        content: { ... }
      },
      {
        type: "features",
        settings: { ... },
        content: { ... }
      }
    ],
    theme: {
      colors: {
        primary: "#4D16D1",
        secondary: "#6B7280",
        background: "#FFFFFF",
        text: "#111827"
      },
      fonts: {
        heading: "Inter",
        body: "Inter"
      }
    },
    pages: [
      {
        slug: "home",
        title: "Home",
        components: [
          // Block-based components for this page
          { type: "hero", ... },
          { type: "text", ... }
        ]
      },
      {
        slug: "about",
        title: "About Us",
        components: [...]
      }
    ]
  }
}
```

### Current Implementation

**What exists:**
- ✅ Database table `templates` with `config JSONB` column
- ✅ API endpoint to create templates
- ✅ Frontend dialog to create templates

**What's missing:**
- ❌ Templates are created with **empty configs**:
  ```javascript
  {
    sections: [],
    theme: { colors: {}, fonts: {} },
    pages: [{ slug: 'home', title: 'Home', content: {} }]
  }
  ```
- ❌ No template builder/editor to define actual content
- ❌ No way to create sections/components
- ❌ No way to define page structures
- ❌ No default content for templates

**Gap:** Templates are just empty shells. There's no UI or process to actually build template content.

---

## 2. Site Structure

### Architecture Specification

According to `design-architecure-ref.md`, a site should have:

```javascript
{
  id: 1,
  slug: "john",  // For subdomain: john.smartstore.ng
  name: "John's Store",
  primary_domain: "myshop.com",  // Optional custom domain
  engine_version: "v1.0.0",  // Versioned runtime
  status: "active" | "draft" | "suspended",
  owner_id: "...",
  created_at: "...",
  updated_at: "..."
}
```

**Site Features:**
1. **Enable/Disable** - via `status` field
2. **Preview** - via preview endpoint/iframe
3. **Custom Domains** - via `primary_domain` and `custom_domains` table
4. **Versioned Engine** - via `engine_version` field
5. **Multi-tenant Routing** - host-based routing (subdomain or custom domain)

### Current Implementation

**What exists:**
- ✅ Database table `sites` with all required fields
- ✅ Site creation API
- ✅ Site management page UI
- ✅ Status field exists in database
- ✅ `engine_version` field exists

**What's missing:**
- ❌ **Enable/Disable UI** - Status can be changed but no clear enable/disable buttons
- ❌ **Preview functionality** - No preview endpoint, no iframe preview
- ❌ **Custom domain management** - Database table exists but no UI/API for:
  - Adding custom domains
  - Domain verification
  - SSL status management
- ❌ **Engine version management** - Field exists but no UI to:
  - View current version
  - Update to new version
  - Rollback to previous version
- ❌ **Multi-tenant routing** - No host-based routing implementation

**Gap:** Sites are created but can't be previewed, can't use custom domains, and engine versioning isn't functional.

---

## 3. Pages Structure

### Architecture Specification

According to the architecture, pages should have:

```javascript
{
  id: 1,
  site_id: 1,
  slug: "home",
  title: "Home Page",
  content: {
    // Block-based structure (Phase 2)
    blocks: [
      {
        id: "block-1",
        type: "hero",
        data: {
          title: "Welcome",
          subtitle: "To our store",
          image: "..."
        },
        styles: { ... }
      },
      {
        id: "block-2",
        type: "text",
        data: {
          content: "<p>Some text</p>"
        }
      }
    ]
  },
  published: false,
  created_at: "...",
  updated_at: "..."
}
```

**For Phase 1 (MVP):** Simple CMS with rich text editor
**For Phase 2:** Block-based structure

### Current Implementation

**What exists:**
- ✅ Database table `pages` with `content JSONB`
- ✅ API endpoints for CRUD operations
- ✅ Pages list display in site management page

**What's missing:**
- ❌ **Page Editor UI** - No editor to create/edit pages
- ❌ **Rich Text Editor** - No TipTap or similar integration
- ❌ **Block-based structure** - Not implemented (Phase 2)
- ❌ **Page preview** - No preview functionality
- ❌ **Publish/unpublish** - `published` field exists but no UI toggle
- ❌ **Version history** - `page_versions` table exists but no functionality

**Gap:** Pages can be created via API but there's no UI to actually edit them or see them.

---

## 4. Preview System

### Architecture Specification

According to `dashboard-architecture-comparison.md`:

**Iframe Preview:**
```javascript
// Editor sends updates via postMessage
iframe.contentWindow.postMessage({
  type: 'UPDATE_PAGE',
  data: pageData
}, '*');

// Preview listens and updates
window.addEventListener('message', (event) => {
  if (event.data.type === 'UPDATE_PAGE') {
    renderPage(event.data.data);
  }
});
```

**Preview Features:**
- Device preview (desktop/tablet/mobile)
- Live updates as user edits
- Separate preview endpoint
- postMessage communication

### Current Implementation

**What exists:**
- ❌ **Nothing** - No preview system implemented

**What's missing:**
- ❌ Preview iframe component
- ❌ Preview API endpoint (`/preview/:siteId` or `/preview/:siteId/:pageId`)
- ❌ Device selector (desktop/tablet/mobile)
- ❌ postMessage communication
- ❌ Live preview updates
- ❌ Preview URL generation

**Gap:** Complete feature missing. Users can't preview their sites at all.

---

## 5. Customization Panel

### Architecture Specification

According to the architecture, customization should include:

```javascript
{
  colors: {
    primary: "#4D16D1",
    secondary: "#6B7280",
    accent: "#F59E0B",
    background: "#FFFFFF",
    text: "#111827"
  },
  fonts: {
    heading: "Inter",
    body: "Inter"
  },
  logo_url: "https://...",
  spacing: {
    // Spacing settings
  }
}
```

**UI Requirements:**
- Color picker for each color
- Font selector with Google Fonts integration
- Logo uploader with preview
- Live preview updates

### Current Implementation

**What exists:**
- ✅ Database table `site_customization` with all fields
- ✅ API endpoints to get/update customization
- ✅ Display of existing customization (read-only)

**What's missing:**
- ❌ **Color picker UI** - No component to select colors
- ❌ **Font selector UI** - No component to choose fonts
- ❌ **Logo uploader** - No file upload component
- ❌ **Save functionality** - API exists but no UI to save changes
- ❌ **Live preview** - No preview updates when customizing

**Gap:** Customization data structure exists but no UI to actually customize anything.

---

## 6. Site Status & Enable/Disable

### Architecture Specification

Sites should support:
- `status: "active" | "draft" | "suspended"`
- Enable/disable functionality
- Status affects site visibility

### Current Implementation

**What exists:**
- ✅ `status` field in database
- ✅ Status can be changed in site management page

**What's missing:**
- ❌ **Clear enable/disable buttons** - Status is a dropdown, not intuitive
- ❌ **Status impact** - No indication of what status means
- ❌ **Status-based routing** - Sites with `draft` or `suspended` status should not be publicly accessible

**Gap:** Status exists but isn't properly integrated with site visibility.

---

## Summary: Implementation Status

| Feature | Database | API | UI | Functional |
|---------|----------|-----|-----|------------|
| **Templates** | ✅ | ✅ | ⚠️ | ❌ (empty configs) |
| **Sites** | ✅ | ✅ | ✅ | ⚠️ (basic CRUD only) |
| **Pages** | ✅ | ✅ | ⚠️ | ❌ (no editor) |
| **Customization** | ✅ | ✅ | ❌ | ❌ (read-only) |
| **Preview** | ❌ | ❌ | ❌ | ❌ (not implemented) |
| **Custom Domains** | ✅ | ❌ | ❌ | ❌ (not implemented) |
| **Engine Versioning** | ✅ | ❌ | ❌ | ❌ (not implemented) |
| **Enable/Disable** | ✅ | ✅ | ⚠️ | ⚠️ (status exists but not enforced) |

---

## What Needs to Be Built

### Priority 1: Core Functionality
1. **Template Content Builder** - UI to create actual template structures
2. **Page Editor** - Simple rich text editor for Phase 1
3. **Customization Panel** - Color picker, font selector, logo upload
4. **Preview System** - Iframe preview with device selector

### Priority 2: Site Management
1. **Enable/Disable** - Clear UI and routing enforcement
2. **Custom Domain Management** - Add, verify, SSL management
3. **Engine Versioning** - View, update, rollback UI

### Priority 3: Advanced Features
1. **Block-Based Builder** (Phase 2)
2. **Version History** UI
3. **Multi-tenant Routing** implementation

---

## Next Steps

1. **Template Builder** - Create UI to build template configs with sections and pages
2. **Simple Page Editor** - Rich text editor for Phase 1 MVP
3. **Customization Panel** - Full UI with color picker, font selector, logo upload
4. **Preview System** - Iframe preview endpoint and component
5. **Site Status Enforcement** - Make status actually affect site visibility


