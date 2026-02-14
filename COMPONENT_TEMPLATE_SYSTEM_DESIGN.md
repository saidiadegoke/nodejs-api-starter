# Component Template System - Holistic Design

## Problem Statement

The current implementation has several architectural issues:

1. **Component-Specific Hacks**: Hero templates have custom logic (`hero-templates-api.ts`) that won't scale to other components
2. **Inefficient Querying**: Fetching all components and filtering in memory (doesn't scale to hundreds of templates)
3. **Type Confusion**: Mixing `component.type` (identifier) with `component.componentType` (classification)
4. **No Generic Template System**: Each component type would need its own template API
5. **Database vs Application Logic**: Filtering should happen in the database, not in application code

## Component Configuration Structure

Each component configuration has four main sections:

1. **`data`**: Content and data structure (text, images, assets, etc.)
2. **`presentation`**: Primary visual styling options (colors, typography, borders, backgrounds)
3. **`layout`**: Structural arrangement (positioning, alignment, grid, etc.)
4. **`styles`** (optional): Advanced styling options for component-specific needs

### When to Use `presentation` vs `styles`

**`presentation`** - Use for:
- Theme-level customization (colors, typography)
- Common styling options that most components need
- Options that align with design system tokens
- User-facing styling choices (e.g., "Accent Color", "Text Size")

**`styles`** - Use for (optional advanced section):
- Component-specific advanced styling needs
- Custom CSS properties not covered by `presentation`
- Advanced overrides (e.g., custom shadows, transforms, filters)
- Component-specific animations or effects
- Advanced spacing or sizing options

**Example: Hero Component**
```typescript
// presentation - theme-level options
presentation: {
  accentColor: colorField('Accent Color', '...', 'text-primary'),
  textPrimary: colorField('Primary Text', '...', 'text-foreground'),
  cardBg: colorField('Card Background', '...', 'bg-card'),
}

// styles - advanced component-specific options (optional)
styles: {
  heroShadow: selectField('Hero Shadow', 'Advanced shadow effect', [
    { value: 'none', label: 'None' },
    { value: 'soft', label: 'Soft' },
    { value: 'medium', label: 'Medium' },
    { value: 'strong', label: 'Strong' },
  ], 'soft'),
  backgroundBlur: booleanField('Background Blur', 'Apply blur effect to background', false),
  customTransform: textField('Custom Transform', 'Advanced CSS transform', '', 'translateY(-10px)'),
}
```

**Important Notes:**
1. **`styles` is optional** - Not all components need it. Only define it if you have advanced styling needs beyond `presentation`.
2. **`styles` prop vs `styles` schema** - The `styles` prop in component props (React.CSSProperties) is for runtime CSS overrides, while the `styles` schema section is for user-configurable styling options.
3. **Both are configurable** - Both `presentation` and `styles` appear in the theme builder UI, but `styles` only appears if the component defines a `styles` schema.

## Type Mapping Clarification

**IMPORTANT**: The API response has a confusing mapping that needs to be understood:

- **Database `component_type`** → **API `type`** = Component identifier (e.g., `"hero"`, `"hero-template-hero-section-1"`)
- **Database `type`** → **API `componentType`** = Classification (`"system"`, `"custom"`, `"composite"`)

**Example API Response**:
```json
{
  "id": 35,
  "name": "Professional Hero with Stats",
  "type": "hero-template-hero-section-1",  // ← component_type from DB (identifier)
  "componentType": "system",                // ← type from DB (classification)
  "baseComponentType": null,                 // ← base_component_type from DB
  "category": "layout"
}
```

**When checking if a component is a hero**:
- ✅ Use `component.type === 'hero'` or `component.type?.startsWith('hero-template-')`
- ❌ DON'T use `component.componentType` (that's just "system"/"custom"/"composite")

## Core Architecture Principles

### 1. Component Hierarchy

