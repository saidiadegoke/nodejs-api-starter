# SmartStore Dashboard Implementation Plan

This document provides a detailed, actionable implementation plan with checkboxes to track progress for the SmartStore Dashboard and Builder.

**Selected Architecture:**
- **Page Builder:** Block-Based Builder
- **Content Management:** Hybrid (Visual Builder + CMS)
- **Template System:** Pre-built Template Library
- **Frontend Framework:** Next.js
- **State Management:** Redux Toolkit (already configured)
- **Preview:** Iframe Preview
- **Content Storage:** JSONB with Version History

---

## 📊 Progress Summary

### Phase 0: Project Setup & Foundation
- ✅ **API Client Setup** - Complete (Redux-based auth, all API modules created)
- ✅ **Type Definitions** - Complete
- ✅ **Redux Store** - Complete (auth slice added)

### Phase 1: MVP - Template Customization
- ✅ **Database Schema** - Complete (sites, templates, site_templates, pages, site_customization tables)
- ⚠️ **Template Gallery UI** - Partially Complete
  - ✅ Template grid layout
  - ✅ Template cards with preview
  - ✅ Search and category filtering
  - ✅ Template preview modal
  - ⚠️ Template creation dialog (creates templates with empty configs - no actual content)
- ⚠️ **Template Application** - Partially Complete
  - ✅ Backend API exists
  - ✅ Frontend UI exists
  - ❌ Templates have no actual content/structure (empty configs)
- ✅ **Site Creation & Management** - Complete
  - ✅ Site creation dialog with template selection
  - ✅ Site management page with settings, pages, customization tabs
  - ✅ Site deletion with confirmation
- ❌ **Customization Panel** - Not Implemented
  - ❌ No UI for customizing colors, fonts, logo
  - ❌ Only displays existing customization (read-only)
- ❌ **Simple CMS for Pages** - Not Implemented
  - ✅ API exists
  - ❌ No page editor UI
  - ❌ Only displays pages list (read-only)
- ❌ **Iframe Preview System** - Not Implemented

### Phase 2: Block-Based Builder
- ⏳ Not Started

### Phase 3: Advanced Features & Polish
- ⏳ Not Started

---

## ⚠️ Current Status & Next Steps

### What's Actually Working:
1. ✅ Database schema is in place
2. ✅ Basic UI scaffolding (template gallery, site management page)
3. ✅ API endpoints exist for CRUD operations
4. ✅ Site creation and management works
5. ✅ Template creation works (but creates empty templates)

### What's Missing (Critical):
1. ❌ **Template Content/Structure** - Templates are created with empty configs. Need:
   - Template builder/editor to define actual content
   - Block-based structure definition
   - Default content for templates

2. ❌ **Customization Panel UI** - Currently read-only. Need:
   - Color picker component
   - Font selector
   - Logo uploader
   - Save functionality

3. ❌ **Page Editor** - Pages can be created via API but no UI. Need:
   - Simple page editor (title, slug, content)
   - Rich text editor integration
   - Page preview

4. ❌ **Preview System** - No preview functionality. Need:
   - Preview iframe component
   - Preview API endpoint
   - Live preview updates

---

## Phase 0: Project Setup & Foundation

### 0.1 Next.js Project Setup

#### Initial Setup
- [ ] Verify Next.js 14+ with App Router is installed
- [ ] Configure TypeScript (if not already)
  - [ ] `tsconfig.json` configuration
  - [ ] Type definitions for Next.js
- [ ] Set up project structure
  ```
  /app
    /dashboard
      /templates
      /editor
      /cms
      /preview
    /api
  /components
    /dashboard
    /editor
    /blocks
    /templates
  /lib
    /api
    /hooks
    /stores
    /utils
  /types
  /public
    /templates
  ```
- [ ] Configure environment variables
  - [ ] `.env.local` file
  - [ ] API base URL
  - [ ] Authentication settings
  - [ ] File upload settings

#### Dependencies Installation
- [x] Redux Toolkit and React Redux (already installed)
- [x] Axios (already installed)
- [x] React Hook Form (already installed)
- [x] Zod (already installed)
- [ ] Install drag and drop dependencies
  ```bash
  npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
  ```
- [ ] Install UI library dependencies
  ```bash
  npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu
  npm install @radix-ui/react-select @radix-ui/react-tabs
  npm install @radix-ui/react-popover @radix-ui/react-tooltip
  npm install lucide-react
  npm install class-variance-authority clsx tailwind-merge
  ```
- [ ] Install form and editor dependencies
  ```bash
  npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-color
  npm install react-color
  npm install react-dropzone
  ```
- [ ] Install utility dependencies
  ```bash
  npm install date-fns
  npm install zod
  npm install nanoid
  ```

### 0.2 State Management Setup

**Note:** Using Redux Toolkit (already configured) instead of React Query + Zustand.

#### Redux Store (Already Configured)
- [x] Redux store is set up in `lib/redux/store.ts`
- [x] Redux provider is configured in `components/providers/index.tsx`
- [x] Store slice exists for store management
- [x] User slice exists for user management
- [x] Theme slice exists for theme management

