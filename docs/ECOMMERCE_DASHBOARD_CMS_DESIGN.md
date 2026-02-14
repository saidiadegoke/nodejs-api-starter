# E-Commerce Component & Dashboard CMS Design

## 1. Principle

**When an e-commerce component is added to a site (e.g. product grid, store block, cart, checkout, or any block that displays or sells products/services), the dashboard must provide:**

- **CMS and other UIs for managing products and services** for that site.

In other words: the presence of an e-commerce block on the site **unlocks** or **surfaces** in the dashboard the tools to create, edit, and organize the catalog (products and services) that those blocks display or sell.

---

## 2. Goals

- **Component-driven dashboard**: Adding an e-commerce block is the trigger for exposing product/service management in the dashboard. No separate “enable e-commerce” toggle is required if the site already uses such a block (optional global “e-commerce enabled” can still exist for billing/features).
- **Single catalog per site**: One site has one catalog of products and services. All e-commerce blocks on that site (product grid, store page, featured products, etc.) draw from this catalog. The dashboard CMS manages this single source of truth.
- **Products and services**: The CMS supports both sellable **products** (physical/digital goods) and **services** (bookings, appointments, custom offerings) so the same dashboard covers stores and service businesses.
- **Consistent with Forms (implemented)**: Same pattern as form submissions—when a form block is added, we sync form instances on template save, compute `has_forms` on the site, and show the Forms entry in the dashboard. E-commerce should follow the same pattern: sync “e-commerce present” on template/page save, compute `has_ecommerce` (or `has_catalog`) on the site, and show the Catalog/Products entry in the dashboard.

---

## 3. Lessons from Forms (implemented pattern)

The Forms feature is implemented and working. E-commerce should mirror this pattern.

| Aspect | Forms (current) | E-commerce (target) |
|--------|-----------------|----------------------|
| **Where blocks are added** | Component/template builder. User saves template via **PUT /templates/:id** (body has full config: pages, regions, blockIds, blocks with type/componentId). | Same. E-commerce blocks are added in the template builder; **PUT /templates/:id** (and optionally **PUT /sites/:siteId/pages**) is when we have block info. |
| **When “feature” is persisted** | On **PUT /templates/:id**: backend runs `syncFormInstancesForSitesUsingTemplate(templateId, config)`, which creates/updates rows in `form_instances` for all sites using that template. Optionally on page create/update: `syncFormInstancesForPage(siteId, pageId, content)`. | On **PUT /templates/:id**: backend should run an e-commerce sync (e.g. detect blocks with type in e-commerce list, then record “site has e-commerce” for all sites using that template). Optionally on page save for that site. |
| **Flag on site** | **Computed** when site(s) are fetched: `has_forms = EXISTS (form_instances for site)` (or batch query for list). No separate “user config” table; flag is derived. | **Computed** (or from a synced table): `has_ecommerce` (or `has_catalog`) on each site in **GET /sites** and **GET /sites/:id**. Frontend stores the response in Redux. |
| **Frontend** | Site type includes `has_forms?: boolean`. Redux stores site(s); UI shows Forms tab/link only when `site.has_forms === true`. | Site type includes `has_ecommerce?: boolean` (or `has_catalog`). Redux stores site(s); UI shows Products/Catalog link only when at least one site has `has_ecommerce === true` (or show link and let page show “choose a site” / empty state). |
| **Dashboard entry** | **Dashboard-level** page: **/dashboard/forms**. User sees list of **sites that have forms**; chooses a site to manage that site’s forms. Plus optional Forms tab on site management page that links to dashboard Forms for that site. | **Dashboard-level** page: **/dashboard/products** (or **/dashboard/catalog**). User sees list of **sites that have e-commerce**; chooses a site to manage that site’s catalog. Plus optional Products/Catalog tab on site management page that links to dashboard catalog for that site. |
| **Sidebar** | “Forms” link in main dashboard sidebar → `/dashboard/forms`. Always visible (or could be shown only when any site has forms). | “Products” or “Catalog” link in main dashboard sidebar → `/dashboard/products`. Show when any site has ecommerce, or always with empty state. |

**Takeaways for e-commerce:**

1. **Sync on template save**: When **PUT /templates/:id** is called, inspect `config.blocks` (and pages’ blockIds) for e-commerce block types. For every site using that template, set “has e-commerce” (e.g. upsert into a `site_ecommerce` or `site_features` table, or a simple stored flag). No need to infer from pages on every request if we persist at save time.
2. **Computed flag on GET site(s)**: When returning a site (single or list), include `has_ecommerce: boolean` (e.g. from the synced table or from a lightweight check). Frontend saves this in Redux.
3. **Dashboard flow**: One **dashboard-level** Catalog/Products page where the user **chooses which site** to work with (sites with `has_ecommerce === true`), then manages products/services for that site. Same UX as Forms.
4. **No separate “user config” endpoint**: The “config” that drives visibility is the **site object** returned by GET site(s), with `has_ecommerce` (and optionally `has_forms`-style `features` object for future).

