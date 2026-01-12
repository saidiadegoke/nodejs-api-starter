# React Component Template System - Design & Architecture Implementation Plan

## Overview

This document outlines the design and architecture for implementing a React Component Template System to replace the current HTML string-based block rendering. This is a critical architecture shift that enables dynamic components, interactivity, third-party components, and a component marketplace.

---

## Current Architecture vs. Target Architecture

### Current Architecture (HTML Strings)

```
Block Data → BlockRendererService → HTML String → Sent to Client
```

**Problems:**
- Blocks are static HTML strings
- No interactivity or dynamic behavior
- No state management
- No client-side JavaScript
- Components can't be reused or versioned
- No marketplace possible

### Target Architecture (React Components)

```
Block Data → Component Template Registry → React Component → React SSR → HTML + JS Bundle → Client Hydration → Interactive Component
```

**Benefits:**
- Full React component system
- Server-side rendering (SSR)
- Client-side hydration for interactivity
- Component reusability and versioning
- Third-party component marketplace
- Dynamic state management

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Component Template System                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │   Registry   │──────│   Storage   │──────│ Version  │ │
│  │   Service    │      │   Service   │      │  System  │ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│         │                                                │
│         │                                                │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │ React SSR    │──────│  Component   │──────│  Client  │ │
│  │   Service    │      │   Loader     │      │ Hydration│ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Component Flow

```
1. Block Request
   ↓
2. Component Template Registry (lookup component by block type)
   ↓
3. Component Loader (load React component from storage)
   ↓
4. Props Preparation (merge block data, styles, settings, site context)
   ↓
5. React SSR Service (render component to HTML)
   ↓
6. JavaScript Bundle Generation (for client-side hydration)
   ↓
7. HTML + JS Bundle Returned
   ↓
8. Client Hydration (React hydrates on client-side)
   ↓
9. Interactive Component (with state management)
```

---

## Core Components

### 1. Component Template Registry

**Purpose:** Central registry for all component templates (official and third-party)

**Responsibilities:**
- Store component metadata (id, name, type, version, provider, license)
- Component lookup by block type
- Version management
- Component discovery and search
- License validation

**Storage:**
- Database table: `component_templates`
- File system: React component files (or bundled)
- Optional: CDN for component assets