```
Component (Base)
  ├── Type: "hero" (the React component identifier)
  ├── ComponentType: "system" (classification: system/custom/composite)
  └── Templates (Variants)
      ├── Template ID: "hero-section-1"
      ├── Component Type: "hero-template-hero-section-1"
      ├── Config Schema (what can be customized)
      └── Default Values
```

**Key Insight**: A template is just a **pre-configured variant** of a base component with:
- Limited customization options (defined in `config.schema`)
- Default values (defined in `config.defaults`)
- Metadata (name, description, thumbnail, category)

### 2. Database Schema

**Current Schema** (`component_registry`):
```sql
CREATE TABLE component_registry (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,              -- 'system' | 'custom' | 'composite'
  component_type VARCHAR(100) NOT NULL,    -- 'hero' | 'hero-template-hero-section-1' | 'text'
  base_component_type VARCHAR(100),       -- For templates: references base component
  category VARCHAR(50),
  config JSONB NOT NULL DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  ...
)
```

**Proposed Enhancement**:
- Add index on `component_type` for fast lookups
- Add index on `base_component_type` for template queries
- Use `base_component_type` to link templates to their base component

### 3. API Design

#### Generic Template Endpoints

```
GET /api/components/:baseType/templates
  - Returns all templates for a base component type
  - Example: GET /api/components/hero/templates
  - Returns: [{ id: "hero-section-1", name: "...", config: {...} }]

GET /api/components/:baseType/templates/:templateId
  - Returns specific template details
  - Example: GET /api/components/hero/templates/hero-section-1

GET /api/components/templates?baseType=hero&category=service
  - Query templates with filters
  - Supports: baseType, category, search, category
```

#### Component Endpoints (Enhanced)

```
GET /api/components?componentTypePrefix=hero-template-
  - Database-level filtering (already implemented)
  - Returns only components matching prefix

GET /api/components/by-type/:componentType
  - Get component by exact type
  - Works for both base components and templates
```

### 4. Frontend Architecture

#### Generic Template API Client

```typescript
// lib/api/modules/component-templates-api.ts
export interface ComponentTemplate {
  id: string                    // Template ID (e.g., "hero-section-1")
  name: string
  description: string
  category: string
  thumbnail: string
  baseComponentType: string     // Base component (e.g., "hero")
  config: {
    schema: {                   // What can be customized
      text?: Record<string, FieldSchema>
      colors?: Record<string, FieldSchema>
      assets?: Record<string, FieldSchema>
      options?: Record<string, FieldSchema>
    }
    defaults: {                  // Default values
      text?: Record<string, any>
      colors?: Record<string, string>
      assets?: Record<string, string>
      options?: Record<string, any>
    }
  }
}

export const componentTemplatesAPI = {
  // Generic: works for ANY component type
  async getTemplates(baseComponentType: string, filters?: {
    category?: string
    search?: string
  }): Promise<ComponentTemplate[]>
  
  async getTemplate(baseComponentType: string, templateId: string): Promise<ComponentTemplate | null>
}
```

#### Block Configuration

```typescript
interface Block {
  id: string
  componentId: number           // References component_registry.id
  type?: string                 // Resolved from component.type (for convenience)
  templateId?: string          // If using a template (e.g., "hero-section-1")
  templateCustomizations?: {    // User's customizations (for template mode)
    text?: Record<string, any>
    colors?: Record<string, string>
    assets?: Record<string, string>
    options?: Record<string, any>
  }
  data?: Record<string, any>              // Content and data structure
  presentation?: Record<string, any>      // Primary styling options (colors, typography, etc.)
  layout?: Record<string, any>            // Layout options (positioning, alignment, etc.)
  styles?: Record<string, any>           // Advanced styling options (optional, component-specific)
}
```