#### Redux Slices for Dashboard (To Be Created)
- [ ] Create editor slice for page editor state
  ```typescript
  // lib/redux/slices/editorSlice.ts
  import { createSlice, PayloadAction } from '@reduxjs/toolkit'
  
  interface EditorState {
    currentPage: Page | null
    selectedBlock: string | null
    isPreviewMode: boolean
  }
  
  const initialState: EditorState = {
    currentPage: null,
    selectedBlock: null,
    isPreviewMode: false,
  }
  
  const editorSlice = createSlice({
    name: 'editor',
    initialState,
    reducers: {
      setCurrentPage: (state, action: PayloadAction<Page | null>) => {
        state.currentPage = action.payload
      },
      setSelectedBlock: (state, action: PayloadAction<string | null>) => {
        state.selectedBlock = action.payload
      },
      togglePreviewMode: (state) => {
        state.isPreviewMode = !state.isPreviewMode
      },
    },
  })
  
  export const { setCurrentPage, setSelectedBlock, togglePreviewMode } = editorSlice.actions
  export default editorSlice.reducer
  ```
- [ ] Create template slice for template selection and customization
  ```typescript
  // lib/redux/slices/templateSlice.ts
  import { createSlice, PayloadAction } from '@reduxjs/toolkit'
  
  interface TemplateState {
    selectedTemplate: Template | null
    customization: CustomizationSettings | null
  }
  
  const initialState: TemplateState = {
    selectedTemplate: null,
    customization: null,
  }
  
  const templateSlice = createSlice({
    name: 'template',
    initialState,
    reducers: {
      setSelectedTemplate: (state, action: PayloadAction<Template | null>) => {
        state.selectedTemplate = action.payload
      },
      updateCustomization: (state, action: PayloadAction<Partial<CustomizationSettings>>) => {
        if (state.customization) {
          state.customization = { ...state.customization, ...action.payload }
        }
      },
    },
  })
  
  export const { setSelectedTemplate, updateCustomization } = templateSlice.actions
  export default templateSlice.reducer
  ```
- [ ] Create preview slice for preview state
  ```typescript
  // lib/redux/slices/previewSlice.ts
  import { createSlice, PayloadAction } from '@reduxjs/toolkit'
  
  interface PreviewState {
    previewUrl: string | null
    deviceType: 'desktop' | 'tablet' | 'mobile'
  }
  
  const initialState: PreviewState = {
    previewUrl: null,
    deviceType: 'desktop',
  }
  
  const previewSlice = createSlice({
    name: 'preview',
    initialState,
    reducers: {
      setPreviewUrl: (state, action: PayloadAction<string | null>) => {
        state.previewUrl = action.payload
      },
      setDeviceType: (state, action: PayloadAction<'desktop' | 'tablet' | 'mobile'>) => {
        state.deviceType = action.payload
      },
    },
  })
  
  export const { setPreviewUrl, setDeviceType } = previewSlice.actions
  export default previewSlice.reducer
  ```
- [ ] Add new slices to Redux store
  ```typescript
  // lib/redux/store.ts
  import editorReducer from './slices/editorSlice'
  import templateReducer from './slices/templateSlice'
  import previewReducer from './slices/previewSlice'
  
  export const store = configureStore({
    reducer: {
      theme: themeReducer,
      user: userReducer,
      store: storeReducer,
      editor: editorReducer,
      template: templateReducer,
      preview: previewReducer,
    },
    // ... rest of config
  })
  ```

### 0.3 API Client Setup

#### API Service Layer
- [x] API client is configured in `lib/api/apiService.ts`
- [x] Auth interceptors are set up with Redux (migrated from NextAuth)
- [x] Token refresh logic is implemented
- [x] API modules created:
  - [x] `lib/api/modules/stores-api.ts` - Store management
  - [x] `lib/api/modules/templates-api.ts` - Template operations
  - [x] `lib/api/modules/pages-api.ts` - Page CRUD operations
  - [x] `lib/api/modules/customization-api.ts` - Customization settings
  - [x] `lib/api/modules/sites-api.ts` - Site and domain management
- [x] All endpoints use correct paths (no `/api` prefix)
- [x] Type definitions exported from modules

### 0.4 Type Definitions

#### TypeScript Types
- [x] Template types defined in `lib/api/modules/templates-api.ts`
- [x] Page types defined in `lib/api/modules/pages-api.ts`
- [x] Block types defined in `lib/api/modules/pages-api.ts`
- [x] Customization types defined in `lib/api/modules/customization-api.ts`
- [x] Site types defined in `lib/api/modules/sites-api.ts`
- [x] All types exported from `lib/api/modules/index.ts`

---

## Phase 1: MVP - Template Customization

### 1.1 Database Schema (Backend)

#### Templates Table
- [x] Create templates table
  ```sql
  CREATE TABLE templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    preview_image_url TEXT,
    thumbnail_url TEXT,
    config JSONB NOT NULL,
    is_premium BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE INDEX idx_templates_category ON templates(category);
  CREATE INDEX idx_templates_active ON templates(is_active);
  ```
- [x] Create site_templates table (track which template a site uses)
  ```sql
  CREATE TABLE site_templates (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    template_id INTEGER REFERENCES templates(id),
    customization_settings JSONB,
    applied_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(site_id)
  );
  ```

#### Customization Settings
- [x] Add customization column to sites table (or separate table)
  ```sql
  CREATE TABLE site_customization (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE UNIQUE,
    colors JSONB,
    fonts JSONB,
    logo_url TEXT,
    spacing JSONB,
    updated_at TIMESTAMP DEFAULT NOW()
  );
  ```

### 1.2 Template Gallery UI

#### Template List Page
- [x] Create template gallery route
  - [x] `/app/dashboard/templates/page.tsx`