**Data Model:**
```typescript
interface ComponentTemplate {
  id: string
  name: string
  type: BlockType
  category: 'basic' | 'marketing' | 'ecommerce' | 'navigation' | 'utility'
  version: string
  provider: 'smartstore' | 'third-party' | 'user'
  author?: string
  license: 'MIT' | 'Commercial' | 'Custom'
  price?: number
  reactComponentPath: string  // Path to React component file
  defaultData: Record<string, any>
  defaultStyles?: Record<string, any>
  defaultSettings?: Record<string, any>
  schema: ZodSchema  // Validation schema
  isDynamic: boolean  // Requires client-side JavaScript
  requiresAuth?: boolean
  dependencies?: string[]  // Other component IDs
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Tools/Libraries:**
- PostgreSQL (database)
- Zod (schema validation)
- File system or S3 (component storage)

---

### 2. Component Storage Service

**Purpose:** Store and retrieve React component files

**Responsibilities:**
- Store React component files
- Version component files
- Retrieve component files for rendering
- Handle component bundling (if needed)

**Storage Options:**
1. **File System** (Simple)
   - Store `.tsx` or `.jsx` files in `components/` directory
   - Version by directory: `components/hero/v1.0.0/`, `components/hero/v1.1.0/`
   
2. **Database (JSONB)** (Alternative)
   - Store component code as text in database
   - Less flexible for complex components
   
3. **CDN/Cloud Storage** (Scalable)
   - Store bundled components in S3/CloudFront
   - Better for production scale

**Tools/Libraries:**
- File system (Node.js `fs`)
- AWS S3 (optional, for cloud storage)
- Webpack/Rollup (for bundling, if needed)

---

### 3. Component Loader Service

**Purpose:** Load React components dynamically for rendering

**Responsibilities:**
- Load component from storage
- Validate component
- Prepare component for rendering
- Handle component dependencies
- Cache loaded components

**Loading Strategy:**
1. **Dynamic Import** (Recommended)**
   ```javascript
   const Component = await import(`./components/${componentPath}`)
   ```
   
2. **Require Cache** (Node.js)
   ```javascript
   const Component = require(`./components/${componentPath}`)
   ```

3. **Component Registry Map** (Pre-loaded)
   ```javascript
   const componentMap = {
     'hero': HeroComponent,
     'text': TextComponent,
     // ...
   }
   ```

**Tools/Libraries:**
- Node.js `require()` or dynamic `import()`
- React (for component rendering)
- Node-cache or Redis (for component caching)

---

### 4. React SSR Service

**Purpose:** Server-side render React components to HTML

**Responsibilities:**
- Render React components to HTML strings
- Inject props (data, styles, settings, site context)
- Generate HTML with proper structure
- Handle errors gracefully
- Support streaming (optional, for performance)

**Rendering Methods:**

1. **renderToString** (Synchronous)
   - Simple, works for most cases
   - Blocks until complete
   - Good for small components

2. **renderToPipeableStream** (Asynchronous, Streaming)
   - Better for large pages
   - Streaming output
   - More complex setup

3. **renderToStaticMarkup** (Static)
   - For static components only
   - No hydration needed
   - Fastest option

**Tools/Libraries:**
- `react-dom/server` (React SSR)
- `react` (React library)
- Optional: `@react-ssr/server` (if using framework)

**SSR Flow:**
```
1. Load React Component
2. Prepare Props (block data + site context)
3. Create React Element: React.createElement(Component, props)
4. Render to HTML: renderToString(element)
5. Inject into HTML template
6. Return HTML
```

---

### 5. JavaScript Bundle Service

**Purpose:** Generate client-side JavaScript bundle for dynamic components

**Responsibilities:**
- Bundle React components for client-side
- Include only dynamic components (not static ones)
- Generate hydration code
- Minify and optimize bundle
- Cache bundles

**Bundle Strategy:**

1. **Per-Site Bundle** (Recommended)
   - Generate bundle for each site
   - Include only components used by that site
   - Cache by site ID + component versions
   - Smaller bundles, better performance

2. **Per-Page Bundle**
   - Generate bundle per page
   - Include only components on that page
   - Smallest bundles
   - More complex caching

3. **Global Bundle**
   - Single bundle with all components
   - Simple but larger
   - Less optimal

**Tools/Libraries:**
- Webpack or Rollup (bundling)
- Babel (transpilation)
- Terser (minification)
- Optional: esbuild (faster bundling)

**Bundle Generation Flow:**
```
1. Identify dynamic components used on page
2. Collect component files
3. Bundle with Webpack/Rollup
4. Include React and ReactDOM
5. Include hydration code
6. Minify bundle
7. Cache bundle
8. Return bundle URL
```

---

### 6. Client Hydration Service

**Purpose:** Hydrate server-rendered HTML with React on client-side

**Responsibilities:**
- Load JavaScript bundle
- Hydrate React components
- Initialize component state
- Attach event handlers
- Enable interactivity

**Hydration Flow:**
```
1. Load HTML (already rendered from server)
2. Load JavaScript bundle
3. React.hydrateRoot() on client
4. Components become interactive
5. State management initialized
```

**Tools/Libraries:**
- `react-dom/client` (React hydration)
- `react` (React library)
- Optional: State management library (Redux, Zustand, etc.)

**Hydration Code (Client-Side):**
```javascript
import { hydrateRoot } from 'react-dom/client';
import { HeroComponent } from './components/hero';

// Hydrate each component
const heroElement = document.getElementById('block-hero-123');
if (heroElement) {
  hydrateRoot(heroElement, <HeroComponent {...props} />);
}
```

---

## Integration Points

### 1. Block Renderer Integration

**Current:** `blockRenderer.service.js` renders HTML strings

**New:** `blockRenderer.service.js` uses React SSR Service

**Integration Flow:**
```
BlockRendererService.renderBlock(block)
  ↓
ComponentRegistry.getComponent(block.type)
  ↓
ComponentLoader.loadComponent(componentPath)
  ↓
ReactSSRService.render(Component, props)
  ↓
Return HTML
```

### 2. Preview Service Integration

**Current:** `preview.service.js` uses BlockRendererService

**New:** `preview.service.js` uses React SSR + Bundle Generation

**Integration Flow:**
```
PreviewService.renderSite(siteId)
  ↓
Load site, pages, customization
  ↓
