# Engine Versioning - Implementation Plan

## Overview
Implement engine versioning system that allows sites to use different versions of the rendering engine. Users can view current version, update to new versions, and rollback if needed.

## Architecture

### Engine Version Structure
```typescript
interface EngineVersion {
  version: string  // e.g., "v1.0.0", "v2.1.0"
  name: string
  description: string
  releasedAt: string
  isStable: boolean
  breakingChanges: string[]
  migrationRequired: boolean
}

interface SiteEngineVersion {
  siteId: string
  currentVersion: string
  previousVersions: string[]
  lastUpdated: string
  updatedBy: string
}
```

### Version Management
- Sites track `engine_version` in database
- Engine code stored in `/site-engines/v1`, `/site-engines/v2`, etc.
- Migration scripts for version upgrades
- Rollback capability

## Key Components

### 1. Engine Version Page
**File:** `smartstore-web/app/dashboard/sites/[id]/engine/page.tsx`

**Functionality:**
- Display current version
- List available versions
- Update to new version
- Rollback to previous version
- Version history

**Technologies:**
- Next.js App Router
- React
- Redux for state

### 2. Version Card Component
**File:** `smartstore-web/components/engine/VersionCard.tsx`

**Functionality:**
- Display version info
- Show stability badge
- Breaking changes warning
- Update button
- Current version indicator

**Technologies:**
- React components
- Badge components

### 3. Update Dialog
**File:** `smartstore-web/components/engine/UpdateDialog.tsx`

**Functionality:**
- Show version comparison
- List breaking changes
- Show migration steps
- Confirm update
- Show update progress

**Technologies:**
- React components
- Dialog component
- Progress indicator

### 4. Rollback Dialog
**File:** `smartstore-web/components/engine/RollbackDialog.tsx`

**Functionality:**
- List previous versions
- Show rollback impact
- Confirm rollback
- Rollback progress

**Technologies:**
- React components
- Dialog component

### 5. Version History
**File:** `smartstore-web/components/engine/VersionHistory.tsx`

**Functionality:**
- Timeline of version changes
- Who updated
- When updated
- Migration status

**Technologies:**
- React components
- Timeline component

## Backend Components

### 1. Engine Version API
**File:** `smartstore-api/src/modules/sites/routes/engine.routes.js`

**Endpoints:**
- `GET /sites/:siteId/engine` - Get current engine version
- `GET /engine/versions` - List all available versions
- `GET /engine/versions/:version` - Get version details
- `POST /sites/:siteId/engine/update` - Update to new version
- `POST /sites/:siteId/engine/rollback` - Rollback to previous version
- `GET /sites/:siteId/engine/history` - Get version history

**Technologies:**
- Express.js
- PostgreSQL
- File system operations

### 2. Engine Version Service
**File:** `smartstore-api/src/modules/sites/services/engineVersion.service.js`

**Functionality:**
- Get available engine versions
- Check for updates
- Validate version compatibility
- Run migration scripts
- Handle rollback

**Technologies:**
- File system operations
- Migration script runner
- Version comparison

### 3. Migration Runner
**File:** `smartstore-api/src/modules/sites/services/migrationRunner.service.js`

**Functionality:**
- Load migration scripts
- Execute migrations
- Handle errors
- Rollback on failure
- Track migration status

**Technologies:**
- JavaScript module loading
- Error handling
- Transaction management

### 4. Engine Loader
**File:** `smartstore-api/src/modules/sites/services/engineLoader.service.js`

**Functionality:**
- Load engine by version
- Cache engine instances
- Handle engine errors
- Fallback to default version

**Technologies:**
- Dynamic require
- Caching
- Error handling

## Data Flow

1. **Check Current Version**
   - User opens engine page
   - Fetch current version from API
   - Fetch available versions
   - Compare and show updates available

2. **Update Engine**
   - User clicks update
   - Show update dialog with changes
   - User confirms
   - Backend runs migration
   - Update engine_version in database
   - Reload site with new engine
   - Show success/error

