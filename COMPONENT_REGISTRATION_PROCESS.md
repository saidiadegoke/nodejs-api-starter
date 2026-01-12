# Component Registration Process

## Flow: smartstore-app → smartstore-api → smartstore-web

The component system follows a forward flow from implementation to management:

```
┌─────────────────────────────────────────────────────────┐
│ Step 1: smartstore-app (Implementation)                 │
│ - Implement React component                             │
│ - Location: components/smartstore/[type]/index.tsx      │
│ - Example: components/smartstore/text/index.tsx         │
│                                                          │
│ Component must export default React component           │
│ with props: data, styles, settings, blockId, blockType  │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Component exists
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Step 2: smartstore-api (Registry)                       │
│ - Register component in component_registry table        │
│ - Add entry via migration or admin endpoint             │
│ - type='system', is_system=true                         │
│ - component_type must match folder name                 │
│ - config reflects actual component props/schema         │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Registered in DB
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Step 3: smartstore-web (Management UI)                  │
│ - Fetches component registry from API                   │
│ - Displays system components                            │
│ - Allows creating custom components (system + config)   │
│ - Allows creating composite components (groups)         │
└─────────────────────────────────────────────────────────┘
```

## Component Types

### 1. System Components (`type='system'`)
- **Location**: React implementation in `smartstore-app/components/smartstore/[type]/index.tsx`
- **Registry**: `component_registry` table with `type='system'`, `is_system=true`
- **component_type**: Must match folder name in smartstore-app
- **Config**: Default content, settings, and schema reflecting actual component props

**Example**: Text component
- Implementation: `smartstore-app/components/smartstore/text/index.tsx`
- Registry: `component_type='text'`, maps to React component
- Props: `data: { text, heading, subheading, alignment, size }`, `settings: { richText, allowHtml }`

### 2. Custom Components (`type='custom'`)
- **Created by**: Users via smartstore-web dashboard
- **Base**: References a system component via `base_component_type`
- **Config**: Saved configuration (overrides system defaults)
- **Registry**: `component_registry` table with `type='custom'`, `is_system=false`

**Example**: "Blue Heading" custom component
- Based on: `base_component_type='text'` (system Text component)
- Config: `{ data: { heading: "...", size: "lg", alignment: "center" }, styles: { color: "blue" } }`
- When used: Renders Text component with saved configuration

### 3. Composite Components (`type='composite'`)
- **Created by**: Users via smartstore-web dashboard
- **Structure**: Groups multiple components (system or custom)
- **Config**: Layout settings, responsive breakpoints, children array
- **Registry**: `component_registry` table with `type='composite'`, `is_system=false`

**Example**: "Landing Header" composite component
- Children: [Hero component, Text component, CTA component]
- Layout: Row with gap, responsive breakpoints
- When used: Renders all child components with layout

## Registration Process

### When Adding a New System Component:

1. **Implement in smartstore-app**:
   ```typescript
   // smartstore-app/components/smartstore/[type]/index.tsx
   export interface [Type]BlockProps {
     data: { ... }
     styles?: React.CSSProperties
     settings?: { ... }
     blockId?: string
     blockType?: string
   }
   
   export default function [Type]Block({ data, styles, settings }: [Type]BlockProps) {
     // React component implementation
   }
   ```

2. **Register in smartstore-api**:
   - Create migration or use admin endpoint
   - Add entry to `component_registry` table:
     ```sql
     INSERT INTO component_registry (
       name, type, component_type, category, description, config, is_system
     ) VALUES (
       '[Component Name]',
       'system',
       '[folder-name]', -- Must match smartstore-app folder name
       '[category]',
       '[description]',
       '{"defaultContent": {...}, "defaultSettings": {...}, "schema": {...}}',
       true
     );
     ```

3. **Verify in smartstore-web**:
   - Component appears in System Components tab
   - Can create custom components from it
   - Can preview via smartstore-app

## Configuration Schema

The `config` JSONB field should include:

```json
{
  "defaultContent": {
    // Default values for component data prop
  },
  "defaultSettings": {
    // Default values for component settings prop
  },
  "schema": {
    // Schema definition for customization UI
    "data": {
      "fieldName": {
        "type": "string|number|boolean|object|array",
        "description": "...",
        "options": [...], // For select/enum
        "default": "..."
      }
    },
    "settings": {
      // Same structure
    }
  }
}
```

## Current Status

### Implemented Components:
- ✅ **text** - `smartstore-app/components/smartstore/text/index.tsx`
  - Props: `data: { text, heading, subheading, alignment, size }`, `settings: { richText, allowHtml }`
  - Registered in migration `006_create_component_registry.sql`

### To Be Implemented:
- ❌ **hero** - Not yet implemented
- ❌ **image** - Not yet implemented
- ❌ **gallery** - Not yet implemented
- ❌ **features** - Not yet implemented
- ❌ **testimonials** - Not yet implemented
- ❌ **cta** - Not yet implemented
- ❌ **form** - Not yet implemented
- ❌ **video** - Not yet implemented
- ❌ **code** - Not yet implemented
- ❌ **spacer** - Not yet implemented
- ❌ **divider** - Not yet implemented

**IMPORTANT**: Do NOT register components in smartstore-api until they are implemented in smartstore-app!