For each block:
  - ReactSSRService.render() → HTML
  - BundleService.identifyDynamicComponents() → JS Bundle
  ↓
Generate full HTML with:
  - Server-rendered HTML
  - JavaScript bundle script tag
  - Hydration code
```

### 3. Public Site Serving Integration

**Current:** `siteRenderer.service.js` uses PreviewService

**New:** `siteRenderer.service.js` uses React SSR + Bundle Generation

**Integration Flow:**
```
SiteRendererService.renderSite(site)
  ↓
Load engine version
  ↓
Engine.renderSite() uses:
  - ReactSSRService for server rendering
  - BundleService for client bundle
  ↓
Return HTML + JS Bundle
```

---

## Data Flow

### Server-Side Rendering Flow

```
1. Request comes in (preview or public site)
   ↓
2. Load site data (site, pages, customization, template)
   ↓
3. Apply site customization (override template defaults)
   ↓
4. Load page layout (regions or linear blocks)
   ↓
5. For each block:
   a. ComponentRegistry.getComponent(block.type)
   b. ComponentLoader.loadComponent(componentPath)
   c. Prepare props (block.data, block.styles, block.settings, site, customization)
   d. ReactSSRService.render(Component, props) → HTML
   ↓
6. Identify dynamic components → BundleService.generateBundle()
   ↓
7. Generate full HTML document:
   - Server-rendered HTML
   - JavaScript bundle script tag
   - Hydration code
   ↓
8. Return HTML + JS Bundle URL
```

### Client-Side Hydration Flow

```
1. Browser receives HTML (with server-rendered content)
   ↓
2. Browser loads JavaScript bundle (from script tag)
   ↓
3. Bundle executes hydration code
   ↓
4. React.hydrateRoot() for each dynamic component
   ↓
5. Components become interactive:
   - Event handlers attached
   - State initialized
   - Dynamic behavior enabled
   ↓
6. User can interact with components
```

---

## Tools & Libraries Required

### Core Dependencies

1. **React & React DOM**
   - `react` - React library
   - `react-dom` - React DOM (for SSR and hydration)
   - `react-dom/server` - Server-side rendering
   - `react-dom/client` - Client-side hydration

2. **Component Management**
   - `zod` - Schema validation for component props
   - `node-cache` or `redis` - Component caching
   - `fs` (Node.js) - File system for component storage

3. **Bundling (Optional, if needed)**
   - `webpack` or `rollup` - JavaScript bundling
   - `babel` - JavaScript transpilation
   - `terser` - Code minification
   - Alternative: `esbuild` (faster)

4. **Database**
   - PostgreSQL - Component template registry
   - Existing database connection

### Optional Dependencies

1. **State Management** (for dynamic components)
   - `redux` or `zustand` - Client-side state
   - `react-query` - Server state management

2. **Cloud Storage** (if using cloud)
   - AWS SDK (for S3)
   - Or other cloud storage SDK

3. **Performance**
   - `lru-cache` - LRU caching
   - `compression` - Response compression

---

## Database Schema

### Component Templates Table

```sql
CREATE TABLE component_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,  -- BlockType
  category VARCHAR(50) NOT NULL,
  version VARCHAR(20) NOT NULL,
  provider VARCHAR(50) NOT NULL,  -- 'smartstore' | 'third-party' | 'user'
  author VARCHAR(255),
  license VARCHAR(50) NOT NULL,  -- 'MIT' | 'Commercial' | 'Custom'
  price DECIMAL(10, 2),
  react_component_path TEXT NOT NULL,  -- Path to component file
  default_data JSONB,
  default_styles JSONB,
  default_settings JSONB,
  schema JSONB,  -- Zod schema as JSON
  is_dynamic BOOLEAN DEFAULT false,
  requires_auth BOOLEAN DEFAULT false,
  dependencies TEXT[],  -- Array of component IDs
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, version)
);

