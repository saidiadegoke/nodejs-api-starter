# Form Instances Option A – Implementation Plan

## 1. Goal

Register form instances **when a page is saved** (create/update) so the dashboard shows each form and its management link as soon as the block is added, without requiring a first submission.

- **Current behavior**: Form instance is created on **first form submit** (in `FormInstanceService.resolveForSubmit` → `FormInstanceModel.upsert`).
- **Option A**: Form instances are also created/updated when a **page is saved** with form blocks (CMS `pages` table). First-submit path remains and continues to upsert (idempotent).

---

## 2. Scope

| In scope | Out of scope (for now) |
|----------|-------------------------|
| Sync on **page create** (POST `/sites/:siteId/pages`) when body includes `content` | Template-level sync (template.config.pages) – sites without rows in `pages` still rely on first-submit registration |
| Sync on **page update** (PUT `/sites/:siteId/pages/:pageId`) when `updates.content` is present | Customization/site_templates page overrides |
| Content with `content.regions[].blocks[]` or `content.blocks[]` (resolved blocks) | Automatic sync when content has only `blockIds` (would require template resolution in page service) |
| Reuse existing `form_instances` unique constraint and `FormInstanceModel.upsert` | Deleting form_instances when a block is removed (see 4.2) |

---

## 3. Data Flow

1. User adds/edits a form block on a page and saves.
2. Frontend calls `POST /sites/:siteId/pages` or `PUT /sites/:siteId/pages/:pageId` with `content` (e.g. `{ regions: [ { id, blocks: [ ... ] } ] }`).
3. Backend runs existing page create/update logic.
4. **New**: After a successful create/update that includes `content`, call **sync form instances for this page**.
5. Sync scans `content` for blocks whose type is a form type (contactform, form, newsletter, hero-quote-form), and for each calls `FormInstanceModel.upsert(siteId, pageId, blockId, blockType, displayName, configSnapshot)`.
6. Dashboard `GET /sites/:siteId/forms` lists form_instances; new forms appear as soon as the page is saved.

Submit flow is unchanged: `resolveForSubmit` still upserts when needed, so first submit is idempotent with Option A.

---

## 4. Implementation Steps

### 4.1 Form instance sync function

**Location**: `src/modules/formSubmissions/services/form-instance.service.js` (or a new `form-instance-sync.service.js`).

**Function**: `syncFormInstancesForPage(siteId, pageId, content)`

- **Input**: `siteId`, `pageId`, `content` (object: `{ regions: [ { blocks: [...] } ] }` or `{ blocks: [...] }`).
- **Logic**:
  1. Normalize and collect all blocks:
     - If `content.blocks` is an array, use it.
     - Else if `content.regions` is an array, collect `region.blocks` from each region (skip regions with only `blockIds` if no `blocks`).
  2. For each block with an `id` (or `blockId`):
     - `blockType = getBlockType(block)` (use existing `FormInstanceModel.getBlockType`).
     - If block type is `hero`, check for quote form (e.g. `data.primaryButtonType === 'quoteForm'` or `visualElement === 'form'`); if yes, set `blockType = 'hero-quote-form'`.
     - If `blockType` is in `FORM_BLOCK_TYPES`, call `FormInstanceModel.upsert(siteId, pageId, block.id || block.blockId, blockType, displayName, configSnapshot)` with `displayName = block.name || block.displayName`, `configSnapshot = { data: block.data, settings: block.settings }`.
  3. Do **not** delete or soft-delete form_instances for blocks that are no longer in `content` (see 4.2). Only add/update.
- **Output**: Return `{ synced: number }` or list of upserted instance ids (for logging/tests). On error (e.g. invalid content), log and return; do not fail the page save.

**Dependencies**: Reuse `FormInstanceModel.upsert`, `FormInstanceModel.getBlockType`, `FormInstanceModel.FORM_BLOCK_TYPES`. Ensure hero → hero-quote-form logic matches `form-instance.service.js` resolveForSubmit.