---

## 4. When Is “E-Commerce Added”?

An e-commerce component is considered **added** when at least one block of an e-commerce type exists in the site’s page content. E-commerce block types can include (depending on implementation):

- `product-grid` / `products` – list or grid of products
- `store` – full store page (hero + products + CTA, etc.)
- `featured-products` – highlighted products
- `product-detail` – single product view (usually on a dynamic route)
- `cart` – shopping cart
- `checkout` – checkout flow
- `services` / `service-list` – list of bookable or purchasable services (e.g. the **services-list** component)
- Any other block type **declared as e-commerce** in the component registry (e.g. `category: 'ecommerce'` or `requiresCatalog: true`).

**Alignment with Forms:**

- **Where we learn about blocks**: Same as Forms—from **PUT /templates/:id** (full config with `config.pages` and `config.blocks`) and optionally from **POST/PUT /sites/:siteId/pages** when content is saved per site.
- **Recommended approach (Forms-style)**:
  - **On template save**: When **PUT /templates/:id** is called, run a sync step: from `config` collect all block types that are e-commerce; get all site IDs that use this template; for each such site, record “this site has e-commerce” (e.g. upsert into `site_features(site_id, feature='ecommerce')` or set `sites.has_ecommerce = true` if we add the column). So we **persist** at save time instead of scanning pages on every GET.
  - **On page save** (optional): When a page is created/updated with content that includes an e-commerce block, update “has e-commerce” for that site.
  - **On GET /sites and GET /sites/:id**: Include `has_ecommerce: boolean` on each site (read from the synced table or column). Frontend stores this in Redux and uses it to show/hide the Catalog entry and to show which sites are available on the dashboard Products page.

This replaces the previous “Option A/B/C” with the **Forms-aligned** pattern: sync on template (and optionally page) save; computed or stored flag on site; single source of truth for “does this site have e-commerce?”.

---

## 5. Dashboard UIs to Provide

When e-commerce is present for a site, the dashboard should expose at least the following.

### 5.1 Entry point (Forms-aligned)

- **Dashboard-level page**: **/dashboard/products** (or **/dashboard/catalog**). List **sites that have e-commerce** (`has_ecommerce === true`). User selects a site → navigate to that site’s catalog (e.g. `/dashboard/products/[siteId]` for list of products/services, create/edit, categories).
- **Site management page**: Optional **Products** or **Catalog** tab when `site.has_forms === true` → **has_ecommerce** (show when `site.has_ecommerce === true`). Tab can link to `/dashboard/products/[siteId]` or open the same flow.
- **Sidebar**: “Products” or “Catalog” in the main dashboard sidebar → `/dashboard/products`. Visibility: always, or only when at least one site has `has_ecommerce` (from Redux after GET /sites).

### 5.2 Catalog CMS (core)

- **Products**
  - List view: name, SKU, price, status (draft/published), type (product/service).
  - Create / Edit: name, description, slug (optional; auto from name—see 5.4), price, compare-at price, cost, SKU, barcode, images (from assets library—see 5.5), category, tags, inventory (optional), variants (optional).
  - Bulk actions: publish/unpublish, delete, export.
- **Services**
  - Same list/create/edit flow as products, with service-specific fields: duration, booking rules, availability (if applicable).
  - Or a unified “Catalog” with type = product | service and type-specific fields.
- **Categories / taxonomy**
  - Manage categories or tags so blocks can filter by category (e.g. product grid “category” filter).

This is the **CMS** the user asked for: managing the content (products and services) that e-commerce blocks display.

### 5.4 Auto slugs (products and categories)

- **Products**: Slug field is **optional**. When left empty, the backend generates a slug from the product **name** on create/update (lowercase, hyphens, unique per site). Dashboard shows hint "Auto-generated from name when empty"; user can override with a custom slug.
- **Categories**: Same behaviour: optional slug; when empty, backend derives from category **name** and ensures uniqueness per site.
- **API**: On POST/PATCH, if `slug` is omitted or blank, backend sets `slug = slugify(name)` and disambiguates (e.g. `-2`, `-3`) if the slug already exists for that site. See **ECOMMERCE_IMPLEMENTATION_PLAN.md** Section 10.1.

### 5.5 Product images from assets library

- **Products** do not use free-text image URLs. The product form uses an **asset picker** that lists images from the **site (or user) assets library**.
- User selects one or more assets; the form submits asset IDs or the URLs returned by the assets API. Backend stores these in `catalog_products.images` (and may resolve asset IDs to URLs on read).
- **Assets API**: Use existing dashboard assets listing (e.g. site-scoped or user assets) so the picker can load selectable images. On product save, backend validates that selected assets belong to the site (or user) and persists. See **ECOMMERCE_IMPLEMENTATION_PLAN.md** Section 10.2.

### 5.3 Other management UIs (as needed)