- [x] Design template grid layout
  ```typescript
  // components/templates/TemplateGrid.tsx
  export function TemplateGrid() {
    const { data: templates, isLoading } = useTemplates()
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates?.map(template => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    )
  }
  ```
- [x] Create template card component
  ```typescript
  // components/templates/TemplateCard.tsx
  export function TemplateCard({ template }: { template: Template }) {
    return (
      <Card>
        <CardHeader>
          <img src={template.thumbnail} alt={template.name} />
        </CardHeader>
        <CardContent>
          <h3>{template.name}</h3>
          <p>{template.description}</p>
          <Button onClick={() => handlePreview(template)}>Preview</Button>
          <Button onClick={() => handleApply(template)}>Apply</Button>
        </CardContent>
      </Card>
    )
  }
  ```
- [x] Add template filtering
  - [x] Filter by category
  - [x] Search by name
  - [ ] Sort options (newest, popular, etc.)
- [x] Add template preview modal
- [ ] **Template Content/Config** - NOT IMPLEMENTED
  - [ ] Templates are created with empty configs (no actual content)
  - [ ] Need template builder/editor to create actual template structures
  - [ ] Need block-based content definition
  ```typescript
  // components/templates/TemplatePreview.tsx
  export function TemplatePreview({ template }: { template: Template }) {
    return (
      <Dialog>
        <DialogContent className="max-w-6xl">
          <img src={template.previewImage} alt={template.name} />
          <DialogFooter>
            <Button onClick={() => handleApply(template)}>Apply Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
  ```

#### Template Application
- [x] Create template application API endpoint
  ```javascript
  // Backend: routes/templates.js
  router.post('/sites/:siteId/templates', async (req, res) => {
    const { siteId } = req.params
    const { templateId } = req.body
    
    // Get template config
    const template = await db.query('SELECT * FROM templates WHERE id = $1', [templateId])
    
    // Create pages from template
    for (const pageTemplate of template.config.pages) {
      await db.query(
        'INSERT INTO pages (site_id, slug, title, content) VALUES ($1, $2, $3, $4)',
        [siteId, pageTemplate.slug, pageTemplate.title, JSON.stringify(pageTemplate.content)]
      )
    }
    
    // Save template reference
    await db.query(
      'INSERT INTO site_templates (site_id, template_id) VALUES ($1, $2) ON CONFLICT (site_id) DO UPDATE SET template_id = $2',
      [siteId, templateId]
    )
    
    res.json({ success: true })
  })
  ```
- [x] Create template application UI
  ```typescript
  // components/templates/ApplyTemplateDialog.tsx
  export function ApplyTemplateDialog({ template, onApply }: Props) {
    const handleApply = async () => {
      await templatesAPI.applyTemplate(siteId, template.id)
      onApply()
    }
    
    return (
      <Dialog>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Template</DialogTitle>
            <DialogDescription>
              This will replace your current site design with this template.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleApply}>Apply Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
  ```

### 1.3 Site Creation & Management

#### Site Creation
- [x] Create site creation API endpoint (backend)
- [x] Create site creation UI component
  - [x] `components/sites/CreateSiteDialog.tsx`
  - [x] Integrated into template gallery and stores page
- [x] Site creation with template selection
- [x] Slug validation and auto-generation

#### Site Management
- [x] Create site management page
  - [x] `/app/dashboard/sites/[id]/page.tsx`
- [x] Site settings management (name, slug, domain, status)
- [x] Site deletion with confirmation
- [x] Integration with pages and customization tabs

### 1.4 Customization Panel

#### Customization UI
- [x] Create customization page route (integrated into site management page)
  - [x] `/app/dashboard/sites/[id]/page.tsx` (customization tab - READ ONLY)
- [ ] Create customization panel component
  - [ ] Color picker UI
  - [ ] Font selector UI
  - [ ] Logo uploader UI
  - [ ] Live preview updates
  ```typescript
  // components/customization/CustomizationPanel.tsx
  export function CustomizationPanel() {
    const { data: settings } = useCustomizationSettings(siteId)
    const updateSettings = useUpdateCustomization()
    
    return (
      <Tabs defaultValue="colors">
        <TabsList>
          <TabsTrigger value="colors">Colors</TabsTrigger>
          <TabsTrigger value="fonts">Fonts</TabsTrigger>
          <TabsTrigger value="logo">Logo</TabsTrigger>
        </TabsList>
        
        <TabsContent value="colors">
          <ColorCustomizer settings={settings} onUpdate={updateSettings} />
        </TabsContent>
        <TabsContent value="fonts">
          <FontCustomizer settings={settings} onUpdate={updateSettings} />
        </TabsContent>
        <TabsContent value="logo">
          <LogoUploader settings={settings} onUpdate={updateSettings} />
        </TabsContent>
      </Tabs>
    )
  }
  ```

#### Color Customization
- [ ] **NOT IMPLEMENTED** - Create color picker component
  ```typescript
  // components/customization/ColorCustomizer.tsx
  import { ChromePicker } from 'react-color'
  
  export function ColorCustomizer({ settings, onUpdate }: Props) {
    const [colors, setColors] = useState(settings.colors)
    
    const handleColorChange = (key: string, color: any) => {
      const newColors = { ...colors, [key]: color.hex }
      setColors(newColors)
      onUpdate({ colors: newColors })
    }
    
    return (
      <div className="space-y-4">
        <div>
          <Label>Primary Color</Label>
          <ChromePicker
            color={colors.primary}
            onChange={(color) => handleColorChange('primary', color)}
          />
        </div>
        {/* Repeat for other colors */}
      </div>
    )
  }
  ```
