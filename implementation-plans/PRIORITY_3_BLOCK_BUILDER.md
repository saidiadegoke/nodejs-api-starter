# Block-Based Builder (Phase 2) - Implementation Plan

## Overview
Implement a block-based page builder where users can add, configure, and reorder blocks to build pages. This is Phase 2 functionality building on the simple page editor from Phase 1.

## Architecture

### Block Structure
```typescript
interface Block {
  id: string
  type: BlockType
  data: Record<string, any>
  styles?: Record<string, any>
  settings?: Record<string, any>
  order: number
}

type BlockType = 
  | 'hero'
  | 'text'
  | 'image'
  | 'gallery'
  | 'features'
  | 'testimonials'
  | 'cta'
  | 'form'
  | 'video'
  | 'code'
  | 'spacer'
  | 'divider'

interface PageContent {
  blocks: Block[]
  metadata: {
    title: string
    description: string
  }
}
```

## Key Components

### 1. Block Editor Page
**File:** `smartstore-web/app/dashboard/sites/[id]/pages/[pageId]/edit/page.tsx`

**Functionality:**
- Main block editor interface
- Block list with drag-and-drop
- Block configuration panel
- Live preview
- Save functionality

**Technologies:**
- Next.js App Router
- React
- @dnd-kit for drag-and-drop
- Redux for state

### 2. Block Library
**File:** `smartstore-web/components/blocks/BlockLibrary.tsx`

**Functionality:**
- Display available block types
- Block preview thumbnails
- Search/filter blocks
- Add block to page

**Technologies:**
- React components
- @dnd-kit

### 3. Block List
**File:** `smartstore-web/components/blocks/BlockList.tsx`

**Functionality:**
- Display blocks in order
- Drag to reorder
- Select block
- Delete block
- Duplicate block

**Technologies:**
- React components
- @dnd-kit/sortable

### 4. Block Configuration Panel
**File:** `smartstore-web/components/blocks/BlockConfigPanel.tsx`

**Functionality:**
- Dynamic form based on block type
- Edit block data
- Edit block styles
- Edit block settings
- Preview changes

**Technologies:**
- React Hook Form
- Dynamic form generation
- React components

### 5. Block Components
**Files:** `smartstore-web/components/blocks/types/[BlockType].tsx`

**Functionality:**
- Render block in editor
- Render block in preview
- Block-specific configuration
- Block validation

**Technologies:**
- React components
- TypeScript

### 6. Block Registry
**File:** `smartstore-web/lib/blocks/blockRegistry.ts`

**Functionality:**
- Define all block types
- Block schemas
- Block default configs
- Block icons

**Technologies:**
- TypeScript
- Zod schemas

## Backend Components

### 1. Block API
**File:** `smartstore-api/src/modules/sites/routes/blocks.routes.js`

**Endpoints:**
- `GET /sites/:siteId/pages/:pageId/blocks` - Get page blocks
- `PUT /sites/:siteId/pages/:pageId/blocks` - Update page blocks
- `POST /sites/:siteId/pages/:pageId/blocks/reorder` - Reorder blocks
- `GET /blocks/types` - Get available block types

**Technologies:**
- Express.js
- PostgreSQL JSONB

### 2. Block Validation
**File:** `smartstore-api/src/modules/sites/services/blockValidation.service.js`

**Functionality:**
- Validate block structure
- Validate block data
- Validate block styles
- Return validation errors

**Technologies:**
- Joi/Zod validation
- Schema validation

### 3. Block Renderer
**File:** `smartstore-api/src/modules/sites/services/blockRenderer.service.js`

**Functionality:**
- Render block to HTML
- Apply block styles
- Generate block CSS
- Render full page from blocks

**Technologies:**
- Template engine
- CSS generation

## Data Flow

1. **Load Page Blocks**
   - User opens page editor
   - Fetch page with blocks
   - Initialize block list
   - Load block configurations