3. **Rollback Engine**
   - User clicks rollback
   - Show previous versions
   - User selects version
   - Backend restores previous version
   - Update database
   - Reload site
   - Show success/error

4. **Render Site**
   - Request comes in for site
   - Get site engine_version
   - Load corresponding engine
   - Render site with engine

## Implementation Steps

### Phase 1: Version Management (Week 1)
- [ ] Engine version API
- [ ] Version listing UI
- [ ] Current version display
- [ ] Version comparison

### Phase 2: Update System (Week 2)
- [ ] Update API endpoint
- [ ] Migration runner
- [ ] Update dialog UI
- [ ] Progress tracking

### Phase 3: Rollback System (Week 3)
- [ ] Rollback API endpoint
- [ ] Version history tracking
- [ ] Rollback dialog UI
- [ ] Previous version storage

### Phase 4: Engine Loading (Week 4)
- [ ] Dynamic engine loader
- [ ] Engine caching
- [ ] Error handling
- [ ] Testing & polish

## Technologies

### Frontend
- **Next.js 14+** - Framework
- **React** - UI library
- **Redux Toolkit** - State management
- **Tailwind CSS** - Styling

### Backend
- **Express.js** - API framework
- **PostgreSQL** - Database
- **File System** - Engine storage
- **Dynamic require** - Engine loading

## File Structure

```
smartstore-web/
├── app/
│   └── dashboard/
│       └── sites/
│           └── [id]/
│               └── engine/
│                   └── page.tsx
└── components/
    └── engine/
        ├── VersionCard.tsx
        ├── UpdateDialog.tsx
        ├── RollbackDialog.tsx
        └── VersionHistory.tsx

smartstore-api/
├── src/
│   └── modules/
│       └── sites/
│           ├── routes/
│           │   └── engine.routes.js
│           ├── controllers/
│           │   └── engine.controller.js
│           ├── services/
│           │   ├── engineVersion.service.js
│           │   ├── migrationRunner.service.js
│           │   └── engineLoader.service.js
│           └── migrations/
│               └── v1-to-v2.js
└── site-engines/
    ├── v1.0.0/
    │   ├── index.js
    │   └── render.js
    ├── v2.0.0/
    │   ├── index.js
    │   ├── render.js
    │   └── migrations/
    │       └── v1-to-v2.js
    └── v2.1.0/
        ├── index.js
        ├── render.js
        └── migrations/
            └── v2-to-v2.1.js
```

## Engine Structure

```javascript
// site-engines/v2.0.0/index.js
module.exports = {
  version: 'v2.0.0',
  name: 'Engine v2.0',
  description: 'Enhanced rendering engine with new features',
  render: require('./render'),
  migrations: {
    'v1.0.0': require('./migrations/v1-to-v2')
  }
}

// site-engines/v2.0.0/render.js
module.exports = async function render(site, page, customization) {
  // Render site with v2.0.0 engine
  // ...
}
```

## Migration Script

```javascript
// site-engines/v2.0.0/migrations/v1-to-v2.js
module.exports = async function migrate(siteId) {
  // Migrate site data from v1 to v2
  // Update page structures
  // Update customization format
  // Return migration result
  return {
    success: true,
    changes: [
      'Updated page structure format',
      'Migrated customization colors'
    ]
  }
}
```

## Engine Loader

```javascript
const loadEngine = (version) => {
  const enginePath = path.join(__dirname, `../../site-engines/${version}`)
  
  if (!fs.existsSync(enginePath)) {
    throw new Error(`Engine version ${version} not found`)
  }
  
  const engine = require(enginePath)
  return engine
}

const renderSite = async (site, page, customization) => {
  const engine = loadEngine(site.engine_version)
  return await engine.render(site, page, customization)
}
```

## Success Criteria

- [ ] Users can view current engine version
- [ ] Users can see available updates
- [ ] Users can update to new versions
- [ ] Migrations run automatically
- [ ] Users can rollback to previous versions
- [ ] Version history is tracked
- [ ] Sites render with correct engine version
- [ ] Error handling is comprehensive


