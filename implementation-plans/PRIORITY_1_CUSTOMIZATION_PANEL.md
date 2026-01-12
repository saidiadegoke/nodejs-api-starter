# Customization Panel - Implementation Plan

## Overview
Build a full customization UI that allows users to customize their site's appearance: colors, fonts, logo, and spacing. Changes should be previewed in real-time.

## Architecture

### Customization Data Structure
```typescript
interface SiteCustomization {
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
    border?: string
    success?: string
    warning?: string
    error?: string
  }
  fonts: {
    heading: string
    body: string
    monospace?: string
  }
  logo_url?: string
  favicon_url?: string
  spacing: {
    small: string
    medium: string
    large: string
  }
  settings: {
    headerVisible: boolean
    footerVisible: boolean
    sidebarVisible: boolean
  }
}
```

## Key Components

### 1. Customization Panel Page
**File:** `smartstore-web/app/dashboard/sites/[id]/customize/page.tsx`

**Functionality:**
- Main customization interface
- Split view: Controls + Live Preview
- Save changes
- Reset to defaults
- Export/import settings

**Technologies:**
- Next.js App Router
- React
- Redux for state management

### 2. Color Customizer
**File:** `smartstore-web/components/customization/ColorCustomizer.tsx`

**Functionality:**
- Color picker for each color
- Color presets/palettes
- Live preview updates
- Color validation
- Contrast checker (optional)

**Technologies:**
- **react-color** - Color picker component
- React components
- CSS custom properties for preview

### 3. Font Selector
**File:** `smartstore-web/components/customization/FontSelector.tsx`

**Functionality:**
- Google Fonts integration
- Font preview
- Font weight selection
- Font size presets
- Live preview

**Technologies:**
- Google Fonts API
- React components
- Web Font Loader

### 4. Logo Uploader
**File:** `smartstore-web/components/customization/LogoUploader.tsx`

**Functionality:**
- Drag-and-drop upload
- Image preview
- Image cropping/resizing
- Remove logo
- Favicon upload (separate)

**Technologies:**
- react-dropzone
- react-image-crop (optional)
- Image upload API

### 5. Spacing Customizer
**File:** `smartstore-web/components/customization/SpacingCustomizer.tsx`

**Functionality:**
- Spacing scale editor
- Visual spacing preview
- Preset spacing scales
- Responsive spacing (optional)

**Technologies:**
- React components
- Slider components

### 6. Live Preview
**File:** `smartstore-web/components/customization/LivePreview.tsx`

**Functionality:**
- Real-time preview of changes
- Device selector (desktop/tablet/mobile)
- Preview iframe
- Apply CSS custom properties

**Technologies:**
- Iframe
- CSS custom properties
- postMessage for updates

### 7. Settings Toggle Panel
**File:** `smartstore-web/components/customization/SettingsPanel.tsx`

**Functionality:**
- Toggle header visibility
- Toggle footer visibility
- Toggle sidebar visibility
- Other site settings

**Technologies:**
- React components
- Toggle switches

## Backend Components

### 1. Customization API
**File:** `smartstore-api/src/modules/sites/routes/customization.routes.js`

**Endpoints:**
- `GET /sites/:siteId/customization` - Get customization settings
- `PUT /sites/:siteId/customization` - Update customization
- `POST /sites/:siteId/customization/reset` - Reset to defaults
- `POST /sites/:siteId/customization/logo` - Upload logo
- `POST /sites/:siteId/customization/favicon` - Upload favicon
- `GET /sites/:siteId/customization/preview` - Get preview HTML with customization

**Technologies:**
- Express.js
- PostgreSQL JSONB
- File upload middleware (multer)

### 2. File Upload Service
**File:** `smartstore-api/src/modules/files/services/upload.service.js`

**Functionality:**
- Handle image uploads
- Image validation
- Image optimization/resizing
- Store in S3 or local storage
- Return public URL

**Technologies:**
- multer - File upload
- sharp - Image processing
- AWS S3 or local storage

### 3. Preview Generator
**File:** `smartstore-api/src/modules/sites/services/preview.service.js`

**Functionality:**
- Generate preview HTML
- Inject customization CSS
- Apply theme variables
- Return HTML for iframe

**Technologies:**
- Template engine
- CSS generation

## Data Flow