### 4.2 Removed blocks (form block removed from page)

- **Option 1 (recommended for Phase 1)**: Do nothing. Form instances for removed blocks remain in the table. Dashboard may show “orphan” forms; submissions remain valid. Optional later: hide or mark instances whose block_id is no longer in the latest page content when listing.
- **Option 2**: Add a `deleted_at` (or `removed_from_page_at`) column to `form_instances` and set it when syncing if the block_id is no longer in `content`. List endpoint filters out soft-deleted rows. Submissions still reference the instance.
- **Option 3**: Delete form_instance rows for block_ids no longer in content. Only allowed when the instance has zero submissions (or keep submissions with nullable `form_instance_id` and list by site/page/block). More invasive.

**Recommendation**: Implement Option 1 first; no schema change. Option 2 can be a follow-up.

### 4.3 Hook into page create

**File**: `src/modules/sites/services/page.service.js`

- In `createPage`, after `PageModel.createPage(pageData)`:
  - If `pageData.content` is present and is an object with `regions` or `blocks`, call `syncFormInstancesForPage(siteId, createdPage.id, pageData.content)`.
  - Use try/catch; on failure log and do not throw (page create already succeeded).

### 4.4 Hook into page update

**File**: `src/modules/sites/services/page.service.js`

- In `updatePage`, after `PageModel.updatePage(pageId, siteId, updates)`:
  - If `updates.content` is present and is an object with `regions` or `blocks`, call `syncFormInstancesForPage(siteId, pageId, updates.content)`.
  - Use try/catch; on failure log and do not throw (page update already succeeded).

### 4.5 Content shape and blockIds-only content

- **Resolved content** (`content.regions[].blocks[]` or `content.blocks[]` with full block objects): Sync as above.
- **Unresolved content** (only `content.regions[].blockIds[]`, no `blocks`): Skip sync in this phase. Form will still be registered on first submit (current behavior). Optional later: resolve blockIds via site template and then sync.

### 4.6 Export and tests

- Export `syncFormInstancesForPage` from the formSubmissions module (or from page.service if you prefer to keep it there; recommended: formSubmissions so all form-instance logic lives in one place).
- **Tests** (e.g. in `formSubmissions.test.js` or `page.service.test.js`):
  - Create a page with content containing one contactform block; assert one form_instance created for that site/page/block_id.
  - Update the same page with content that adds a second form block; assert two form_instances.
  - Submit form for the first block; assert submission exists and form_instance_id matches.
  - Create page with content that has no form blocks; assert no form_instances for that page.

---

## 5. File Checklist

| Task | File(s) |
|------|--------|
| Add `syncFormInstancesForPage`, `collectFormBlocksFromContent` (helper), hero→hero-quote-form logic | `formSubmissions/services/form-instance.service.js` or new `form-instance-sync.service.js` |
| Call sync after create | `sites/services/page.service.js` |
| Call sync after update (when content in updates) | `sites/services/page.service.js` |
| Tests | `formSubmissions.test.js` or `sites/test/page.test.js` (if exists) |

---

## 6. Optional Later: Template / customization sync

- When **template** is updated (PUT template config with pages), optionally sync form_instances for **all sites** using that template. That requires: (a) resolving page content from template (blockIds → blocks), (b) for each site, for each page in template, ensure a page row exists (or use a virtual page id), and (c) sync. More complex and can be a separate phase.
- When **site customization** (e.g. site_templates.customization_settings) stores overridden page content, a similar sync could run on customization save. Depends on how customization is persisted.

---

## 7. Summary

- **Point of registration**: When a page is **created** or **updated** with `content` that contains resolved blocks, sync runs and upserts one form_instance per form block.
- **Dashboard link**: Appears as soon as the page with the form block is saved, because `GET /sites/:siteId/forms` lists form_instances.
- **Submit path**: Unchanged; first (and subsequent) submit still upserts the same row, so behavior remains correct with or without prior sync.
