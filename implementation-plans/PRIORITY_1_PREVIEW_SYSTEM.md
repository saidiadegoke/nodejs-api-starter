# Preview System - Implementation Plan

## Overview
Build an iframe-based preview system that allows users to preview their sites in real-time with device selector (desktop/tablet/mobile). Preview should update as users make changes.

## Architecture

### Preview Structure
```typescript
interface PreviewConfig {
  siteId: string
  pageId?: string  // Optional - preview specific page
  device: 'desktop' | 'tablet' | 'mobile'
  customization?: SiteCustomization  // Override customization for preview
  mode: 'published' | 'draft'  // Preview published or draft content
}
```

## Key Components

### 1. Preview Component
**File:** `smartstore-web/components/preview/PreviewIframe.tsx`

**Functionality:**
- Render iframe with preview URL
- Handle postMessage communication
- Device selector
- Loading states
- Error handling

**Technologies:**
- React
- Iframe API
- postMessage API

### 2. Device Selector
**File:** `smartstore-web/components/preview/DeviceSelector.tsx`

**Functionality:**
- Desktop/tablet/mobile buttons
- Device width indicators
- Responsive preview frame
- Device-specific styling

**Technologies:**
- React components
- CSS for device frames

### 3. Preview Toolbar
**File:** `smartstore-web/components/preview/PreviewToolbar.tsx`

**Functionality:**
- Refresh preview
- Open in new tab
- Share preview link
- Toggle device view
- Zoom controls

**Technologies:**
- React components

### 4. Preview Sync Hook
**File:** `smartstore-web/lib/hooks/usePreviewSync.ts`

**Functionality:**
- Sync editor changes to preview
- Debounced updates
- postMessage communication
- Handle preview responses

**Technologies:**
- React hooks
- postMessage API
- Debounce utility

### 5. Preview Page (Rendered in iframe)
**File:** `smartstore-api/src/modules/sites/routes/preview.routes.js`

**Functionality:**
- Render site/page HTML
- Apply customization
- Listen for postMessage updates
- Update content dynamically

**Technologies:**
- Express.js
- Template engine
- postMessage listener

## Backend Components

### 1. Preview API Endpoint
**File:** `smartstore-api/src/modules/sites/routes/preview.routes.js`

**Endpoints:**
- `GET /preview/:siteId` - Preview site homepage
- `GET /preview/:siteId/:pageId` - Preview specific page
- `GET /preview/:siteId?device=desktop` - Device-specific preview
- `GET /preview/:siteId?mode=draft` - Preview draft content

**Technologies:**
- Express.js
- Template rendering
- Site data fetching

### 2. Preview Renderer Service
**File:** `smartstore-api/src/modules/sites/services/preview.service.js`

**Functionality:**
- Fetch site data
- Fetch pages
- Fetch customization
- Apply template
- Generate HTML
- Inject preview script

**Technologies:**
- Template engine (EJS/Handlebars)
- HTML generation
- CSS injection

### 3. Preview Script (Client-side)
**File:** `smartstore-api/public/js/preview-client.js`

**Functionality:**
- Listen for postMessage updates
- Update page content dynamically
- Apply CSS changes
- Handle navigation

**Technologies:**
- Vanilla JavaScript
- postMessage API
- DOM manipulation

## Data Flow

1. **Load Preview**
   - User opens preview
   - Generate preview URL
   - Load iframe with URL
   - Initialize postMessage listener

2. **Update Preview**
   - User makes change in editor
   - Send postMessage to iframe
   - Preview receives message
   - Update content/CSS in preview
   - Show update indicator

3. **Change Device**
   - User selects device
   - Update iframe width
   - Adjust preview frame
   - Maintain content

4. **Navigate in Preview**
   - User clicks link in preview
   - Update preview URL
   - Load new page
   - Maintain device view

## Implementation Steps

### Phase 1: Basic Preview (Week 1)
- [ ] Create preview API endpoint
- [ ] Create preview renderer service
- [ ] Create PreviewIframe component
- [ ] Basic HTML rendering

