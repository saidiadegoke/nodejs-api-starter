# New User Setup Flow Analysis

## Overview

This document analyzes the required setup steps for a newly registered user in the SmartStore platform, based on the current architecture where users create **Sites** (not Stores) and use **Templates** to get started.

---

## Current Architecture Context

### Key Concepts
- **Sites**: The primary entity users create (replaces the old "Store" concept)
- **Templates**: Pre-built site structures that users can select when creating a site
- **Pages**: Individual pages within a site, editable with block-based or rich text editors
- **Customization**: Site-level customization (colors, fonts, logo) stored in `site_customization` table
- **Multi-tenancy**: Each site has a unique slug and can be accessed via subdomain (`{slug}.smartstore.ng`) or custom domain

### Database Structure
- `sites` table: Core site information (name, slug, status, owner_id, engine_version)
- `templates` table: Pre-built template definitions
- `site_templates` table: Links sites to templates
- `pages` table: Individual pages within sites
- `site_customization` table: Site-level customization settings

---

## Required Setup Steps for New Users

### Step 1: Create Your First Site ⭐ **CRITICAL**

**What it is:**
- A newly registered user must create at least one site to start using the platform
- Sites are the primary container for all content, pages, and customization

**Current Implementation:**
- ✅ Site creation dialog exists (`CreateSiteDialog` component)
- ✅ Users can select a template when creating a site
- ✅ Site creation API endpoint exists (`POST /sites`)
- ✅ Site management page exists (`/dashboard/sites/[id]`)

**Required Information:**
1. **Site Name** (required)
   - Display name for the site
   - Used in dashboard and site management

2. **Template Selection** (optional but recommended)
   - User can choose from available templates
   - If no template selected, site starts with empty structure
   - Template provides initial pages, sections, and styling

3. **Site Slug** (auto-generated or user-provided)
   - Used for subdomain: `{slug}.smartstore.ng`
   - Must be unique
   - Auto-generated from site name if not provided

**What Happens:**
- Site is created with status `draft` by default
- If template selected, template structure is applied to the site
- Initial pages from template are created
- Default customization settings are applied

**UI Location:**
- `/dashboard/stores` (legacy naming, shows sites)
- "Create New Site" button
- Empty state: "No sites yet" with create button

---

### Step 2: Customize Your Site

**What it is:**
- Site-level customization including colors, fonts, and logo
- Stored in `site_customization` table

**Current Implementation:**
- ✅ Customization API exists
- ⚠️ Customization panel UI exists but is read-only
- ❌ No UI for editing customization (color picker, font selector, logo upload)

**Required Customization:**
1. **Color Scheme** (optional)
   - Primary color
   - Secondary color
   - Accent color
   - Background color
   - Text color
   - Text secondary color

2. **Typography** (optional)
   - Heading font family
   - Body font family
   - Button font family
   - Font sizes and weights

3. **Logo** (optional)
   - Site logo image
   - Upload and crop functionality

**What Happens:**
- Customization settings are saved to `site_customization` table
- Settings are applied to all pages in the site
- Preview updates in real-time

**UI Location:**
- `/dashboard/sites/[id]/customize`
- Currently shows existing customization (read-only)
- Needs editing UI implementation

---

### Step 3: Create/Edit Pages

**What it is:**
- Individual pages within a site
- Can be created from scratch or edited from template pages

**Current Implementation:**
- ✅ Pages API exists (CRUD operations)
- ✅ Page list view exists (`/dashboard/sites/[id]` - Pages tab)
- ✅ Block-based page editor exists (`/dashboard/sites/[id]/pages/[pageId]/blocks`)
- ✅ Rich text page editor exists (`/dashboard/sites/[id]/pages/[pageId]/edit`)
- ✅ Template page editor exists (`/dashboard/templates/[id]/pages/[pageSlug]/edit`)

**Required Actions:**
1. **Create Pages** (if not from template)
   - Home page (usually created from template)
   - About page
   - Contact page
   - Product pages (if e-commerce)
   - Blog pages (if content site)