CREATE INDEX idx_component_templates_type ON component_templates(type);
CREATE INDEX idx_component_templates_category ON component_templates(category);
CREATE INDEX idx_component_templates_provider ON component_templates(provider);
```

### Component Bundles Table (for caching)

```sql
CREATE TABLE component_bundles (
  id SERIAL PRIMARY KEY,
  site_id INTEGER,
  component_ids TEXT[],  -- Array of component IDs in bundle
  bundle_path TEXT NOT NULL,  -- Path to bundle file
  bundle_hash VARCHAR(64),  -- For cache invalidation
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_component_bundles_site_id ON component_bundles(site_id);
CREATE INDEX idx_component_bundles_hash ON component_bundles(bundle_hash);
```

---

## File Structure

### Backend Structure

```
smartstore-api/
├── src/
│   ├── modules/
│   │   ├── components/                    # NEW: Component Template System
│   │   │   ├── models/
│   │   │   │   └── componentTemplate.model.js
│   │   │   ├── services/
│   │   │   │   ├── componentRegistry.service.js
│   │   │   │   ├── componentLoader.service.js
│   │   │   │   ├── componentStorage.service.js
│   │   │   │   ├── reactSSR.service.js
│   │   │   │   ├── bundleService.js
│   │   │   │   └── hydrationService.js
│   │   │   ├── controllers/
│   │   │   │   └── componentTemplate.controller.js
│   │   │   └── routes/
│   │   │       └── componentTemplate.routes.js
│   │   └── sites/
│   │       └── services/
│   │           ├── blockRenderer.service.js  # UPDATE: Use React SSR
│   │           ├── preview.service.js        # UPDATE: Use React SSR
│   │           └── siteRenderer.service.js   # UPDATE: Use React SSR
│   └── components/                         # NEW: React Component Files
│       ├── hero/
│       │   ├── v1.0.0/
│       │   │   └── HeroComponent.tsx
│       │   └── v1.1.0/
│       │       └── HeroComponent.tsx
│       ├── text/
│       │   └── v1.0.0/
│       │       └── TextComponent.tsx
│       └── ...
└── public/
    └── bundles/                            # NEW: Generated JS Bundles
        ├── site-123-bundle.js
        └── ...
```

### Frontend Structure (if needed)

```
smartstore-web/
├── lib/
│   └── components/                         # Component definitions (if shared)
│       └── ...
└── public/
    └── bundles/                            # Client-side bundles (if served from frontend)
        └── ...
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** Set up core infrastructure

1. **Database Setup**
   - Create `component_templates` table
   - Create `component_bundles` table
   - Run migrations

2. **Component Registry Service**
   - Implement `componentRegistry.service.js`
   - CRUD operations for component templates
   - Component lookup by type
   - Version management

3. **Component Storage Service**
   - Implement `componentStorage.service.js`
   - Store/retrieve component files
   - Version management

4. **Component Loader Service**
   - Implement `componentLoader.service.js`
   - Dynamic component loading
   - Component caching

**Deliverables:**
- Database tables created
- Component registry service working
- Component storage service working
- Component loader service working

---

### Phase 2: React SSR (Week 3-4)

**Goal:** Implement server-side rendering

1. **React SSR Service**
   - Implement `reactSSR.service.js`
   - Render React components to HTML
   - Props injection
   - Error handling

2. **Update Block Renderer**
   - Modify `blockRenderer.service.js`
   - Integrate React SSR Service
   - Replace HTML string generation with React SSR

3. **Testing**
   - Test SSR for all block types
   - Verify HTML output
   - Test error handling

**Deliverables:**
- React SSR service working
- Block renderer using React SSR
- All blocks render correctly

---

### Phase 3: Client-Side Hydration (Week 5-6)

**Goal:** Enable client-side interactivity

1. **Bundle Service**
   - Implement `bundleService.js`
   - Identify dynamic components
   - Generate JavaScript bundles
   - Bundle caching

2. **Hydration Service**
   - Implement `hydrationService.js`
   - Generate hydration code
   - Client-side hydration setup

3. **Update Preview Service**
   - Modify `preview.service.js`
   - Include JavaScript bundle in HTML
   - Add hydration code

4. **Update Public Site Serving**
   - Modify `siteRenderer.service.js`
   - Include JavaScript bundle in HTML
   - Add hydration code

**Deliverables:**
- Bundle service working
- Hydration service working
- Preview includes client-side JavaScript
- Public sites include client-side JavaScript

---

### Phase 4: Component Migration (Week 7-8)

**Goal:** Migrate existing blocks to React components

1. **Create React Components**
   - Convert each block type to React component
   - Hero, Text, Image, Gallery, Features, etc.
   - Store in `components/` directory

2. **Register Components**
   - Add components to registry
   - Set up default data, styles, settings
   - Create validation schemas

3. **Testing**
   - Test all components render correctly
   - Test dynamic components work
   - Test hydration works

**Deliverables:**
- All block types have React components
- Components registered in database
- All components working with SSR and hydration

---

### Phase 5: Optimization & Polish (Week 9-10)

**Goal:** Optimize and improve system

1. **Performance Optimization**
   - Component caching
   - Bundle caching
   - Lazy loading
   - Code splitting

2. **Error Handling**
   - Graceful degradation
   - Fallback components
   - Error logging

3. **Documentation**
   - API documentation
   - Component development guide
   - Integration guide

**Deliverables:**
- Optimized performance
- Robust error handling
- Complete documentation

---

## Additional Features

### 1. Template Update Notifications

**Design:**
- Track which sites use which templates
- When template updates, notify site owners
- Optional: "Reapply Template" button

**Implementation:**
- Add `template_usage` table to track site-template relationships
- Notification service (email or in-app)
- UI for template update notifications

### 2. Reapply Template Functionality

**Design:**
- Allow site owners to reapply template
- Option to merge or replace existing content
- Preview changes before applying

**Implementation:**
- New endpoint: `POST /sites/:siteId/templates/reapply`
- Merge/replace logic
- Preview service for changes

### 3. Page Version History UI

**Design:**
- Display version history in page editor
- Restore previous versions
- Compare versions

**Implementation:**
- Frontend component for version history
- API endpoints already exist
- UI for viewing and restoring versions

### 4. Page Duplication Endpoint

**Design:**
- Backend endpoint to duplicate pages
- Copy page content and settings
- Generate new slug

**Implementation:**
- New endpoint: `POST /sites/:siteId/pages/:pageId/duplicate`
- Service method to duplicate page
- Handle slug generation

### 5. Layout Templates Management

**Design:**
- Store layout templates in database
- Allow users to create custom layouts
- Reuse layouts across pages

**Implementation:**
- New table: `layout_templates`
- CRUD operations for layouts
- UI for managing layouts

### 6. Device Selector UI

**Design:**
- Preview with device selector (desktop/tablet/mobile)
- Responsive preview
- Device-specific rendering

**Implementation:**
- Frontend component for device selector
- CSS media queries for preview
- Responsive rendering

---

## Success Criteria

### Phase 1 Success
- ✅ Component registry stores and retrieves components
- ✅ Component loader loads components correctly
- ✅ Database tables created and working

### Phase 2 Success
- ✅ React SSR renders components to HTML
- ✅ Block renderer uses React SSR
- ✅ All blocks render correctly

### Phase 3 Success
- ✅ JavaScript bundles generated
- ✅ Client-side hydration works
- ✅ Dynamic components are interactive

### Phase 4 Success
- ✅ All block types have React components
- ✅ Components work with SSR and hydration
- ✅ No regressions in existing functionality

### Phase 5 Success
- ✅ Performance optimized
- ✅ Error handling robust
- ✅ Documentation complete

---

## Risks & Mitigations

### Risk 1: Performance Impact
**Risk:** React SSR might be slower than HTML strings
**Mitigation:** 
- Implement caching for rendered components
- Use streaming SSR for large pages
- Optimize bundle sizes

### Risk 2: Complexity
**Risk:** System becomes too complex
**Mitigation:**
- Start simple, add complexity gradually
- Good documentation
- Clear separation of concerns

### Risk 3: Migration Issues
**Risk:** Breaking existing functionality
**Mitigation:**
- Gradual migration
- Feature flags
- Extensive testing
- Rollback plan

---

## Next Steps

1. **Review and Approve Design**
   - Review this document
   - Get stakeholder approval
   - Identify any missing requirements

2. **Set Up Development Environment**
   - Install required dependencies
   - Set up database tables
   - Create file structure

3. **Start Phase 1 Implementation**
   - Begin with component registry
   - Set up database
   - Create basic services

4. **Iterate and Improve**
   - Regular reviews
   - Adjust as needed
   - Continuous testing

---

## References

- React SSR Documentation: https://react.dev/reference/react-dom/server
- React Hydration: https://react.dev/reference/react-dom/client/hydrateRoot
- Component Architecture Patterns
- Server-Side Rendering Best Practices


