# Version History UI - Implementation Plan

## Overview
Implement version history UI that allows users to view, compare, and restore previous versions of pages and sites. Builds on the existing `page_versions` table.

## Architecture

### Version Structure
```typescript
interface PageVersion {
  id: string
  pageId: string
  version: number
  content: PageContent
  metadata: {
    title: string
    slug: string
  }
  createdAt: string
  createdBy: {
    id: string
    name: string
    email: string
  }
  changeDescription?: string
}

interface VersionComparison {
  from: PageVersion
  to: PageVersion
  changes: VersionChange[]
}

interface VersionChange {
  type: 'added' | 'modified' | 'deleted'
  path: string
  oldValue?: any
  newValue?: any
}
```

## Key Components

### 1. Version History Page
**File:** `smartstore-web/app/dashboard/sites/[id]/pages/[pageId]/versions/page.tsx`

**Functionality:**
- List all versions
- Version timeline
- Compare versions
- Restore version
- Version details

**Technologies:**
- Next.js App Router
- React
- Redux for state

### 2. Version List
**File:** `smartstore-web/components/versions/VersionList.tsx`

**Functionality:**
- Display versions in timeline
- Version metadata (date, author)
- Current version indicator
- Select version for comparison
- Restore button

**Technologies:**
- React components
- Timeline component

### 3. Version Comparison
**File:** `smartstore-web/components/versions/VersionComparison.tsx`

**Functionality:**
- Side-by-side comparison
- Highlight differences
- Diff view
- Change summary
- Restore from comparison

**Technologies:**
- React components
- Diff library (react-diff-viewer or similar)

### 4. Version Preview
**File:** `smartstore-web/components/versions/VersionPreview.tsx`

**Functionality:**
- Preview version content
- Show version metadata
- Compare with current
- Restore button

**Technologies:**
- React components
- Preview iframe

### 5. Restore Dialog
**File:** `smartstore-web/components/versions/RestoreDialog.tsx`

**Functionality:**
- Confirm restore
- Show what will change
- Create new version from restore
- Restore progress

**Technologies:**
- React components
- Dialog component

## Backend Components

### 1. Version History API
**File:** `smartstore-api/src/modules/sites/routes/versions.routes.js`

**Endpoints:**
- `GET /sites/:siteId/pages/:pageId/versions` - List all versions
- `GET /sites/:siteId/pages/:pageId/versions/:versionId` - Get version details
- `POST /sites/:siteId/pages/:pageId/versions/:versionId/restore` - Restore version
- `GET /sites/:siteId/pages/:pageId/versions/compare` - Compare two versions
- `POST /sites/:siteId/pages/:pageId/versions` - Create new version (manual)

**Technologies:**
- Express.js
- PostgreSQL
- Version comparison logic

### 2. Version Service
**File:** `smartstore-api/src/modules/sites/services/version.service.js`

**Functionality:**
- Create version on page update
- Get version history
- Compare versions
- Restore version
- Delete old versions (cleanup)

**Technologies:**
- PostgreSQL queries
- JSON diffing
- Version management

### 3. Version Comparison Service
**File:** `smartstore-api/src/modules/sites/services/versionComparison.service.js`

**Functionality:**
- Compare two versions
- Generate diff
- Identify changes
- Return change summary

**Technologies:**
- JSON diffing library
- Change detection

### 4. Auto-Version Creation
**File:** `smartstore-api/src/modules/sites/middleware/autoVersion.js`

**Functionality:**
- Create version on page update
- Store change description
- Limit version history (keep last N)
- Cleanup old versions

**Technologies:**
- Express.js middleware
- Version creation logic

## Data Flow

1. **View Version History**
   - User opens version history
   - Fetch all versions from API
   - Display in timeline
   - Show current version

2. **Compare Versions**
   - User selects two versions
   - Fetch version data
   - Compare content
   - Display differences
   - Show change summary

3. **Restore Version**
   - User clicks restore
   - Show restore dialog
   - User confirms
   - Create new version from old
   - Update page content
   - Show success

4. **Auto-Create Version**
   - User saves page
   - Middleware creates version
   - Store version in database
   - Cleanup old versions if needed

## Implementation Steps

### Phase 1: Version Display (Week 1)
- [ ] Version history API
- [ ] Version list component
- [ ] Version timeline UI
- [ ] Version details display

### Phase 2: Version Comparison (Week 2)
- [ ] Version comparison API
- [ ] Comparison UI
- [ ] Diff display
- [ ] Change highlighting

### Phase 3: Restore Functionality (Week 3)
- [ ] Restore API endpoint
- [ ] Restore dialog
- [ ] Version restoration
- [ ] Auto-version creation

### Phase 4: Polish & Features (Week 4)
- [ ] Version cleanup
- [ ] Change descriptions
- [ ] Version preview
- [ ] Testing & optimization

## Technologies

### Frontend
- **Next.js 14+** - Framework
- **React** - UI library
- **react-diff-viewer** - Diff display
- **Redux Toolkit** - State management
- **Tailwind CSS** - Styling

### Backend
- **Express.js** - API framework
- **PostgreSQL** - Database
- **json-diff** or similar - Version comparison
- **Middleware** - Auto-versioning

## File Structure

```
smartstore-web/
├── app/
│   └── dashboard/
│       └── sites/
│           └── [id]/
│               └── pages/
│                   └── [pageId]/
│                       └── versions/
│                           └── page.tsx
└── components/
    └── versions/
        ├── VersionList.tsx
        ├── VersionComparison.tsx
        ├── VersionPreview.tsx
        └── RestoreDialog.tsx

smartstore-api/
└── src/
    └── modules/
        └── sites/
            ├── routes/
            │   └── versions.routes.js
            ├── controllers/
            │   └── version.controller.js
            ├── services/
            │   ├── version.service.js
            │   └── versionComparison.service.js
            └── middleware/
                └── autoVersion.js
```

## Version Comparison Example

```javascript
const compareVersions = (version1, version2) => {
  const changes = []
  
  // Compare content
  if (JSON.stringify(version1.content) !== JSON.stringify(version2.content)) {
    changes.push({
      type: 'modified',
      path: 'content',
      oldValue: version1.content,
      newValue: version2.content
    })
  }
  
  // Compare metadata
  if (version1.metadata.title !== version2.metadata.title) {
    changes.push({
      type: 'modified',
      path: 'metadata.title',
      oldValue: version1.metadata.title,
      newValue: version2.metadata.title
    })
  }
  
  return changes
}
```

## Success Criteria

- [ ] Users can view version history
- [ ] Users can compare versions
- [ ] Differences are clearly displayed
- [ ] Users can restore previous versions
- [ ] Versions are auto-created on save
- [ ] Version history is limited (last N versions)
- [ ] Old versions are cleaned up
- [ ] Version metadata is accurate