2. **Add Block**
   - User selects block from library
   - Create new block with default config
   - Add to block list
   - Open configuration panel

3. **Edit Block**
   - User selects block
   - Open configuration panel
   - Update block data/styles
   - Preview changes
   - Save to page

4. **Reorder Blocks**
   - User drags block
   - Drop in new position
   - Update block order
   - Save to page

5. **Delete Block**
   - User clicks delete
   - Confirm deletion
   - Remove from block list
   - Save to page

## Implementation Steps

### Phase 1: Block Foundation (Week 1-2)
- [ ] Block registry
- [ ] Block data structure
- [ ] Block list component
- [ ] Basic block components (hero, text, image)

### Phase 2: Block Editor (Week 3-4)
- [ ] Drag-and-drop reordering
- [ ] Block configuration panel
- [ ] Block library
- [ ] Add/delete blocks

### Phase 3: Advanced Blocks (Week 5-6)
- [ ] Gallery block
- [ ] Form block
- [ ] Video block
- [ ] Code block
- [ ] More block types

### Phase 4: Styling & Polish (Week 7-8)
- [ ] Block styling options
- [ ] Responsive block settings
- [ ] Block preview
- [ ] Performance optimization
- [ ] Testing

## Technologies

### Frontend
- **Next.js 14+** - Framework
- **React** - UI library
- **@dnd-kit/core** - Drag and drop
- **@dnd-kit/sortable** - Sortable lists
- **React Hook Form** - Form management
- **Zod** - Schema validation
- **Redux Toolkit** - State management
- **Tailwind CSS** - Styling

### Backend
- **Express.js** - API framework
- **PostgreSQL** - Database
- **JSONB** - Block storage
- **Joi/Zod** - Validation

## File Structure

```
smartstore-web/
├── app/
│   └── dashboard/
│       └── sites/
│           └── [id]/
│               └── pages/
│                   └── [pageId]/
│                       └── edit/
│                           └── page.tsx
├── components/
│   └── blocks/
│       ├── BlockLibrary.tsx
│       ├── BlockList.tsx
│       ├── BlockConfigPanel.tsx
│       ├── BlockWrapper.tsx
│       └── types/
│           ├── HeroBlock.tsx
│           ├── TextBlock.tsx
│           ├── ImageBlock.tsx
│           ├── GalleryBlock.tsx
│           └── ...
└── lib/
    └── blocks/
        ├── blockRegistry.ts
        ├── blockSchemas.ts
        └── blockUtils.ts

smartstore-api/
└── src/
    └── modules/
        └── sites/
            ├── routes/
            │   └── blocks.routes.js
            ├── controllers/
            │   └── block.controller.js
            ├── services/
            │   ├── blockValidation.service.js
            │   └── blockRenderer.service.js
            └── blocks/
                └── registry.js
```

## Block Registry Example

```typescript
export const blockRegistry = {
  hero: {
    name: 'Hero Section',
    icon: HeroIcon,
    category: 'layout',
    schema: heroBlockSchema,
    defaultData: {
      title: 'Welcome',
      subtitle: 'To our site',
      image: '',
      ctaText: 'Get Started',
      ctaLink: '#'
    },
    defaultStyles: {
      backgroundColor: '#ffffff',
      textAlign: 'center',
      padding: '4rem 2rem'
    }
  },
  text: {
    name: 'Text Block',
    icon: TextIcon,
    category: 'content',
    schema: textBlockSchema,
    defaultData: {
      content: '<p>Your text here</p>'
    },
    defaultStyles: {
      maxWidth: '800px',
      margin: '0 auto'
    }
  },
  // More blocks...
}
```

## Success Criteria

- [ ] Users can add blocks to pages
- [ ] Users can reorder blocks via drag-and-drop
- [ ] Users can configure block content and styles
- [ ] Users can delete blocks
- [ ] Blocks render correctly in preview
- [ ] Block data is validated
- [ ] Editor is performant with many blocks
- [ ] Blocks are responsive