### Phase 2: Device Selector (Week 2)
- [ ] Device selector component
- [ ] Responsive iframe sizing
- [ ] Device-specific preview

### Phase 3: Live Updates (Week 3)
- [ ] postMessage communication
- [ ] Preview sync hook
- [ ] Dynamic content updates
- [ ] CSS injection

### Phase 4: Polish & Features (Week 4)
- [ ] Preview toolbar
- [ ] Error handling
- [ ] Loading states
- [ ] Share preview link
- [ ] Testing

## Technologies

### Frontend
- **Next.js 14+** - Framework
- **React** - UI library
- **postMessage API** - Communication
- **Iframe** - Preview isolation
- **Tailwind CSS** - Styling

### Backend
- **Express.js** - API framework
- **Template Engine** (EJS/Handlebars) - HTML rendering
- **PostgreSQL** - Data fetching
- **CSS Injection** - Dynamic styling

## File Structure

```
smartstore-web/
├── components/
│   └── preview/
│       ├── PreviewIframe.tsx
│       ├── DeviceSelector.tsx
│       └── PreviewToolbar.tsx
└── lib/
    └── hooks/
        └── usePreviewSync.ts

smartstore-api/
├── src/
│   └── modules/
│       └── sites/
│           ├── routes/
│           │   └── preview.routes.js
│           ├── services/
│           │   └── preview.service.js
│           └── views/
│               └── preview.ejs
└── public/
    └── js/
        └── preview-client.js
```

## Preview URL Structure

```
# Site homepage
/preview/:siteId

# Specific page
/preview/:siteId/:pageId

# With device
/preview/:siteId?device=mobile

# Draft mode
/preview/:siteId?mode=draft

# Combined
/preview/:siteId/:pageId?device=tablet&mode=draft
```

## postMessage Protocol

### Editor → Preview
```typescript
// Update page content
iframe.contentWindow.postMessage({
  type: 'UPDATE_CONTENT',
  data: {
    pageId: '123',
    content: { ... }
  }
}, '*')

// Update customization
iframe.contentWindow.postMessage({
  type: 'UPDATE_CUSTOMIZATION',
  data: {
    colors: { ... },
    fonts: { ... }
  }
}, '*')

// Navigate to page
iframe.contentWindow.postMessage({
  type: 'NAVIGATE',
  data: {
    pageId: '456'
  }
}, '*')
```

### Preview → Editor
```typescript
// Preview loaded
window.parent.postMessage({
  type: 'PREVIEW_READY'
}, '*')

// Navigation in preview
window.parent.postMessage({
  type: 'PREVIEW_NAVIGATION',
  data: {
    pageId: '456',
    url: '/about'
  }
}, '*')
```

## Device Dimensions

```typescript
export const deviceDimensions = {
  desktop: {
    width: '100%',
    minWidth: '1200px',
    height: '100%'
  },
  tablet: {
    width: '768px',
    height: '1024px'
  },
  mobile: {
    width: '375px',
    height: '667px'
  }
}
```

## Preview HTML Template

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{site.name}} - Preview</title>
  <style>
    /* Injected customization CSS */
    :root {
      --color-primary: {{customization.colors.primary}};
      --color-secondary: {{customization.colors.secondary}};
      /* ... */
    }
    /* Site styles */
    {{siteStyles}}
  </style>
</head>
<body>
  <!-- Site content -->
  {{pageContent}}
  
  <!-- Preview client script -->
  <script src="/js/preview-client.js"></script>
  <script>
    // Initialize preview
    window.PREVIEW_CONFIG = {
      siteId: '{{siteId}}',
      mode: '{{mode}}'
    }
  </script>
</body>
</html>
```

## Success Criteria

- [ ] Users can preview sites in iframe
- [ ] Preview supports desktop/tablet/mobile views
- [ ] Preview updates in real-time as users edit
- [ ] Preview shows customization changes
- [ ] Preview can navigate between pages
- [ ] Preview works for both published and draft content
- [ ] Preview is performant and responsive
- [ ] Preview handles errors gracefully


