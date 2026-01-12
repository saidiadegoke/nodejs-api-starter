# Template Content Builder - Implementation Plan

## Overview
Build a UI that allows users to create actual template structures with sections, theme settings, and pages. This is the foundation for templates that can be applied to sites.

## Architecture

### Template Config Structure
```typescript
interface TemplateConfig {
  sections: SectionDefinition[]
  theme: {
    colors: Record<string, string>
    fonts: Record<string, string>
  }
  pages: PageTemplate[]
}

interface SectionDefinition {
  id: string
  type: 'hero' | 'features' | 'testimonials' | 'cta' | 'gallery' | 'text' | 'image'
  name: string
  defaultSettings: Record<string, any>
  defaultContent: Record<string, any>
  customizable: boolean
}

interface PageTemplate {
  slug: string
  title: string
  sections: string[] // Array of section IDs to include
  order: number
}
```

## Key Components

### 1. Template Builder Page
**File:** `smartstore-web/app/dashboard/templates/[id]/builder/page.tsx`

**Functionality:**
- Main editor interface
- Split view: Section library + Page structure + Preview
- Save template config
- Preview template

**Technologies:**
- Next.js App Router
- React
- Redux for state management

### 2. Section Library Panel
**File:** `smartstore-web/components/templates/builder/SectionLibrary.tsx`

**Functionality:**
- Display available section types
- Drag-and-drop to add sections to pages
- Section preview thumbnails
- Filter by category

**Technologies:**
- @dnd-kit/core for drag-and-drop
- React components

### 3. Section Editor
**File:** `smartstore-web/components/templates/builder/SectionEditor.tsx`

**Functionality:**
- Edit section settings (colors, spacing, layout)
- Edit section content (text, images, links)
- Preview section changes
- Save section configuration

**Technologies:**
- React Hook Form for form management
- React Color for color picker
- Image upload component

### 4. Page Structure Manager
**File:** `smartstore-web/components/templates/builder/PageStructureManager.tsx`

**Functionality:**
- List all pages in template
- Add/remove pages
- Reorder pages
- Assign sections to pages
- Set page metadata (slug, title)

**Technologies:**
- @dnd-kit/sortable for reordering
- React components

### 5. Theme Customizer
**File:** `smartstore-web/components/templates/builder/ThemeCustomizer.tsx`

**Functionality:**
- Define default colors
- Define default fonts
- Preview theme changes
- Export theme config

**Technologies:**
- React Color
- Google Fonts API integration

### 6. Template Preview
**File:** `smartstore-web/components/templates/builder/TemplatePreview.tsx`

**Functionality:**
- Live preview of template
- Device selector (desktop/tablet/mobile)
- Navigate between pages
- Show applied theme

**Technologies:**
- Iframe for isolation
- Responsive design utilities

## Backend Components

### 1. Template Builder API
**File:** `smartstore-api/src/modules/sites/routes/templates.routes.js`

**Endpoints:**
- `GET /templates/:id/config` - Get template config
- `PUT /templates/:id/config` - Update template config
- `POST /templates/:id/preview` - Generate preview HTML
- `POST /templates/:id/validate` - Validate template config

**Technologies:**
- Express.js
- PostgreSQL JSONB queries
- Template rendering engine

### 2. Section Registry
**File:** `smartstore-api/src/modules/templates/sections/registry.js`

**Functionality:**
- Define available section types
- Section validation schemas
- Section default configs
- Section rendering logic

**Technologies:**
- JavaScript modules
- JSON Schema for validation

## Data Flow

1. **Load Template**
   - User opens template builder
   - Fetch template config from API
   - Populate editor with existing config

2. **Edit Section**
   - User selects section
   - Open section editor
   - Update section settings/content
   - Save to template config

3. **Add Section to Page**
   - User drags section from library
   - Drop onto page
   - Section added to page's sections array
   - Update template config

4. **Save Template**
   - Validate config
   - Send PUT request to API
   - Update database
   - Show success message

5. **Preview Template**
   - Generate preview HTML from config
   - Render in iframe
   - Allow navigation between pages

## Implementation Steps

### Phase 1: Basic Structure (Week 1)
- [ ] Create template builder page route
- [ ] Create section library component
- [ ] Create page structure manager
- [ ] Basic API endpoints for config CRUD

### Phase 2: Section Editor (Week 2)
- [ ] Create section editor component
- [ ] Implement section settings forms
- [ ] Add section content editor
- [ ] Section validation

### Phase 3: Theme Customizer (Week 3)
- [ ] Create theme customizer component
- [ ] Color picker integration
- [ ] Font selector with Google Fonts
- [ ] Theme preview

### Phase 4: Preview & Polish (Week 4)
- [ ] Template preview iframe
- [ ] Device selector
- [ ] Save/load functionality
- [ ] Error handling
- [ ] Testing

## Technologies

### Frontend
- **Next.js 14+** - Framework
- **React** - UI library
- **Redux Toolkit** - State management
- **@dnd-kit/core** - Drag and drop
- **React Hook Form** - Form management
- **React Color** - Color picker
- **Zod** - Schema validation
- **Tailwind CSS** - Styling

### Backend
- **Express.js** - API framework
- **PostgreSQL** - Database
- **JSONB** - Template config storage
- **Joi/Zod** - Validation

## File Structure

```
smartstore-web/
├── app/
│   └── dashboard/
│       └── templates/
│           └── [id]/
│               └── builder/
│                   └── page.tsx
├── components/
│   └── templates/
│       └── builder/
│           ├── SectionLibrary.tsx
│           ├── SectionEditor.tsx
│           ├── PageStructureManager.tsx
│           ├── ThemeCustomizer.tsx
│           └── TemplatePreview.tsx
└── lib/
    └── templates/
        ├── sectionRegistry.ts
        ├── configValidator.ts
        └── previewGenerator.ts

smartstore-api/
└── src/
    └── modules/
        └── templates/
            ├── routes/
            │   └── builder.routes.js
            ├── controllers/
            │   └── builder.controller.js
            ├── services/
            │   └── builder.service.js
            └── sections/
                └── registry.js
```

## Success Criteria

- [ ] Users can create templates with multiple sections
- [ ] Users can define theme colors and fonts
- [ ] Users can create multiple pages per template
- [ ] Users can preview templates before saving
- [ ] Template config is validated before saving
- [ ] Templates can be applied to sites successfully


