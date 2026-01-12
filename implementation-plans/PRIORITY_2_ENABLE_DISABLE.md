# Enable/Disable Sites - Implementation Plan

## Overview
Implement clear UI and routing enforcement for enabling/disabling sites. Sites with `draft` or `suspended` status should not be publicly accessible.

## Architecture

### Site Status
```typescript
type SiteStatus = 'active' | 'draft' | 'suspended'

interface Site {
  id: string
  status: SiteStatus
  // ... other fields
}
```

### Status Behavior
- **active**: Site is publicly accessible
- **draft**: Site is not publicly accessible (owner can preview)
- **suspended**: Site is not publicly accessible (admin action)

## Key Components

### 1. Status Toggle Component
**File:** `smartstore-web/components/sites/StatusToggle.tsx`

**Functionality:**
- Clear enable/disable toggle
- Status indicator (badge)
- Confirmation dialog for disable
- Status change history

**Technologies:**
- React components
- Dialog component
- Redux for state

### 2. Status Badge
**File:** `smartstore-web/components/sites/StatusBadge.tsx`

**Functionality:**
- Visual status indicator
- Color-coded (green/yellow/red)
- Tooltip with status description
- Click to change status

**Technologies:**
- React components
- Tailwind CSS

### 3. Status Change Dialog
**File:** `smartstore-web/components/sites/StatusChangeDialog.tsx`

**Functionality:**
- Confirm status change
- Show impact of change
- Reason input (for suspend)
- Cancel/confirm actions

**Technologies:**
- React components
- Dialog component

### 4. Site Status Page
**File:** `smartstore-web/app/dashboard/sites/[id]/status/page.tsx`

**Functionality:**
- Status management page
- Status history
- Status change form
- Impact explanation

**Technologies:**
- Next.js App Router
- React components

## Backend Components

### 1. Status Middleware
**File:** `smartstore-api/src/modules/sites/middleware/checkSiteStatus.js`

**Functionality:**
- Check site status on public routes
- Block access if draft/suspended
- Allow owner preview for draft
- Return appropriate error pages

**Technologies:**
- Express.js middleware
- Site data fetching

### 2. Status API
**File:** `smartstore-api/src/modules/sites/routes/status.routes.js`

**Endpoints:**
- `PUT /sites/:siteId/status` - Update site status
- `GET /sites/:siteId/status` - Get current status
- `GET /sites/:siteId/status/history` - Get status change history
- `POST /sites/:siteId/status/activate` - Activate site
- `POST /sites/:siteId/status/suspend` - Suspend site (admin only)

**Technologies:**
- Express.js
- PostgreSQL
- Authorization middleware

### 3. Status History Table
**File:** `smartstore-api/src/db/migrations/XXX_add_site_status_history.sql`

**Functionality:**
- Track status changes
- Store reason for change
- Store changed by user
- Timestamp

**Technologies:**
- PostgreSQL
- Migration script

## Data Flow

1. **Check Status (Public Route)**
   - User visits site URL
   - Middleware checks site status
   - If active: allow access
   - If draft/suspended: show error page

2. **Change Status**
   - User clicks enable/disable
   - Show confirmation dialog
   - User confirms
   - Send PUT request to API
   - Update database
   - Update routing rules
   - Show success message

3. **Owner Preview (Draft)**
   - Owner visits draft site
   - Check authentication
   - Allow preview with banner
   - Show "This site is in draft mode"

## Implementation Steps

### Phase 1: Status Management (Week 1)
- [ ] Create status toggle component
- [ ] Create status badge component
- [ ] Status change API endpoints
- [ ] Status update functionality

### Phase 2: Routing Enforcement (Week 2)
- [ ] Create status check middleware
- [ ] Apply to public routes
- [ ] Error pages for blocked access
- [ ] Owner preview for draft

### Phase 3: Status History (Week 3)
- [ ] Create status history table
- [ ] Track status changes
- [ ] Status history UI
- [ ] Admin suspend functionality

### Phase 4: Polish (Week 4)
- [ ] Status change notifications
- [ ] Status impact explanations
- [ ] Testing
- [ ] Documentation

## Technologies

### Frontend
- **Next.js 14+** - Framework
- **React** - UI library
- **Redux Toolkit** - State management
- **Tailwind CSS** - Styling

### Backend
- **Express.js** - API framework
- **PostgreSQL** - Database
- **Middleware** - Status checking

## File Structure

```
smartstore-web/
├── app/
│   └── dashboard/
│       └── sites/
│           └── [id]/
│               └── status/
│                   └── page.tsx
├── components/
│   └── sites/
│       ├── StatusToggle.tsx
│       ├── StatusBadge.tsx
│       └── StatusChangeDialog.tsx
└── lib/
    └── hooks/
        └── useSiteStatus.ts

smartstore-api/
└── src/
    └── modules/
        └── sites/
            ├── routes/
            │   └── status.routes.js
            ├── controllers/
            │   └── status.controller.js
            ├── services/
            │   └── status.service.js
            └── middleware/
                └── checkSiteStatus.js
```

## Status Check Middleware

```javascript
const checkSiteStatus = async (req, res, next) => {
  const hostname = req.hostname
  const slug = hostname.split('.')[0]
  
  // Get site by slug or domain
  const site = await SiteModel.getSiteBySlugOrDomain(slug, hostname)
  
  if (!site) {
    return res.status(404).render('404')
  }
  
  // Check status
  if (site.status === 'suspended') {
    return res.status(403).render('suspended', { site })
  }
  
  if (site.status === 'draft') {
    // Allow owner preview
    if (req.user && req.user.id === site.owner_id) {
      req.isDraftPreview = true
      return next()
    }
    return res.status(403).render('draft', { site })
  }
  
  // Active site - allow access
  req.site = site
  next()
}
```

## Success Criteria

- [ ] Users can clearly enable/disable sites
- [ ] Status changes are confirmed before applying
- [ ] Draft sites are not publicly accessible
- [ ] Suspended sites are not publicly accessible
- [ ] Owners can preview draft sites
- [ ] Status changes are tracked in history
- [ ] Error pages are user-friendly
- [ ] Status enforcement works for all routes

Next Steps
The remaining item is the status check middleware for public routes, which will enforce that draft/suspended sites are not publicly accessible. This requires integration with the multi-tenant routing system and can be implemented when that architecture is ready.
The core enable/disable functionality is complete and ready to use. Users can now clearly manage their site status with proper confirmation and history tracking.