**Configuration Sections:**
- **`data`**: Content and data structure (text, images, assets, etc.)
- **`presentation`**: Primary styling options (colors, typography, borders, backgrounds) - theme-level customization
- **`layout`**: Structural arrangement (positioning, alignment, grid, etc.)
- **`styles`**: Advanced styling options (optional) - component-specific advanced needs

**Note**: The `styles` prop in component React props (React.CSSProperties) is different from `styles` in the block configuration. The prop is for runtime CSS overrides passed directly to the component, while the block's `styles` is a user-configurable section defined in the component schema.

### 5. Component Registration Flow

#### In smartstore-app

```typescript
// components/smartstore/hero/index.tsx
import { heroTemplateRegistry } from './templates/templateRegistry'

// Register base component
componentRegistry.register('hero', {
  metadata: { name: 'Hero Section', ... },
  defaultData: { templateId: null },
  schema: {
    data: {
      templateId: {
        type: 'string',
        format: 'template',
        enum: heroTemplateRegistry.getAll().map(t => t.id)
      }
    }
  }
})

// Register each template as separate component entry
heroTemplateRegistry.getAll().forEach(template => {
  componentRegistry.register(
    `hero-template-${template.id}`,  // component_type in DB
    templateToComponentConfig(template)
  )
})
```

#### Seeding to API

1. Base component (`hero`) → `/api/components` (POST)
2. Each template → `/api/components` (POST) with `base_component_type = 'hero'`

### 6. Query Optimization

#### Database Indexes

```sql
-- Fast lookup by component_type
CREATE INDEX idx_component_registry_component_type ON component_registry(component_type);

-- Fast lookup of templates by base component
CREATE INDEX idx_component_registry_base_type ON component_registry(base_component_type) 
WHERE base_component_type IS NOT NULL;

-- Fast prefix matching (for hero-template-* queries)
CREATE INDEX idx_component_registry_type_prefix ON component_registry(component_type text_pattern_ops);
```

#### Query Patterns

```sql
-- Get all templates for a base component (FAST - uses index)
SELECT * FROM component_registry 
WHERE base_component_type = 'hero' 
  AND is_system = true
ORDER BY created_at DESC;

-- Get templates with prefix (FAST - uses index)
SELECT * FROM component_registry 
WHERE component_type LIKE 'hero-template-%'
  AND is_system = true
ORDER BY created_at DESC;
```

### 7. Frontend Component Resolution

```typescript
// When block has templateId:
// 1. Fetch base component to get componentId
// 2. Fetch template component (component_type = 'hero-template-{templateId}')
// 3. Fetch template details for customization form

async function resolveBlockComponent(block: Block) {
  // Step 1: Get base component
  const baseComponent = await componentsAPI.getById(block.componentId)
  
  if (block.templateId) {
    // Step 2: Get template component
    const templateComponentType = `${baseComponent.type}-template-${block.templateId}`
    const templateComponent = await componentsAPI.getByType(templateComponentType)
    
    // Step 3: Get template details for form
    const template = await componentTemplatesAPI.getTemplate(
      baseComponent.type,
      block.templateId
    )
    
    return {
      baseComponent,
      templateComponent,
      template,
      mode: 'template'
    }
  }
  
  return {
    baseComponent,
    mode: 'advanced'
  }
}
```

### 8. Migration Path

#### Phase 1: Database Enhancement
- [ ] Add `base_component_type` index
- [ ] Add `component_type` index
- [ ] Ensure all templates have `base_component_type` set

#### Phase 2: API Endpoints
- [ ] Add `/api/components/:baseType/templates` endpoint
- [ ] Add `componentTypePrefix` filter to existing `/api/components` endpoint
- [ ] Update component model to support efficient template queries

#### Phase 3: Frontend Refactoring
- [ ] Create generic `componentTemplatesAPI` (replace hero-specific)
- [ ] Update `BlockConfigPanel` to use generic template system
- [ ] Remove `hero-templates-api.ts` (replace with generic)