2. **Edit Page Content**
   - Use block-based editor for structured content
   - Use rich text editor for simple content
   - Add/remove/reorder blocks
   - Configure block settings

3. **Page Settings**
   - Page title
   - Page slug/URL
   - Meta description
   - Meta keywords
   - Page visibility (published/draft)

**What Happens:**
- Pages are stored in `pages` table
- Page content stored as JSONB (blocks/regions or HTML)
- Pages can be previewed before publishing

**UI Location:**
- `/dashboard/sites/[id]` - Pages tab
- `/dashboard/sites/[id]/pages/[pageId]/edit` - Rich text editor
- `/dashboard/sites/[id]/pages/[pageId]/blocks` - Block-based editor

---

### Step 4: Preview Your Site

**What it is:**
- Preview the site as it will appear to visitors
- Shows site with all customization and page content applied

**Current Implementation:**
- ✅ Preview API endpoint exists (`GET /sites/:id/preview`)
- ✅ Preview service exists (`preview.service.js`)
- ✅ Block renderer service exists (`blockRenderer.service.js`)
- ⚠️ Preview UI exists but may need enhancement

**Required Features:**
1. **Device Preview**
   - Desktop view
   - Tablet view
   - Mobile view
   - Responsive breakpoint testing

2. **Live Preview**
   - Real-time updates as content changes
   - Preview with customization applied
   - Preview with actual content rendering

**What Happens:**
- Preview generates full HTML with:
  - Tailwind CSS CDN
  - Custom theme variables
  - Site customization (colors, fonts, logo)
  - All page content (blocks/regions or HTML)
  - Template sections (if applicable)

**UI Location:**
- `/dashboard/sites/[id]/preview`
- Preview button in site management page

---

### Step 5: Enable/Activate Your Site

**What it is:**
- Change site status from `draft` to `active`
- Active sites are accessible via subdomain or custom domain

**Current Implementation:**
- ✅ Site status toggle exists (`StatusToggle` component)
- ✅ Status management API exists
- ✅ Backend routing enforcement exists

**Required Actions:**
1. **Review Site**
   - Ensure all pages are created
   - Verify content is correct
   - Check customization settings

2. **Activate Site**
   - Toggle site status to `active`
   - Site becomes accessible at `{slug}.smartstore.ng`
   - Backend routing serves the site

**What Happens:**
- Site status updated in database
- Site becomes publicly accessible
- Multi-tenant routing serves the site
- SSL certificate generated (if needed)

**UI Location:**
- `/dashboard/sites/[id]` - Status toggle
- Site management page header

---

### Step 6: (Optional) Add Custom Domain

**What it is:**
- Configure a custom domain (e.g., `mysite.com`) instead of subdomain
- Requires DNS configuration and SSL certificate