- [ ] Add color presets
  ```typescript
  const colorPresets = [
    { name: 'Blue', primary: '#3B82F6', secondary: '#1E40AF' },
    { name: 'Green', primary: '#10B981', secondary: '#059669' },
    // ...
  ]
  ```
- [ ] Implement live preview updates

#### Font Customization
- [ ] **NOT IMPLEMENTED** - Create font selector component
  ```typescript
  // components/customization/FontCustomizer.tsx
  export function FontCustomizer({ settings, onUpdate }: Props) {
    const fonts = [
      { name: 'Inter', value: 'Inter, sans-serif' },
      { name: 'Roboto', value: 'Roboto, sans-serif' },
      { name: 'Playfair Display', value: 'Playfair Display, serif' },
      // ...
    ]
    
    return (
      <div className="space-y-4">
        <div>
          <Label>Heading Font</Label>
          <Select
            value={settings.fonts.heading}
            onValueChange={(value) => onUpdate({ fonts: { ...settings.fonts, heading: value } })}
          >
            {fonts.map(font => (
              <SelectItem key={font.value} value={font.value}>
                {font.name}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div>
          <Label>Body Font</Label>
          <Select
            value={settings.fonts.body}
            onValueChange={(value) => onUpdate({ fonts: { ...settings.fonts, body: value } })}
          >
            {fonts.map(font => (
              <SelectItem key={font.value} value={font.value}>
                {font.name}
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>
    )
  }
  ```