1. **Load Customization**
   - User opens customization panel
   - Fetch current customization from API
   - Populate all controls
   - Initialize preview

2. **Change Color**
   - User picks color
   - Update color in state
   - Apply CSS custom property to preview
   - Auto-save or manual save

3. **Change Font**
   - User selects font
   - Load font from Google Fonts
   - Apply to preview
   - Update state

4. **Upload Logo**
   - User uploads image
   - Upload to server
   - Get public URL
   - Update logo_url in customization
   - Show in preview

5. **Save Changes**
   - Validate all settings
   - Send PUT request to API
   - Update database
   - Show success message
   - Apply to live site (if published)

## Implementation Steps

### Phase 1: Color Customizer (Week 1)
- [ ] Install react-color
- [ ] Create ColorCustomizer component
- [ ] Color picker UI
- [ ] Live preview integration
- [ ] Save functionality

### Phase 2: Font Selector (Week 2)
- [ ] Google Fonts API integration
- [ ] Font selector component
- [ ] Font preview
- [ ] Live preview updates

### Phase 3: Logo Upload (Week 3)
- [ ] File upload component
- [ ] Image upload API
- [ ] Logo preview
- [ ] Favicon upload

### Phase 4: Spacing & Settings (Week 4)
- [ ] Spacing customizer
- [ ] Settings toggles
- [ ] Export/import
- [ ] Reset to defaults
- [ ] Polish & testing

## Technologies

### Frontend
- **Next.js 14+** - Framework
- **React** - UI library
- **react-color** - Color picker
- **react-dropzone** - File upload
- **react-image-crop** - Image cropping (optional)
- **Google Fonts API** - Font selection
- **Redux Toolkit** - State management
- **Tailwind CSS** - Styling

### Backend
- **Express.js** - API framework
- **PostgreSQL** - Database
- **JSONB** - Customization storage
- **multer** - File upload
- **sharp** - Image processing
- **AWS S3** or local storage

## File Structure

```
smartstore-web/
├── app/
│   └── dashboard/
│       └── sites/
│           └── [id]/
│               └── customize/
│                   └── page.tsx
├── components/
│   └── customization/
│       ├── ColorCustomizer.tsx
│       ├── FontSelector.tsx
│       ├── LogoUploader.tsx
│       ├── SpacingCustomizer.tsx
│       ├── SettingsPanel.tsx
│       └── LivePreview.tsx
└── lib/
    └── customization/
        ├── colorPresets.ts
        ├── fontLoader.ts
        └── previewGenerator.ts

smartstore-api/
└── src/
    └── modules/
        └── sites/
            ├── routes/
            │   └── customization.routes.js
            ├── controllers/
            │   └── customization.controller.js
            ├── services/
            │   ├── customization.service.js
            │   └── preview.service.js
            └── middleware/
                └── uploadLogo.js
```

## Color Presets

```typescript
export const colorPresets = [
  {
    name: 'Default Purple',
    colors: {
      primary: '#4D16D1',
      secondary: '#6B7280',
      accent: '#F59E0B',
      background: '#FFFFFF',
      text: '#111827'
    }
  },
  {
    name: 'Ocean Blue',
    colors: {
      primary: '#3B82F6',
      secondary: '#1E40AF',
      accent: '#10B981',
      background: '#F9FAFB',
      text: '#1F2937'
    }
  },
  // More presets...
]
```

## Google Fonts Integration

```typescript
// Load font dynamically
const loadGoogleFont = (fontFamily: string) => {
  const link = document.createElement('link')
  link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(' ', '+')}:wght@400;500;600;700&display=swap`
  link.rel = 'stylesheet'
  document.head.appendChild(link)
}

// Font options
export const fontOptions = [
  { name: 'Inter', value: 'Inter, sans-serif' },
  { name: 'Roboto', value: 'Roboto, sans-serif' },
  { name: 'Open Sans', value: '"Open Sans", sans-serif' },
  { name: 'Playfair Display', value: '"Playfair Display", serif' },
  // More fonts...
]
```

## Success Criteria

- [ ] Users can customize all colors
- [ ] Users can select fonts from Google Fonts
- [ ] Users can upload logo and favicon
- [ ] Changes are previewed in real-time
- [ ] Customization can be saved
- [ ] Customization can be reset to defaults
- [ ] Settings can be exported/imported
- [ ] Changes apply to live site when published