**Current Implementation:**
- ✅ Custom domain API exists
- ✅ Domain verification logic exists
- ⚠️ SSL management exists (Cloudflare/Let's Encrypt)
- ❌ Custom domain UI may need implementation

**Required Actions:**
1. **Add Domain**
   - Enter custom domain name
   - Verify domain ownership (DNS TXT record)
   - Configure DNS (A record or CNAME)

2. **SSL Certificate**
   - Automatic SSL via Cloudflare (if using Cloudflare)
   - Let's Encrypt fallback
   - SSL status monitoring

**What Happens:**
- Domain added to `custom_domains` table
- Domain verification process initiated
- SSL certificate generated
- Site accessible via custom domain

**UI Location:**
- `/dashboard/sites/[id]` - Custom domain section
- Domain management interface

---

## Setup Flow Comparison: Old vs New

### Old Flow (Legacy - Based on `/dashboard/get-started`)
1. Store Setup (name, category, currency, theme)
2. Add Products
3. Web Pages
4. Sales Channels
5. Marketing

### New Flow (Current Architecture)
1. **Create Site** ⭐ (with template selection)
2. **Customize Site** (colors, fonts, logo)
3. **Create/Edit Pages** (block-based or rich text)
4. **Preview Site** (device-responsive)
5. **Enable Site** (activate for public access)
6. **(Optional) Add Custom Domain**

---

## Minimum Viable Setup

For a user to have a functional site, they need:

1. ✅ **At least one site created**
2. ✅ **At least one page created** (usually Home page from template)
3. ✅ **Site status set to `active`** (to make it accessible)

Everything else is optional but recommended:
- Customization (colors, fonts, logo)
- Additional pages
- Custom domain

---

## Current Implementation Status

### ✅ Fully Implemented
- Site creation with template selection
- Site management page
- Site status toggle
- Page creation and editing (block-based and rich text)
- Preview system (backend rendering)
- Multi-tenant routing

### ⚠️ Partially Implemented
- Customization panel (read-only, needs editing UI)
- Preview UI (exists but may need device selector)
- Custom domain management (backend exists, UI may need work)

### ❌ Not Implemented
- Setup wizard/onboarding flow for new users
- Setup progress tracking (API exists but not fully integrated)
- Guided setup steps UI

---

## Recommended Setup Flow for New Users

### Option A: Guided Wizard (Recommended)
1. **Welcome Screen**
   - Explain what SmartStore is
   - Show benefits
   - "Get Started" button

2. **Create Site Step**
   - Site name input
   - Template selection (with previews)
   - "Create Site" button

3. **Customize Step** (Optional - can skip)
   - Color picker
   - Font selector
   - Logo upload
   - "Continue" or "Skip" button

4. **Pages Step** (Optional - can skip)
   - List of pages from template
   - Quick edit links
   - "Continue" or "Skip" button

5. **Preview Step**
   - Show site preview
   - Device selector
   - "Looks Good" button

6. **Activate Step**
   - Explain what activation means
   - Show site URL (`{slug}.smartstore.ng`)
   - "Activate Site" button
   - Redirect to site management page

### Option B: Quick Start (Current)
1. User lands on `/dashboard/stores`
2. Sees "No sites yet" empty state
3. Clicks "Create Your First Site"
4. Creates site with template
5. Redirected to site management page
6. Can customize, edit pages, preview, and activate from there

---

## Dashboard Setup Section Analysis

### Current Dashboard Setup Section (`/dashboard/page.tsx`)

The current "Get Started" section shows 5 steps:
1. Store Setup → `/dashboard/get-started?step=store`
2. Add Products → `/dashboard/products/new`
3. Web Pages → `/dashboard/cms`
4. Sales Channels → `/dashboard/marketing`
5. Marketing → `/dashboard/marketing`

**Issues:**
- ❌ References "Store" instead of "Site"
- ❌ Steps don't match new architecture
- ❌ Links to old routes that may not exist or work correctly
- ❌ Uses `setupProgressAPI` which may not be fully implemented

### Recommended Dashboard Setup Section

Should show:
1. **Create Site** → `/dashboard/stores` (create site dialog)
2. **Customize Site** → `/dashboard/sites/[id]/customize`
3. **Edit Pages** → `/dashboard/sites/[id]` (Pages tab)
4. **Preview Site** → `/dashboard/sites/[id]/preview`
5. **Activate Site** → `/dashboard/sites/[id]` (status toggle)

---

## Recommendations

### Immediate Actions Needed

1. **Update Dashboard Setup Section**
   - Replace old "Store Setup" steps with new "Site Setup" steps
   - Update links to point to correct routes
   - Align with new architecture

2. **Implement Customization Editing UI**
   - Color picker component
   - Font selector
   - Logo uploader
   - Save functionality

3. **Create New User Onboarding**
   - Welcome screen for first-time users
   - Guided setup wizard (optional)
   - Progress tracking

4. **Update Empty States**
   - Ensure all empty states guide users to next step
   - Clear call-to-action buttons

5. **Documentation**
   - User guide for creating first site
   - Video tutorials
   - Help tooltips

---

## Conclusion

The new architecture is **site-based** (not store-based), and the setup flow should reflect this. A newly registered user needs to:

1. **Create a site** (with optional template)
2. **Customize the site** (optional but recommended)
3. **Create/edit pages** (usually from template)
4. **Preview the site**
5. **Activate the site** (make it public)

The current dashboard setup section is outdated and references the old "store" model. It should be updated to match the new site-based architecture.


