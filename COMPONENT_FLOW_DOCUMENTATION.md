# Component Flow: smartstore-app → smartstore-api → smartstore-web

## Architecture Overview

The component system follows a **forward flow** from implementation to management:

```
┌─────────────────────────────────────────────────────────┐
│ Step 1: smartstore-app (React Implementation)           │
│ - Implement React component                             │
│ - Location: components/smartstore/[type]/index.tsx      │
│ - Example: components/smartstore/text/index.tsx         │
│                                                          │
│ Component MUST exist in smartstore-app first!           │
│ Only then can it be registered in smartstore-api        │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Component exists in codebase
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Step 2: smartstore-api (Component Registry)             │
│ - Register component in component_registry table        │
│ - type='system', is_system=true                        │
│ - component_type must match folder name in app          │
│ - config reflects actual component props                │
│                                                          │
│ Component is now available in the system               │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Registered in database
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Step 3: smartstore-web (Management Dashboard)           │
│ - Fetches component registry from API                   │
│ - Displays system components                            │
│ - Allows creating custom components (system + config)   │
│ - Allows creating composite components (groups)         │
│                                                          │
│ All components shown MUST exist in smartstore-app!     │
└─────────────────────────────────────────────────────────┘
```

## Component Types

### 1. System Components (`type='system'`)

**Definition**: React components implemented in `smartstore-app` and registered in `smartstore-api`.

**Flow**:
1. ✅ Implement in `smartstore-app/components/smartstore/[type]/index.tsx`
2. ✅ Register in `smartstore-api` component_registry table
3. ✅ Appears in `smartstore-web` dashboard System Components tab

**Example**: Text Component
- **Implementation**: `smartstore-app/components/smartstore/text/index.tsx`
  - Props: `data: { text, heading, subheading, alignment, size }`
  - Props: `settings: { richText, allowHtml }`
- **Registry**: `component_registry` table
  - `component_type='text'` (maps to folder name)
  - `type='system'`, `is_system=true`
  - `config` contains schema and defaults
- **Dashboard**: Shows in System Components tab with "Create Custom" button

### 2. Custom Components (`type='custom'`)

**Definition**: System component + saved configuration, created by users via dashboard.

**Flow**:
1. ✅ User clicks "Create Custom" on a system component in `smartstore-web`
2. ✅ User configures the component (e.g., Text: heading="Welcome", size="lg", alignment="center")
3. ✅ Saved to `smartstore-api` with `baseComponentType` referencing system component
4. ✅ Appears in Custom Components tab
5. ✅ When used, renders the system component with saved configuration

**Example**: "Blue Heading" Custom Component
- **Based on**: `baseComponentType='text'` (system Text component)
- **Config**: `{ data: { heading: "Welcome", size: "lg", alignment: "center" } }`
- **Usage**: When added to page, renders Text component with saved config

### 3. Composite Components (`type='composite'`)

**Definition**: Group of components (system or custom) arranged together with layout settings.

**Flow**:
1. ✅ User clicks "Create Composite" in `smartstore-web`
2. ✅ User selects components from library (system or custom)
3. ✅ User configures layout (direction, gap, alignment)
4. ✅ User configures responsive breakpoints
5. ✅ Saved to `smartstore-api` with `children` array
6. ✅ Appears in Composite Components tab

**Example**: "Landing Header" Composite Component
- **Children**: [Hero (system), Text (custom "Blue Heading"), CTA (system)]
- **Layout**: Row, gap: 1rem, alignment: center
- **Responsive**: Mobile: column, Tablet: 2 columns, Desktop: 3 columns

## Current Implementation Status

### ✅ Implemented in smartstore-app:
- **text** - `components/smartstore/text/index.tsx`
  - Configurable: heading, subheading, text, alignment, size
  - Note: Tag type (p, h1, h2, etc.) configuration not yet implemented but should be added

### ✅ Registered in smartstore-api:
- **text** - Registered in migration `006_create_component_registry.sql`

### ✅ Available in smartstore-web:
- System Components tab - Fetches from API
- Custom Components tab - User-created custom components
- Composite Components tab - User-created composite components
- "Create Custom" button - Opens CustomComponentCreator dialog
- "Create Composite" button - Opens CompositeComponentBuilder dialog

## Process for Adding New Components

### When Adding a New System Component:

1. **Implement in smartstore-app** (REQUIRED FIRST):
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
   - Add entry to `component_registry`:
     ```sql
     INSERT INTO component_registry (
       name, type, component_type, category, description, config, is_system
     ) VALUES (
       '[Component Name]',
       'system',
       '[folder-name]', -- MUST match smartstore-app folder name
       '[category]',
       '[description]',
       '{
         "defaultContent": {...}, -- Default for data prop
         "defaultSettings": {...}, -- Default for settings prop
         "schema": {...} -- Schema for customization UI
       }',
       true
     );
     ```

3. **Verify in smartstore-web**:
   - Component appears in System Components tab
   - Can create custom components from it
   - Can use in composite components
   - Preview works via smartstore-app

## Important Notes

1. **NEVER register components in smartstore-api before implementing in smartstore-app**
   - The `component_type` must match an actual React component in smartstore-app
   - smartstore-app loads components via: `@/components/smartstore/${type}/index`

2. **Component Config Structure**:
   ```json
   {
     "defaultContent": {
       // Default values for component's `data` prop
       // These are the configurable fields
     },
     "defaultSettings": {
       // Default values for component's `settings` prop
     },
     "schema": {
       // Schema definition for generating customization UI
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

3. **Custom Components**:
   - Must have `baseComponentType` referencing a system component
   - Config overrides system component defaults
   - When rendered, uses the base system component with custom config

4. **Composite Components**:
   - `children` array contains component references (by ID)
   - Each child can be a system or custom component
   - Layout and responsive settings apply to the group

## Current Gap: Text Component Tag Type

**Issue**: User mentioned Text component should be configurable as different HTML tags (paragraph, header, etc.), but current implementation uses fixed h2/h3/div.

**Required Enhancement**:
- Add `tagType` configuration to Text component in smartstore-app
- Update Text component props: `data: { tagType?: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div' | 'span', ... }`
- Update registry config to include `tagType` in schema
- Update CustomComponentCreator to include tagType selector

**Status**: ⚠️ Pending - Enhancement needed in smartstore-app first