#### Phase 4: Component Registration
- [ ] Ensure all components register templates with `base_component_type`
- [ ] Update seeding process to set `base_component_type`

### 9. Benefits

1. **Scalable**: Database-level filtering, indexed queries
2. **Generic**: Works for ANY component type (hero, text, image, etc.)
3. **Maintainable**: Single template system, not component-specific hacks
4. **Performant**: No in-memory filtering, proper indexes
5. **Extensible**: Easy to add new component types with templates

### 10. Example: Adding Text Component Templates

```typescript
// components/smartstore/text/templates/templateRegistry.ts
export const textTemplateRegistry = new TemplateRegistry<TextTemplate>()

textTemplateRegistry.register({
  id: 'text-rich',
  name: 'Rich Text Block',
  baseComponentType: 'text',  // Links to base 'text' component
  config: {
    schema: {
      text: {
        content: { type: 'textarea', ... }
      }
  }
})

// Seeding: Creates component with component_type='text-template-text-rich'
// and base_component_type='text'

// Frontend: Works automatically with generic componentTemplatesAPI
const templates = await componentTemplatesAPI.getTemplates('text')
```

### 11. Example: Using `styles` Section (Optional Advanced Styling)

Components can optionally define a `styles` section for advanced styling needs beyond `presentation`:

```typescript
// components/smartstore/hero/templates/templateRegistry.ts
import { buildTemplateConfig, textField, colorField, selectField, booleanField } from '@/lib/utils/template-helpers'

const advancedHeroConfig = buildTemplateConfig({
  metadata: {
    name: 'Advanced Hero with Custom Effects',
    description: 'Hero section with advanced styling options',
    category: 'layout',
  },
  data: {
    headline: textField('Headline', 'Main headline', 'Welcome'),
    // ... other data fields
  },
  presentation: {
    accentColor: colorField('Accent Color', 'Primary accent color', 'text-primary'),
    textPrimary: colorField('Text Color', 'Primary text color', 'text-foreground'),
    // ... other presentation fields
  },
  layout: {
    alignment: selectField('Alignment', 'Content alignment', [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
    ], 'center'),
    // ... other layout fields
  },
  // Optional: Advanced styling section
  styles: {
    heroShadow: selectField('Shadow Effect', 'Advanced shadow effect for hero', [
      { value: 'none', label: 'None' },
      { value: 'soft', label: 'Soft Shadow' },
      { value: 'medium', label: 'Medium Shadow' },
      { value: 'strong', label: 'Strong Shadow' },
      { value: 'glow', label: 'Glow Effect' },
    ], 'soft'),
    backgroundBlur: booleanField('Background Blur', 'Apply blur effect to background image', false),
    customTransform: textField('Custom Transform', 'Advanced CSS transform (e.g., translateY(-10px))', '', ''),
    animationSpeed: selectField('Animation Speed', 'Speed of entrance animation', [
      { value: 'slow', label: 'Slow' },
      { value: 'normal', label: 'Normal' },
      { value: 'fast', label: 'Fast' },
    ], 'normal'),
  },
})

// The styles section will appear as a separate "Styles" tab in the theme builder
// Only if the component defines a styles schema
```

**When to use `styles`:**
- Component-specific advanced effects (shadows, blurs, transforms)
- Custom animations or transitions
- Advanced spacing/sizing not covered by `presentation`
- Component-specific styling needs that don't fit into `presentation`

**When NOT to use `styles`:**
- If all styling needs are covered by `presentation` (most components)
- For theme-level customization (use `presentation` instead)
- For common styling patterns (use `presentation` instead)

## Implementation Checklist

- [ ] Database indexes for performance
- [ ] Generic template API endpoints
- [ ] Generic frontend template API client
- [ ] Update BlockConfigPanel to use generic system
- [ ] Remove hero-specific template logic
- [ ] Update component registration to set `base_component_type`
- [ ] Add template query optimization
- [ ] Documentation for adding new component templates