- **Orders** – If the site has checkout/cart blocks, list orders placed for this site; detail view with status, fulfillment, payment info.
- **Inventory** – If products track stock, simple stock levels and low-stock alerts (can be phased in).
- **Discounts / promotions** – Optional; manage coupons or sale pricing.
- **Shipping / delivery** – Optional; settings or rules for physical products.

The exact set can be phased; the **minimum** is the **CMS for products and services** so that content shown in e-commerce blocks can be managed from the dashboard.

---

## 6. Data Model (high level)

- **Catalog ownership**: Products and services belong to a **site** (e.g. `site_id` on `products` and `services` tables, or a single `catalog_entries` table with `type = 'product' | 'service'`).
- **“Has e-commerce” per site**: Either (1) a **computed** value (e.g. “any page content contains an e-commerce block”) or (2) a **stored** value updated when template/page is saved (recommended, same idea as form_instances). Stored options: `site_features(site_id, feature)` with `feature = 'ecommerce'`, or a column `sites.has_ecommerce`. GET site(s) then includes `has_ecommerce` on each site.
- **Blocks consume the catalog**: E-commerce blocks do not store the full product list; they store **configuration** (e.g. “category slug”, “limit”, “sort”) and **fetch** products/services from the site’s catalog via API. So the CMS edits the same data the blocks display.
- **Optional “store” or “catalog” instance**: If multiple catalogs per site are ever needed, introduce a `stores` or `catalogs` table and link products to it; for the common case, one catalog per site is enough (products.site_id).

Existing migrations (e.g. product tables, product_type) can be aligned so that:
- Products and services are stored per site.
- Dashboard CMS reads/writes these tables.
- Public and block-rendering APIs read from the same tables (with published/draft and visibility rules).

---

## 7. API Shape (summary)

- **Site response (GET /sites, GET /sites/:id)**  
  Include **has_ecommerce: boolean** on each site (computed or from synced table). Same pattern as `has_forms`. Frontend stores in Redux and uses for Catalog visibility and site picker.

- **Dashboard (authenticated, site-scoped)**
  - `GET/POST/PATCH/DELETE /api/sites/:siteId/products` – CRUD for products.
  - `GET/POST/PATCH/DELETE /api/sites/:siteId/services` – CRUD for services (or unified `catalog` with type).
  - `GET/POST/PATCH/DELETE /api/sites/:siteId/categories` – Categories/taxonomy for the catalog.
  - Optional: orders, inventory, discounts endpoints under `/api/sites/:siteId/...`.

- **Public / storefront (for blocks)**
  - `GET /api/sites/:siteId/products` (or `/store/products`) – List products for display (filter by category, limit, sort); only published.
  - `GET /api/sites/:siteId/products/:slugOrId` – Single product for product-detail block.
  - Same for services if applicable.

The dashboard CMS uses the dashboard endpoints; e-commerce blocks use the public endpoints so they always reflect what the CMS manages.

---

## 8. User Flow (Forms-aligned)

1. User adds a “Product grid”, “Store”, “Services list”, or any e-commerce block to a **template** (or page) in the builder and saves (**PUT /templates/:id** or page save).
2. Backend runs e-commerce sync: for all sites using that template (or the site for page save), records “site has e-commerce” (e.g. in `site_features` or `sites.has_ecommerce`).
3. Next time the user fetches site(s), the API returns **has_ecommerce: true** for those sites. Frontend stores this in Redux.
4. Dashboard shows a **Products** or **Catalog** link (sidebar and/or site tab when `site.has_ecommerce === true`). User opens **/dashboard/products**, sees **sites that have e-commerce**, and chooses a site.
5. User manages catalog (products/services, categories) for that site. Blocks on the site fetch from the same catalog and show updated content.

Optional: first time the user opens the Catalog after adding an e-commerce block, show a short onboarding (“Add your first product” or “Import products”).

---

## 9. Summary Table (aligned with Forms)

| Layer | Responsibility |
|-------|----------------|
| **PUT /templates/:id** | Request has full config (pages, blockIds, blocks). Run e-commerce sync: detect e-commerce block types, update “site has e-commerce” for all sites using this template. (Optional: same on page create/update.) |
| **GET /sites/:id**, **GET /sites** | Include **has_ecommerce: boolean** on each site (from synced table or computed). |
| **Frontend** | Store site(s) response in Redux. Read `site.has_ecommerce` for Catalog visibility and for the dashboard Products page (site picker). |
| **Dashboard /dashboard/products** | List sites with `has_ecommerce === true`; user chooses site → manage that site’s catalog. |
| **Site management page** | Show Products/Catalog tab or link only when `site.has_ecommerce === true` (link to dashboard catalog for that site). |

**Principle**: Once an e-commerce component is added (and sync has run), the site has `has_ecommerce === true` and the dashboard provides the CMS and other UIs for managing products and services for that site—mirroring the Forms pattern.
