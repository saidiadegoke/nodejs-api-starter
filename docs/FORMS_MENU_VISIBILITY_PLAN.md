# Forms Menu / Tab Visibility – Plan (no code yet)

## 1. Context

- **Where form blocks are added**: In the **component/template builder** (not site config). User edits a template (e.g. adds a contact form block to a page), saves the template (**PUT /templates/:id**). That request body contains the full config: **pages** (with regions and blockIds), **blocks** (with id, type e.g. `contactform`, componentId, etc.). So **PUT /templates/:id** is when we have the block info needed to store the right form-instance data; we already sync form instances for all sites using that template after save.
- **Where the “Forms” entry appears**: In the **site management UI** (smartstore-web):
  - **Forms tab** on the site management page (`/dashboard/sites/[id]`) – currently always visible in the tab list (Settings, Pages, Theme, Engine, Customization, Domains, Deployments, **Forms**).
  - Possibly a “Forms” link in a sidebar when viewing a site (if such a sidebar exists).
- **User requirement**: The condition for showing the Forms management link (and other form-based UI) should be **assigned to the user config** – i.e. a **computed flag** included when the user’s site(s) are fetched and **saved in Redux**, so the UI reads it from there. Not too complicated.

---

## 2. Goal

- Show the **Forms** tab (and any other form-related entry points) **only when the site has at least one form instance** (i.e. at least one form block has been added and synced).
- **Computed flag**: Include a `has_forms` (or equivalent) flag when the **site(s)** are fetched (GET /sites, GET /sites/:id). Frontend **saves that response in Redux** (existing site slice); no separate “user status” endpoint. The UI then reads the flag from the site object in Redux (or from the single-site response) to decide visibility.

---

## 3. “User config” in this context

- **Not** global user preferences (e.g. “I want to see Forms”).
- **Config that drives the current user’s UI** for a given site = the **site object** returned when the user’s sites are called (GET /sites or GET /sites/:siteId), with a **computed** field:
  - Add `has_forms: boolean` (or `features: { forms: boolean }`) on the site object. Backend derives it from `form_instances` (e.g. `EXISTS (SELECT 1 FROM form_instances WHERE site_id = ?)`).
  - When the frontend fetches sites (or a single site), it stores the response in **Redux** (e.g. `setSites`, `updateSite`, or the site used on the site management page). The flag is then available from the store; no extra complexity.
- **When the form-instance data is persisted**: When **PUT /templates/:id** is called. That endpoint receives the full template config (pages, regions, blockIds, blocks with type/componentId). We run form-instance sync there and persist the right information; the next time site(s) are fetched, `has_forms` will be computed as true for sites that now have form instances.

---

## 4. Backend

### 4.1 GET /sites/:siteId and GET /sites (list)

- When returning a site (single or in list), **compute and include** `has_forms: boolean` on each site object (true if the site has at least one form instance). This response is what the frontend stores in Redux when “user sites” are fetched.
- Implementation: After loading the site(s), run a lightweight check (e.g. `FormInstanceModel.hasAny(siteId)` or `SELECT 1 FROM form_instances WHERE site_id = $1 LIMIT 1`); for list, one batch query (e.g. `SELECT site_id FROM form_instances WHERE site_id = ANY($1)`). Set `site.has_forms` on the object(s) sent to the client.
- **When it becomes true**: When **PUT /templates/:id** is called, the request body includes the full config (pages, regions, blockIds, blocks with type/componentId). We run `syncFormInstancesForSitesUsingTemplate` there and persist form instances. The next GET site(s) will compute `has_forms: true` for those sites. No separate “user config” write – the flag is always derived from `form_instances`.

---

## 5. Frontend (smartstore-web)

### 5.1 Site data and Redux

- When the app fetches the user’s sites (GET /sites or GET /sites/:id), the response includes `has_forms` on each site. The existing flow **saves that in Redux** (e.g. `siteSlice`: `setSites`, `updateSite`, or the site object used on the site management page). No new endpoint; the flag is part of the site payload.
- Extend the `Site` type (e.g. in `sites-api` or types) so the site object may include `has_forms?: boolean`. Redux already stores `Site[]`; once the API returns `has_forms`, it will be in the store.

### 5.2 Site management page (`/dashboard/sites/[id]/page.tsx`)

- **Data**: The page loads the site (e.g. via `sitesAPI.getById(siteId)`); that response (with `has_forms`) can be stored in Redux or used locally. Use the site from Redux (e.g. `selectSiteById(siteId)`) or from the fetch response.
- **Forms tab visibility**: Render the **Forms** `TabsTrigger` (and its `TabsContent`) only when `site?.has_forms === true`. When false, do not show the Forms tab.
- **Default**: If the API does not send `has_forms` (e.g. old backend), treat as false so we don’t show an empty Forms tab.

### 5.3 Other form-based entry points

- **Standalone Forms page** (`/dashboard/sites/[id]/forms`): Navigation to this page (tab/link) should only be visible when the current site has `has_forms === true` (from Redux or fetched site). If the user lands here with no forms, redirect or show “No forms” and a link back.
- **Stores list**: If we show a “Forms” link or icon per site row, use the per-site `has_forms` from the list (already in Redux after GET /sites).

---

## 6. When the condition becomes true

- **PUT /templates/:id** (template save): This is when we have the **block info** needed to store the right information. The request body includes `config.pages` (with regions and blockIds) and `config.blocks` (with id, type e.g. `contactform`, componentId). Backend runs `syncFormInstancesForSitesUsingTemplate(templateId, config)` and creates/updates `form_instances` for all sites using that template. After that, the next time site(s) are fetched, `has_forms` is computed as true for those sites, and the response is saved in Redux.
- **Page save (CMS)** (optional): If the user creates/updates a page with a form block via POST/PUT /sites/:siteId/pages, we run `syncFormInstancesForPage`; same result for that site.

No separate “user config” write: the flag is **computed** when site(s) are called and **saved in Redux** as part of the site object.

---

## 7. Summary table

| Layer | Responsibility |
|-------|----------------|
| **PUT /templates/:id** | Request has full config (pages, blockIds, blocks). Run form-instance sync here; persist the right form-instance data (already implemented). |
| **GET /sites/:id**, **GET /sites** | Compute `has_forms` from form_instances and include on each site in the response. |
| **Frontend** | Store site(s) response in Redux (existing flow). Read `site.has_forms` from Redux or fetched site. |
| **Site management page** | Show Forms tab only when `site.has_forms === true`. |
| **Other form entry points** | Same condition from site in Redux or from GET site. |

---

## 8. Optional later

- **Stored flag**: If we want to avoid querying `form_instances` on every GET site, we could add a column and set/clear it when we sync (e.g. on PUT /templates/:id). Then GET site just returns that flag.
- **Other features**: Same pattern for “has store”, “has bookings”, etc., via a `features` object on the site response.

---

## 9. File/area checklist (for when coding)

- **Backend**: GET /sites and GET /sites/:id – compute `has_forms` from form_instances and attach to each site in the response. FormInstanceModel – add `hasAny(siteId)` (or use existing count) if not present. PUT /templates/:id – already runs form-instance sync (no change).
- **Frontend**: Site type (sites-api or types) – add `has_forms?: boolean`. Ensure site(s) response is stored in Redux (existing flow). Site management page – show Forms tab only when `site?.has_forms === true` (site from Redux or fetch). Other form entry points – same condition.

No coding in this step – this document is the plan to implement next.