- [ ] Add Google Fonts integration
  ```typescript
  // lib/utils/fonts.ts
  export function loadGoogleFont(fontFamily: string) {
    const fontName = fontFamily.split(',')[0].trim()
    const link = document.createElement('link')
    link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@400;500;600;700&display=swap`
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  ```

#### Logo Upload
- [ ] **NOT IMPLEMENTED** - Create logo uploader component
  ```typescript
  // components/customization/LogoUploader.tsx
  import { useDropzone } from 'react-dropzone'
  
  export function LogoUploader({ settings, onUpdate }: Props) {
    const onDrop = async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      const formData = new FormData()
      formData.append('logo', file)
      
      const response = await apiClient.post('/api/sites/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      onUpdate({ logo: { url: response.data.url, alt: 'Site Logo' } })
    }
    
    const { getRootProps, getInputProps } = useDropzone({
      onDrop,
      accept: { 'image/*': ['.png', '.jpg', '.svg'] },
      maxFiles: 1,
    })
    
    return (
      <div {...getRootProps()}>
        <input {...getInputProps()} />
        {settings.logo.url ? (
          <img src={settings.logo.url} alt={settings.logo.alt} />
        ) : (
          <div>Drop logo here or click to upload</div>
        )}
      </div>
    )
  }
  ```
- [ ] Implement logo upload backend endpoint
  ```javascript
  // Backend: routes/upload.js
  const multer = require('multer')
  const upload = multer({ dest: 'uploads/logos/' })
  
  router.post('/sites/:siteId/logo', upload.single('logo'), async (req, res) => {
    // Upload to S3 or local storage
    const logoUrl = await uploadToStorage(req.file)
    
    await db.query(
      'UPDATE site_customization SET logo_url = $1 WHERE site_id = $2',
      [logoUrl, req.params.siteId]
    )
    
    res.json({ url: logoUrl })
  })
  ```

### 1.4 Simple CMS for Pages/Content

#### Pages List View
- [x] Create pages management route (integrated into site management page)
  - [x] `/app/dashboard/sites/[id]/page.tsx` (pages tab - READ ONLY)
- [ ] Create pages list component (currently just displays, no actions)
  ```typescript
  // components/cms/PagesList.tsx
  export function PagesList({ siteId }: { siteId: string }) {
    const { data: pages } = usePages(siteId)
    
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2>Pages</h2>
          <Button onClick={() => handleCreatePage()}>Create Page</Button>
        </div>
        
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages?.map(page => (
              <TableRow key={page.id}>
                <TableCell>{page.title}</TableCell>
                <TableCell>{page.slug}</TableCell>
                <TableCell>
                  <Badge>{page.published ? 'Published' : 'Draft'}</Badge>
                </TableCell>
                <TableCell>
                  <Button onClick={() => handleEdit(page)}>Edit</Button>
                  <Button onClick={() => handleDelete(page)}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }
  ```

#### Page Editor (Simple)
- [ ] **NOT IMPLEMENTED** - Create simple page editor
  ```typescript
  // components/cms/SimplePageEditor.tsx
  export function SimplePageEditor({ page }: { page: Page }) {
    const [title, setTitle] = useState(page.title)
    const [slug, setSlug] = useState(page.slug)
    const [content, setContent] = useState(page.content)
    
    const handleSave = async () => {
      await pagesAPI.update(siteId, page.id, { title, slug, content })
    }
    
    return (
      <div className="space-y-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page Title"
        />
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="page-slug"
        />
        <RichTextEditor
          content={content}
          onChange={setContent}
        />
        <Button onClick={handleSave}>Save</Button>
      </div>
    )
  }
  ```
- [ ] Integrate rich text editor (TipTap)
  ```typescript
  // components/cms/RichTextEditor.tsx
  import { useEditor, EditorContent } from '@tiptap/react'
  import StarterKit from '@tiptap/starter-kit'
  
  export function RichTextEditor({ content, onChange }: Props) {
    const editor = useEditor({
      extensions: [StarterKit],
      content,
      onUpdate: ({ editor }) => {
        onChange(editor.getHTML())
      },
    })
    
    return (
      <div>
        <Toolbar editor={editor} />
        <EditorContent editor={editor} />
      </div>
    )
  }
  ```

#### Content Management API
- [x] Create pages API endpoints (backend)
  ```javascript
  // Backend: routes/pages.js
  router.get('/sites/:siteId/pages', async (req, res) => {
    const pages = await db.query(
      'SELECT * FROM pages WHERE site_id = $1 ORDER BY created_at DESC',
      [req.params.siteId]
    )
    res.json(pages.rows)
  })
  
  router.post('/sites/:siteId/pages', async (req, res) => {
    const { title, slug, content } = req.body
    const page = await db.query(
      'INSERT INTO pages (site_id, title, slug, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.siteId, title, slug, JSON.stringify(content)]
    )
    res.json(page.rows[0])
  })
  
  router.put('/sites/:siteId/pages/:pageId', async (req, res) => {
    const { title, slug, content } = req.body
    const page = await db.query(
      'UPDATE pages SET title = $1, slug = $2, content = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
      [title, slug, JSON.stringify(content), req.params.pageId]
    )
    res.json(page.rows[0])
  })
  
  router.delete('/sites/:siteId/pages/:pageId', async (req, res) => {
    await db.query('DELETE FROM pages WHERE id = $1', [req.params.pageId])
    res.json({ success: true })
  })
  ```

### 1.6 Iframe Preview System

#### Preview Component
- [ ] **NOT IMPLEMENTED** - Create preview iframe component
  ```typescript
  // components/preview/PreviewIframe.tsx
  export function PreviewIframe({ siteId, pageId }: { siteId: string, pageId?: string }) {
    const previewUrl = pageId 
      ? `${process.env.NEXT_PUBLIC_PREVIEW_URL}/${siteId}/${pageId}`
      : `${process.env.NEXT_PUBLIC_PREVIEW_URL}/${siteId}`
    
    const [deviceType, setDeviceType] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
    
    const deviceWidths = {
      desktop: '100%',
      tablet: '768px',
      mobile: '375px',
    }
    
    return (
      <div className="preview-container">
        <div className="device-selector">
          <Button onClick={() => setDeviceType('desktop')}>Desktop</Button>
          <Button onClick={() => setDeviceType('tablet')}>Tablet</Button>
          <Button onClick={() => setDeviceType('mobile')}>Mobile</Button>
        </div>
        
        <div 
          className="preview-wrapper"
          style={{ width: deviceWidths[deviceType] }}
        >
          <iframe
            src={previewUrl}
            className="w-full h-full border-0"
            style={{ height: '800px' }}
          />
        </div>
      </div>
    )
  }
  ```

#### Preview API Endpoint
- [ ] **NOT IMPLEMENTED** - Create preview route (backend)
  ```javascript
  // Backend: routes/preview.js
  router.get('/preview/:siteId', async (req, res) => {
    const { siteId } = req.params
    
    // Get site data
    const site = await db.query('SELECT * FROM sites WHERE id = $1', [siteId])
    const customization = await db.query(
      'SELECT * FROM site_customization WHERE site_id = $1',
      [siteId]
    )
    
    // Render site with customization
    res.render('preview', {
      site: site.rows[0],
      customization: customization.rows[0],
    })
  })
  
  router.get('/preview/:siteId/:pageId', async (req, res) => {
    const { siteId, pageId } = req.params
    const page = await db.query(
      'SELECT * FROM pages WHERE id = $1 AND site_id = $2',
      [pageId, siteId]
    )
    
    res.render('preview-page', { page: page.rows[0] })
  })
  ```

#### Preview Communication
- [ ] **NOT IMPLEMENTED** - Set up postMessage communication
  ```typescript
  // lib/hooks/usePreviewSync.ts
  export function usePreviewSync() {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const { currentPage } = useEditorStore()
    
    useEffect(() => {
      if (iframeRef.current && currentPage) {
        iframeRef.current.contentWindow?.postMessage({
          type: 'UPDATE_PAGE',
          data: currentPage,
        }, '*')
      }
    }, [currentPage])
    
    return iframeRef
  }
  ```
- [ ] Handle preview updates in iframe
  ```typescript
  // In preview page
  useEffect(() => {
    window.addEventListener('message', (event) => {
      if (event.data.type === 'UPDATE_PAGE') {
        updatePageContent(event.data.data)
      }
    })
  }, [])
  ```

#### Auto-refresh on Changes
- [ ] **NOT IMPLEMENTED** - Implement debounced preview updates
  ```typescript
  // lib/hooks/useDebouncedPreview.ts
  import { useDebouncedCallback } from 'use-debounce'
  
  export function useDebouncedPreview() {
    const { currentPage } = useEditorStore()
    const iframeRef = useRef<HTMLIFrameElement>(null)
    
    const updatePreview = useDebouncedCallback(() => {
      if (iframeRef.current && currentPage) {
        iframeRef.current.contentWindow?.postMessage({
          type: 'UPDATE_PAGE',
          data: currentPage,
        }, '*')
      }
    }, 500)
    
    useEffect(() => {
      updatePreview()
    }, [currentPage, updatePreview])
    
    return iframeRef
  }
  ```

---

## Phase 2: Block-Based Builder

### 2.1 Block System Foundation

#### Block Types Definition
- [ ] Create block type registry
  ```typescript
  // lib/blocks/blockRegistry.ts
  export const blockRegistry = {
    hero: {
      name: 'Hero Section',
      icon: HeroIcon,
      component: HeroBlock,
      defaultData: {
        title: 'Welcome',
        subtitle: 'Your subtitle here',
        image: null,
        ctaText: 'Get Started',
        ctaLink: '#',
      },
    },
    text: {
      name: 'Text Block',
      icon: TextIcon,
      component: TextBlock,
      defaultData: {
        content: '<p>Your text here</p>',
      },
    },
    image: {
      name: 'Image',
      icon: ImageIcon,
      component: ImageBlock,
      defaultData: {
        src: null,
        alt: '',
        caption: '',
      },
    },
    // ... more blocks
  }
  ```
- [ ] Create base block component
  ```typescript
  // components/blocks/BaseBlock.tsx
  interface BaseBlockProps {
    block: Block
    isSelected: boolean
    onSelect: () => void
    onUpdate: (data: Partial<Block['data']>) => void
    onDelete: () => void
  }
  
  export function BaseBlock({ block, isSelected, onSelect, onUpdate, onDelete }: BaseBlockProps) {
    const BlockComponent = blockRegistry[block.type].component
    
    return (
      <div
        className={cn('block-wrapper', isSelected && 'selected')}
        onClick={onSelect}
      >
        <BlockComponent
          data={block.data}
          onUpdate={onUpdate}
        />
        {isSelected && (
          <BlockToolbar onDelete={onDelete} />
        )}
      </div>
    )
  }
  ```

#### Block Components
- [ ] Create Hero block component
  ```typescript
  // components/blocks/HeroBlock.tsx
  export function HeroBlock({ data, onUpdate }: BlockProps) {
    return (
      <section className="hero-section">
        <h1>{data.title}</h1>
        <p>{data.subtitle}</p>
        {data.image && <img src={data.image} alt={data.alt} />}
        <Button href={data.ctaLink}>{data.ctaText}</Button>
      </section>
    )
  }
  ```
- [ ] Create Text block component
- [ ] Create Image block component
- [ ] Create Gallery block component
- [ ] Create Button block component
- [ ] Create Form block component
- [ ] Create Video block component
- [ ] Create Spacer block component

### 2.2 Block Editor UI

#### Editor Layout
- [ ] Create block editor page
  - [ ] `/app/dashboard/editor/[pageId]/page.tsx`
- [ ] Design editor layout
  ```typescript
  // components/editor/EditorLayout.tsx
  export function EditorLayout({ pageId }: { pageId: string }) {
    const { currentPage, setCurrentPage } = useEditorStore()
    const { data: page } = usePage(pageId)
    
    return (
      <div className="editor-layout">
        <EditorSidebar />
        <div className="editor-main">
          <EditorToolbar />
          <BlockEditor page={page} />
        </div>
        <EditorPropertiesPanel />
        <PreviewPanel />
      </div>
    )
  }
  ```

#### Block List/Canvas
- [ ] Create block list component
  ```typescript
  // components/editor/BlockEditor.tsx
  import { DndContext, closestCenter } from '@dnd-kit/core'
  import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
  
  export function BlockEditor({ page }: { page: Page }) {
    const [blocks, setBlocks] = useState(page.content.blocks)
    const { selectedBlock, setSelectedBlock } = useEditorStore()
    
    const handleDragEnd = (event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        setBlocks((items) => {
          const oldIndex = items.findIndex(item => item.id === active.id)
          const newIndex = items.findIndex(item => item.id === over.id)
          return arrayMove(items, oldIndex, newIndex)
        })
      }
    }
    
    return (
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks} strategy={verticalListSortingStrategy}>
          <div className="block-list">
            {blocks.map(block => (
              <SortableBlock
                key={block.id}
                block={block}
                isSelected={selectedBlock === block.id}
                onSelect={() => setSelectedBlock(block.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    )
  }
  ```

#### Drag and Drop Implementation
- [ ] Install and configure @dnd-kit
- [ ] Create sortable block wrapper
  ```typescript
  // components/editor/SortableBlock.tsx
  import { useSortable } from '@dnd-kit/sortable'
  import { CSS } from '@dnd-kit/utilities'
  
  export function SortableBlock({ block, isSelected, onSelect }: Props) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: block.id })
    
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }
    
    return (
      <div ref={setNodeRef} style={style} {...attributes}>
        <div {...listeners} className="drag-handle">
          <GripVertical />
        </div>
        <BaseBlock
          block={block}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      </div>
    )
  }
  ```
- [ ] Add visual drag feedback
- [ ] Implement drag constraints (prevent invalid drops)

#### Block Library Sidebar
- [ ] Create block library component
  ```typescript
  // components/editor/BlockLibrary.tsx
  export function BlockLibrary({ onAddBlock }: { onAddBlock: (type: BlockType) => void }) {
    return (
      <div className="block-library">
        <h3>Blocks</h3>
        <div className="block-categories">
          {Object.entries(blockRegistry).map(([type, config]) => (
            <button
              key={type}
              onClick={() => onAddBlock(type as BlockType)}
              className="block-item"
            >
              <config.icon />
              <span>{config.name}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }
  ```
- [ ] Add block categories
- [ ] Add search functionality
- [ ] Add block previews

### 2.3 Block Configuration Panels

#### Properties Panel
- [ ] Create properties panel component
  ```typescript
  // components/editor/PropertiesPanel.tsx
  export function PropertiesPanel() {
    const { selectedBlock } = useEditorStore()
    const { currentPage, updateBlock } = useEditorStore()
    
    if (!selectedBlock) {
      return <div>Select a block to edit</div>
    }
    
    const blockConfig = blockRegistry[selectedBlock.type]
    const BlockProperties = blockConfig.propertiesComponent
    
    return (
      <div className="properties-panel">
        <h3>Block Properties</h3>
        <BlockProperties
          block={selectedBlock}
          onUpdate={(data) => updateBlock(selectedBlock.id, data)}
        />
      </div>
    )
  }
  ```

#### Block-Specific Property Editors
- [ ] Create Hero block properties
  ```typescript
  // components/blocks/properties/HeroProperties.tsx
  export function HeroProperties({ block, onUpdate }: Props) {
    return (
      <div className="space-y-4">
        <div>
          <Label>Title</Label>
          <Input
            value={block.data.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
          />
        </div>
        <div>
          <Label>Subtitle</Label>
          <Textarea
            value={block.data.subtitle}
            onChange={(e) => onUpdate({ subtitle: e.target.value })}
          />
        </div>
        <div>
          <Label>Image</Label>
          <ImageUpload
            value={block.data.image}
            onChange={(url) => onUpdate({ image: url })}
          />
        </div>
        <div>
          <Label>CTA Text</Label>
          <Input
            value={block.data.ctaText}
            onChange={(e) => onUpdate({ ctaText: e.target.value })}
          />
        </div>
        <div>
          <Label>CTA Link</Label>
          <Input
            value={block.data.ctaLink}
            onChange={(e) => onUpdate({ ctaLink: e.target.value })}
          />
        </div>
      </div>
    )
  }
  ```
- [ ] Create Text block properties
- [ ] Create Image block properties
- [ ] Create Gallery block properties
- [ ] Create Button block properties
- [ ] Create Form block properties

#### Style Customization
- [ ] Add style editor for blocks
  ```typescript
  // components/editor/StyleEditor.tsx
  export function StyleEditor({ block, onUpdate }: Props) {
    return (
      <div className="style-editor">
        <Tabs defaultValue="layout">
          <TabsList>
            <TabsTrigger value="layout">Layout</TabsTrigger>
            <TabsTrigger value="spacing">Spacing</TabsTrigger>
            <TabsTrigger value="colors">Colors</TabsTrigger>
            <TabsTrigger value="typography">Typography</TabsTrigger>
          </TabsList>
          
          <TabsContent value="layout">
            <LayoutEditor block={block} onUpdate={onUpdate} />
          </TabsContent>
          <TabsContent value="spacing">
            <SpacingEditor block={block} onUpdate={onUpdate} />
          </TabsContent>
          <TabsContent value="colors">
            <ColorEditor block={block} onUpdate={onUpdate} />
          </TabsContent>
          <TabsContent value="typography">
            <TypographyEditor block={block} onUpdate={onUpdate} />
          </TabsContent>
        </Tabs>
      </div>
    )
  }
  ```

### 2.4 Block Data Management

#### Save Block Changes
- [ ] Implement auto-save for blocks
  ```typescript
  // lib/hooks/useAutoSave.ts
  import { useDebouncedCallback } from 'use-debounce'
  
  export function useAutoSave(pageId: string) {
    const { currentPage } = useEditorStore()
    const updatePage = useUpdatePage()
    
    const save = useDebouncedCallback(async () => {
      if (currentPage) {
        await updatePage.mutateAsync({
          pageId,
          data: currentPage,
        })
      }
    }, 1000)
    
    useEffect(() => {
      if (currentPage) {
        save()
      }
    }, [currentPage, save])
  }
  ```
- [ ] Add save status indicator
  ```typescript
  // components/editor/SaveStatus.tsx
  export function SaveStatus() {
    const { isSaving, lastSaved } = useSaveStatus()
    
    return (
      <div className="save-status">
        {isSaving ? (
          <span>Saving...</span>
        ) : (
          <span>Saved {formatDistanceToNow(lastSaved)} ago</span>
        )}
      </div>
    )
  }
  ```

#### Block Versioning
- [ ] Create block version history API
  ```javascript
  // Backend: routes/pages.js
  router.get('/sites/:siteId/pages/:pageId/versions', async (req, res) => {
    const versions = await db.query(
      'SELECT * FROM page_versions WHERE page_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.params.pageId]
    )
    res.json(versions.rows)
  })
  ```
- [ ] Add version history UI
  ```typescript
  // components/editor/VersionHistory.tsx
  export function VersionHistory({ pageId }: { pageId: string }) {
    const { data: versions } = usePageVersions(pageId)
    
    return (
      <Dialog>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          <div className="version-list">
            {versions?.map(version => (
              <div key={version.id} className="version-item">
                <span>{format(version.created_at, 'PPp')}</span>
                <Button onClick={() => handleRestore(version)}>Restore</Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    )
  }
  ```

### 2.5 Enhanced Preview Integration

#### Real-time Block Preview
- [ ] Update preview on block changes
  ```typescript
  // lib/hooks/useBlockPreview.ts
  export function useBlockPreview() {
    const { currentPage } = useEditorStore()
    const iframeRef = usePreviewIframe()
    
    useEffect(() => {
      if (iframeRef.current && currentPage) {
        iframeRef.current.contentWindow?.postMessage({
          type: 'UPDATE_BLOCKS',
          blocks: currentPage.content.blocks,
        }, '*')
      }
    }, [currentPage?.content.blocks, iframeRef])
  }
  ```

#### Block Highlighting in Preview
- [ ] Highlight selected block in preview
  ```typescript
  // In preview iframe
  useEffect(() => {
    window.addEventListener('message', (event) => {
      if (event.data.type === 'HIGHLIGHT_BLOCK') {
        highlightBlock(event.data.blockId)
      }
    })
  }, [])
  ```

---

## Phase 3: Advanced Features & Polish

### 3.1 User Experience Enhancements

#### Undo/Redo System
- [ ] Implement undo/redo store
  ```typescript
  // lib/stores/historyStore.ts
  interface HistoryState {
    past: Page[]
    present: Page
    future: Page[]
    undo: () => void
    redo: () => void
    addToHistory: (page: Page) => void
  }
  ```
- [ ] Add undo/redo keyboard shortcuts
- [ ] Add undo/redo buttons to toolbar

#### Keyboard Shortcuts
- [ ] Implement keyboard shortcuts system
  ```typescript
  // lib/hooks/useKeyboardShortcuts.ts
  export function useKeyboardShortcuts() {
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey) {
          if (e.key === 's') {
            e.preventDefault()
            handleSave()
          }
          if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault()
            handleUndo()
          }
          if (e.key === 'z' && e.shiftKey) {
            e.preventDefault()
            handleRedo()
          }
        }
      }
      
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])
  }
  ```

#### Mobile-Responsive Editor
- [ ] Make editor responsive
- [ ] Add mobile-specific controls
- [ ] Optimize touch interactions

### 3.2 Performance Optimizations

#### Code Splitting
- [ ] Implement route-based code splitting
- [ ] Lazy load editor components
  ```typescript
  const BlockEditor = lazy(() => import('@/components/editor/BlockEditor'))
  ```
- [ ] Lazy load block components

#### Virtualization
- [ ] Virtualize long block lists
  ```typescript
  import { useVirtualizer } from '@tanstack/react-virtual'
  
  export function VirtualizedBlockList({ blocks }: Props) {
    const parentRef = useRef<HTMLDivElement>(null)
    
    const virtualizer = useVirtualizer({
      count: blocks.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 100,
    })
    
    return (
      <div ref={parentRef} className="block-list">
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div key={virtualItem.key} style={{ height: virtualItem.size }}>
            <Block block={blocks[virtualItem.index]} />
          </div>
        ))}
      </div>
    )
  }
  ```

#### Memoization
- [ ] Memoize block components
  ```typescript
  export const Block = memo(({ block }: Props) => {
    // ...
  })
  ```
- [ ] Optimize re-renders with React.memo
- [ ] Use useMemo for expensive calculations

### 3.3 Testing

#### Unit Tests
- [ ] Test block components
- [ ] Test editor store
- [ ] Test API hooks
- [ ] Test utility functions

#### Integration Tests
- [ ] Test block editor flow
- [ ] Test template application
- [ ] Test customization panel
- [ ] Test preview system

#### E2E Tests
- [ ] Test complete page creation flow
- [ ] Test template selection and customization
- [ ] Test block editor workflow
- [ ] Test preview updates

---

## Progress Tracking

### Overall Progress
- [x] Phase 0: Project Setup & Foundation (20/25 tasks) - **MOSTLY COMPLETE**
  - ✅ API Client Setup (Complete)
  - ✅ API Modules Created (Complete)
  - ✅ Type Definitions (Complete)
  - ✅ Redux Store (Already Configured)
  - ⏳ Redux Slices for Dashboard (Optional - can be added as needed)
- [ ] Phase 1: MVP - Template Customization (0/45 tasks)
- [ ] Phase 2: Block-Based Builder (0/35 tasks)
- [ ] Phase 3: Advanced Features & Polish (0/15 tasks)

**Total Tasks: 120**

### Phase 0 Completion Status
**✅ COMPLETE** - All essential Phase 0 tasks are done:
- API client is configured and working
- All API modules are created with proper types
- Redux is already set up and configured
- Redux slices for editor/template/preview can be added when needed in Phase 1/2

---

## Timeline Estimates

### Phase 1: MVP (Template Customization)
**Timeline:** 2-3 months
- Week 1-2: Project setup, dependencies, API client
- Week 3-4: Database schema, template gallery
- Week 5-6: Customization panel (colors, fonts, logo)
- Week 7-8: Simple CMS for pages
- Week 9-10: Iframe preview system
- Week 11-12: Testing and polish

### Phase 2: Block-Based Builder
**Timeline:** 3-4 months
- Week 1-2: Block system foundation, block registry
- Week 3-4: Block components (hero, text, image, etc.)
- Week 5-6: Block editor UI, drag and drop
- Week 7-8: Block configuration panels
- Week 9-10: Block data management, auto-save
- Week 11-12: Enhanced preview integration
- Week 13-14: Testing and refinement

### Phase 3: Advanced Features
**Timeline:** 1-2 months
- Week 1: Undo/redo, keyboard shortcuts
- Week 2: Performance optimizations
- Week 3: Mobile responsiveness
- Week 4: Testing and bug fixes

---

## Notes

- Update this document as tasks are completed
- Add additional tasks as needed during implementation
- Review and adjust priorities based on project needs
- Document any deviations from the plan
- Consider user feedback for Phase 3 features

