# Page Editor - Implementation Plan

## Overview
Build a simple rich text editor for Phase 1 MVP that allows users to create and edit pages with content. Uses Lexical editor for rich text editing.

## Architecture

### Page Content Structure (Phase 1)
```typescript
interface PageContent {
  // Simple structure for Phase 1
  html?: string  // Rich text HTML content
  metadata?: {
    title?: string
    description?: string
    keywords?: string[]
  }
}

// Phase 2 will extend to block-based:
interface PageContentBlocks {
  blocks: Block[]
}
```

## Key Components

### 1. Page Editor Page
**File:** `smartstore-web/app/dashboard/sites/[id]/pages/[pageId]/edit/page.tsx`

**Functionality:**
- Main editor interface
- Save draft functionality
- Publish/unpublish toggle
- Page metadata editor
- Preview button

**Technologies:**
- Next.js App Router
- React
- Redux for state management

### 2. Lexical Editor Component
**File:** `smartstore-web/components/editor/LexicalEditor.tsx`

**Functionality:**
- Rich text editing with Lexical
- Toolbar with formatting options
- Image insertion
- Link insertion
- List support (ordered/unordered)
- Code blocks
- Auto-save drafts

**Technologies:**
- **@lexical/react** - Core Lexical React integration
- **@lexical/rich-text** - Rich text features
- **@lexical/list** - List support
- **@lexical/link** - Link support
- **@lexical/code** - Code block support
- **@lexical/table** - Table support (optional)
- **@lexical/markdown** - Markdown import/export (optional)

### 3. Editor Toolbar
**File:** `smartstore-web/components/editor/EditorToolbar.tsx`

**Functionality:**
- Bold, italic, underline
- Heading levels (H1-H6)
- Lists (ordered/unordered)
- Link insertion
- Image upload
- Code block
- Undo/redo
- Format clearing

**Technologies:**
- Lexical toolbar plugins
- React components

### 4. Page Metadata Editor
**File:** `smartstore-web/components/editor/PageMetadataEditor.tsx`

**Functionality:**
- Edit page title
- Edit page slug (with validation)
- Edit meta description
- Edit meta keywords
- SEO preview

**Technologies:**
- React Hook Form
- Zod validation

### 5. Image Upload Component
**File:** `smartstore-web/components/editor/ImageUpload.tsx`

**Functionality:**
- Drag-and-drop image upload
- Image preview
- Image cropping/resizing (optional)
- Insert image into editor
- Image URL input

**Technologies:**
- react-dropzone
- Image upload API
- Lexical image node

### 6. Auto-Save Hook
**File:** `smartstore-web/lib/hooks/useAutoSave.ts`

**Functionality:**
- Debounced auto-save
- Save indicator (saving/saved)
- Error handling
- Save to draft

**Technologies:**
- useDebounce hook
- API service

## Backend Components

### 1. Page Editor API
**File:** `smartstore-api/src/modules/sites/routes/pages.routes.js`

**Endpoints:**
- `GET /sites/:siteId/pages/:pageId` - Get page with content
- `PUT /sites/:siteId/pages/:pageId` - Update page content
- `POST /sites/:siteId/pages/:pageId/draft` - Save draft
- `POST /sites/:siteId/pages/:pageId/publish` - Publish page
- `POST /sites/:siteId/pages/:pageId/unpublish` - Unpublish page
- `POST /sites/:siteId/pages/:pageId/preview` - Generate preview HTML

**Technologies:**
- Express.js
- PostgreSQL JSONB
- HTML sanitization (DOMPurify or similar)

### 2. Content Sanitization
**File:** `smartstore-api/src/modules/sites/middleware/sanitizeContent.js`

**Functionality:**
- Sanitize HTML content
- Remove dangerous scripts
- Allow safe HTML tags
- Validate content structure

**Technologies:**
- DOMPurify or similar
- HTML parser

## Data Flow

1. **Load Page**
   - User opens page editor
   - Fetch page data from API
   - Initialize Lexical editor with content
   - Load metadata

2. **Edit Content**
   - User types in Lexical editor
   - Content updates in real-time
   - Auto-save triggers after debounce
   - Save indicator shows status

3. **Insert Image**
   - User clicks image button
   - Upload image file
   - Insert image node into editor
   - Image URL stored in content

4. **Save Page**
   - User clicks save
   - Validate content and metadata
   - Send PUT request to API
   - Update database
   - Show success message

5. **Publish/Unpublish**
   - User toggles publish status
   - Update `published` field
   - Update site routing if needed

## Implementation Steps

### Phase 1: Basic Editor (Week 1)
- [ ] Install Lexical dependencies
- [ ] Create LexicalEditor component
- [ ] Basic toolbar (bold, italic, headings)
- [ ] Save/load functionality
- [ ] API endpoints

### Phase 2: Rich Features (Week 2)
- [ ] Add lists, links, code blocks
- [ ] Image upload and insertion
- [ ] Auto-save functionality
- [ ] Content sanitization

### Phase 3: Metadata & Polish (Week 3)
- [ ] Page metadata editor
- [ ] Slug validation
- [ ] SEO preview
- [ ] Publish/unpublish
- [ ] Error handling
- [ ] Testing

## Technologies

### Frontend
- **Next.js 14+** - Framework
- **React** - UI library
- **@lexical/react** - Lexical React integration
- **@lexical/rich-text** - Rich text features
- **@lexical/list** - List support
- **@lexical/link** - Link support
- **@lexical/code** - Code block support
- **@lexical/table** - Table support
- **react-dropzone** - Image upload
- **React Hook Form** - Form management
- **Zod** - Validation
- **Tailwind CSS** - Styling

### Backend
- **Express.js** - API framework
- **PostgreSQL** - Database
- **JSONB** - Content storage
- **DOMPurify** - HTML sanitization
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
│   └── editor/
│       ├── LexicalEditor.tsx
│       ├── EditorToolbar.tsx
│       ├── PageMetadataEditor.tsx
│       └── ImageUpload.tsx
├── lib/
│   ├── hooks/
│   │   └── useAutoSave.ts
│   └── lexical/
│       ├── nodes/
│       │   └── ImageNode.tsx
│       └── plugins/
│           └── ToolbarPlugin.tsx

smartstore-api/
└── src/
    └── modules/
        └── sites/
            ├── routes/
            │   └── pages.routes.js
            ├── controllers/
            │   └── page.controller.js
            ├── services/
            │   └── page.service.js
            └── middleware/
                └── sanitizeContent.js
```

## Lexical Setup

### Installation
```bash
npm install lexical @lexical/react @lexical/rich-text @lexical/list @lexical/link @lexical/code @lexical/table @lexical/markdown
```

### Basic Editor Setup
```typescript
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

const initialConfig = {
  namespace: 'PageEditor',
  theme: editorTheme,
  onError: (error: Error) => {
    console.error(error)
  },
  nodes: [
    // Add custom nodes here
  ],
}
```

## Success Criteria

- [ ] Users can create pages with rich text content
- [ ] Users can format text (bold, italic, headings, lists)
- [ ] Users can insert images and links
- [ ] Content auto-saves as draft
- [ ] Users can publish/unpublish pages
- [ ] Content is sanitized before saving
- [ ] Page metadata can be edited
- [ ] Editor is responsive and performant


