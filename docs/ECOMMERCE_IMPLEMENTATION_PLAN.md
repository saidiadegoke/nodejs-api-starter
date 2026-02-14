# E-Commerce Implementation Plan

This plan aligns with the Forms implementation and **ECOMMERCE_DASHBOARD_CMS_DESIGN.md**. It covers backend sync, site flag, dashboard entry, catalog APIs, and a **details section for each e-commerce component (template)** that users can add to a site.

---

## 1. Goal

- When a user adds any **e-commerce block** to a template (or page) and saves, the site is marked as having e-commerce so the dashboard shows **Products/Catalog** for that site.
- Dashboard flow mirrors Forms: **/dashboard/products** lists sites with `has_ecommerce === true`; user chooses a site and manages that site’s catalog (products, services, categories).
- E-commerce blocks **do not** store the full product list; they store **configuration** (filters, limit, sort, layout) and **fetch** from the site’s catalog via public API.

---

## 2. Scope

| In scope | Out of scope (initial phases) |
|----------|-------------------------------|
| E-commerce sync on **PUT /templates/:id** (detect e-commerce block types, set “site has e-commerce” for all sites using template) | Multiple catalogs per site |
| Optional sync on **page create/update** for that site | Orders, inventory, discounts, shipping (can phase later) |
| **has_ecommerce** on GET /sites and GET /sites/:id | Checkout payment gateway integration |
| Dashboard: /dashboard/products (site picker), /dashboard/products/[siteId] (catalog CMS) | Product variants/options (can phase) |
| Catalog API: sites/:siteId/products, services, categories (CRUD + public read) | Store block as multi-block “section” (implement as single block or composition) |
| E-commerce component implementations in smartstore-app (see Section 6) | |

---

## 3. Phases Overview

| Phase | Description |
|-------|-------------|
| **Phase 1** | Backend: e-commerce block type list, sync on template save (and optional page save), store “has e-commerce” per site, add **has_ecommerce** to GET site(s). |
| **Phase 2** | Frontend: Site type + Redux, sidebar “Products” link, /dashboard/products (site picker), /dashboard/products/[siteId] placeholder; site management Products tab when has_ecommerce. |
| **Phase 3** | Catalog: products/services/categories tables (or align existing migrations), dashboard CRUD APIs, public read-only APIs for storefront. |
| **Phase 4** | Dashboard catalog UI: list/create/edit products and services, categories; optional orders list. |
| **Phase 5** | E-commerce block components in smartstore-app (product-grid, store, featured-products, product-detail, cart, checkout, services-list) that consume public catalog API. |
| **Phase 6** | Catalog UX: auto slugs (products/categories), product images from assets library, product detail page fix (on-click), add-to-cart, cart page, related products, product selection/config on detail, comprehensive search and filtering. |

Section 6 below details **each e-commerce component/template** (block type, config, catalog dependency, variants) for implementation. Section 10 details **Phase 6** scope.

---

## 4. Phase 1 – Backend: Sync and has_ecommerce

### 4.1 Canonical list of e-commerce block types

Any block whose **type** or **componentId** is in this list is considered an e-commerce block. When such a block appears in template or page content, the site is marked as having e-commerce.

| Block type / componentId | Description |
|--------------------------|-------------|
| `product-grid` | Grid/list of products from catalog (filter by category, limit, sort). |
| `products` | Alias or alternate id for product grid. |
| `store` | Full store page (hero + product grid + CTA). |
| `featured-products` | Subset of products (e.g. by tag or manual pick). |
| `product-detail` | Single product view (slug/id from route). |
| `product-card` | Single product card (usually used inside grid/store; may still count as e-commerce). |
| `cart` | Shopping cart. |
| `checkout` | Checkout flow. |
| `services-list` | List of services (existing component in smartstore-app). |
| *(registry)* | Any component with `category: 'ecommerce'` or `requiresCatalog: true` in component_registry. |

**Implementation**: Define `ECOMMERCE_BLOCK_TYPES` array (and optionally resolve from component_registry by category) and use it in the sync step.

### 4.2 Sync on template save

- **When**: After successful **PUT /templates/:id** with `config` in body.
- **Input**: `templateId`, `config` (with `config.pages`, `config.blocks`).
- **Logic**:
  1. Collect all block types present in `config.blocks` (and in any page content if blocks are inlined).
  2. If at least one block type is in `ECOMMERCE_BLOCK_TYPES` (or has category ecommerce in registry), get all site IDs that use this template (e.g. `TemplateModel.getSiteIdsByTemplateId(templateId)`).
  3. For each site ID, set “site has e-commerce”: e.g. upsert into `site_features(site_id, feature)` with `feature = 'ecommerce'`, or set `sites.has_ecommerce = true` if column exists.
  4. If **no** e-commerce block remains in config, optionally clear “has e-commerce” for sites that use only this template (or leave as-is for Phase 1).
- **Where**: New service e.g. `src/modules/sites/services/site-features.service.js` or in a new `ecommerce-sync.service.js`; call from template controller after update.

### 4.3 Sync on page save (optional)

- When **POST /sites/:siteId/pages** or **PUT /sites/:siteId/pages/:pageId** includes `content` with blocks, scan for e-commerce block types; if any, set “site has e-commerce” for that `siteId`. Same as Forms: optional but consistent.

### 4.4 has_ecommerce on GET site(s)

- In **SiteService.getSiteById** and **SiteService.getUserSites**, after loading site(s), attach **has_ecommerce: boolean** (read from `site_features` or `sites.has_ecommerce`). For list, one batch query for site IDs that have the feature. Same pattern as `has_forms` and FormInstanceModel.

### 4.5 Data store for “site has e-commerce”

- **Option A**: New table `site_features(site_id, feature)` with unique(site_id, feature). Upsert `('ecommerce')` on sync; GET site checks existence.
- **Option B**: Add column `sites.has_ecommerce BOOLEAN DEFAULT false`; set true/false in sync. Simpler for a single feature.

---

## 5. Phase 2 – Frontend: Dashboard entry and site picker

- **Site type**: Add `has_ecommerce?: boolean` to site (sites-api / types). Redux already stores site(s); no change to store shape.
- **Sidebar**: Add “Products” or “Catalog” link → `/dashboard/products`. Show always, or only when at least one site has `has_ecommerce` (from GET /sites in Redux).
- **/dashboard/products**: List sites with `has_ecommerce === true`; empty state if none. Each site card: “Manage catalog” → `/dashboard/products/[siteId]`.
- **/dashboard/products/[siteId]**: Placeholder or catalog home (product list, services list, categories) for that site. Implement fully in Phase 4.
- **Site management page**: When `site.has_ecommerce === true`, show a **Products** or **Catalog** tab that links to `/dashboard/products/[siteId]` (same as Forms tab linking to Forms for that site).

---

## 6. E-Commerce Components (Templates) – Detail per component

Each subsection describes one **e-commerce block type** that a user can add to a site. Implementation order can follow priority (e.g. product-grid and catalog first, then cart/checkout).

---

### 6.1 Product Grid

| Field | Detail |
|-------|--------|
| **Block type / componentId** | `product-grid`, or `products` |
| **Purpose** | Displays a list or grid of products from the site’s catalog. Used for main shop page, category pages, or “All products” sections. |
| **Catalog dependency** | Fetches products via **public** API: e.g. `GET /public/sites/:siteId/products` or `GET /public/sites/:siteId/catalog/products` with query params (category, limit, offset, sort). Does **not** store product IDs in block data; only configuration. |
| **Config (block data)** | `title?: string`, `template?: 'grid' \| 'masonry' \| 'list'`, `columns?: number`, `limit?: number`, `categorySlug?: string`, `sort?: 'newest' \| 'price_asc' \| 'price_desc' \| 'name'`, `showFilters?: boolean`. |
| **Settings** | `pagination?: boolean`, `perPage?: number`, `cardTemplate?: string` (variant of product card). |
| **Template variants** | Grid (default), masonry, list. Each can have its own template in smartstore-app (e.g. productgrid-section-1, productgrid-section-2). |
| **Implementation notes** | Component in smartstore-app: `components/smartstore/productgrid/`. Resolve block type from block.type or block.componentId. Fetches catalog at render time; supports loading and empty states. |

---

### 6.2 Store (full store page)

| Field | Detail |
|-------|--------|
| **Block type / componentId** | `store` |
| **Purpose** | A full “store” experience: hero section + product grid + optional CTA. Often used as the main /store or /shop page. |
| **Catalog dependency** | Same as product grid: uses public products API. May also show featured or “highlighted” products (config or tag). |
| **Config (block data)** | `heroHeadline?: string`, `heroSubheadline?: string`, `heroImage?: string`, `productGridConfig?: { limit, categorySlug, sort }`, `ctaHeadline?: string`, `ctaButtonLabel?: string`, `ctaButtonUrl?: string`. Can embed or reference a product grid config. |
| **Settings** | Theme/layout (e.g. full width, container). |
| **Template variants** | Store-section-1 (hero + grid + CTA), minimal (grid only with small header). |
| **Implementation notes** | Can be implemented as a single block that composes hero + product grid + CTA in one template, or as a “section” that references child blocks. For simplicity, one block type “store” with one or more templates. |

---

### 6.3 Featured Products

| Field | Detail |
|-------|--------|
| **Block type / componentId** | `featured-products` |
| **Purpose** | Highlights a subset of products (e.g. homepage “Featured” or “Best sellers”). Can be manual pick or by tag/category. |
| **Catalog dependency** | Public API: `GET .../products?tag=featured` or `GET .../products?ids=...` or by category. Block stores either a list of product IDs/slugs (manual) or a tag/category slug. |
| **Config (block data)** | `title?: string`, `source: 'manual' \| 'tag' \| 'category'`, `productIds?: string[]` (if manual), `tagSlug?: string`, `categorySlug?: string`, `limit?: number`, `layout?: 'grid' \| 'carousel' \| 'list'`. |
| **Settings** | Card style, columns. |
| **Template variants** | Featured-products-section-1 (grid), Featured-products-section-2 (carousel). |
| **Implementation notes** | If source is manual, block stores productIds/slugs; storefront still fetches current product data from API so name/price/image stay in sync. |

---

### 6.4 Product Detail

| Field | Detail |
|-------|--------|
| **Block type / componentId** | `product-detail` |
| **Purpose** | Single product view: image(s), title, price, description, variants, add-to-cart. Used on dynamic route e.g. `/store/:slug` or `/product/:id`. |
| **Catalog dependency** | Public API: `GET /public/sites/:siteId/products/:slugOrId`. Product identity comes from **route** (slug or id), not from block data. Block only needs layout/theme config. |
| **Config (block data)** | `template?: 'default' \| 'minimal' \| 'gallery'`, `showVariants?: boolean`, `showRelated?: boolean`, `relatedLimit?: number`. |
| **Settings** | Image zoom, gallery layout. |
| **Template variants** | Product-detail-section-1 (default), minimal (compact), gallery (large images). |
| **Implementation notes** | Page or route must resolve slug/id to product; block receives product id/slug from route/context and fetches one product. Often used once per product page. |

---

### 6.5 Product Card

| Field | Detail |
|-------|--------|
| **Block type / componentId** | `product-card` |
| **Purpose** | Displays one product (image, title, price, button). Used **inside** product grid or featured-products; can also be used as a standalone “promo” block for one product. |
| **Catalog dependency** | If used standalone: one product by id/slug from public API. If used inside grid: grid passes product data; no extra fetch. |
| **Config (block data)** | When standalone: `productId?: string` or `productSlug?: string`. When inside grid: product injected by parent. `template?: 'default' \| 'compact' \| 'minimal' \| 'detailed'`, `buttonLabel?: string`. |
| **Settings** | `showWishlist?: boolean`, `showQuickView?: boolean`, image aspect ratio. |
| **Template variants** | Default, compact, minimal, detailed. |
| **Implementation notes** | Product grid typically renders many product-cards (or equivalent) with data from list API. Standalone product-card block can be used for “Product of the day” or single featured product. Count as e-commerce block so adding one enables catalog. |

---

### 6.6 Cart

| Field | Detail |
|-------|--------|
| **Block type / componentId** | `cart` |
| **Purpose** | Shopping cart: list of line items, quantities, subtotal, link to checkout. Can be sidebar (slide-out) or full page. |
| **Catalog dependency** | Cart stores product id, variant id, quantity. Prices can be re-fetched from catalog for display/validation. Cart state: client-side (cookie/localStorage) or server-side (cart API per site). |
| **Config (block data)** | `template?: 'sidebar' \| 'page' \| 'minimal'`, `showShipping?: boolean`, `showTax?: boolean`, `currency?: string`, `checkoutButtonLabel?: string`. |
| **Settings** | `persistCart?: boolean` (server vs client), `checkoutUrl?: string` (e.g. /checkout). |
| **Template variants** | Sidebar (slide-out), page (full), minimal. |
| **Implementation notes** | Requires cart API (create/update/delete cart, add/remove line items) or client-only cart. Checkout block then reads cart and runs payment flow. |

---

### 6.7 Checkout

| Field | Detail |
|-------|--------|
| **Block type / componentId** | `checkout` |
| **Purpose** | Checkout flow: cart summary, shipping/billing address, payment. Usually a dedicated page. |
| **Catalog dependency** | Reads cart; may validate product availability/pricing against catalog. Orders created on success. |
| **Config (block data)** | `template?: 'single-page' \| 'multi-step'`, `successUrl?: string`, `cancelUrl?: string`. |
| **Settings** | Payment provider placeholders, tax rules. |
| **Template variants** | Single-page, multi-step (cart → address → payment). |
| **Implementation notes** | Depends on cart and orders API. Payment gateway integration is out of scope for initial plan; can show “Order placed” with placeholder payment. |

---

### 6.8 Services List

| Field | Detail |
|-------|--------|
| **Block type / componentId** | `services-list` |
| **Purpose** | List of services (e.g. cleaning packages, consultations) with image, description, “What’s included”, price, CTA. **Already implemented** in smartstore-app as a content block with editable JSON; can be extended to fetch from catalog “services” API. |
| **Catalog dependency** | **Option A**: Block stores full content in `itemsJson` (current). **Option B**: Block stores config (categorySlug, limit) and fetches from `GET .../services` so services are managed in catalog CMS. For consistency with “catalog-driven” e-commerce, Option B preferred long-term. |
| **Config (block data)** | Current: `itemsJson` (array of service items). Catalog-driven: `categorySlug?: string`, `limit?: number`, `sort?: string`, or `serviceIds?: string[]` for manual pick. |
| **Settings** | CTA URL, layout (alternating image left/right). |
| **Template variants** | services-list-section-1 (existing). |
| **Implementation notes** | Already in app; ensure block type is in `ECOMMERCE_BLOCK_TYPES` so adding it sets has_ecommerce. If catalog has a “services” entity, services-list can later switch to fetching from API like product-grid. |

---

## 7. Component registry and block type resolution

- **In API**: When syncing, determine “is e-commerce” by (1) block type or componentId in `ECOMMERCE_BLOCK_TYPES`, or (2) lookup component_registry by componentId and check `category === 'ecommerce'` or `requiresCatalog === true`. Prefer (1) for clarity and (2) for future components that register as ecommerce without code change.
- **In smartstore-app**: Each component above is implemented under `components/smartstore/[name]/` with template variants as needed. Block renderer loads by type/componentId; block data and settings are passed as props. Catalog data is fetched at runtime from public API using siteId (from config or context).

---

## 8. File / area checklist

| Phase | Area | File(s) / notes |
|-------|------|------------------|
| 1 | E-commerce block type list | New: `src/modules/sites/constants/ecommerce-block-types.js` or in site-features service. |
| 1 | Sync on template save | `site-features.service.js` or `ecommerce-sync.service.js`; call from `template.controller.js` after PUT /templates/:id. |
| 1 | Site “has e-commerce” storage | Migration: `site_features` table or `sites.has_ecommerce` column. Model + read in SiteService. |
| 1 | has_ecommerce on GET site(s) | `site.service.js`: attach has_ecommerce (and optionally batch for list). |
| 2 | Frontend site type | `sites-api.ts`: add `has_ecommerce?: boolean`. |
| 2 | Sidebar + /dashboard/products | Sidebar link; `app/dashboard/products/page.tsx` (site picker), `app/dashboard/products/[siteId]/page.tsx` (catalog home). |
| 2 | Site management tab | Show Products tab when `site.has_ecommerce === true`; link to `/dashboard/products/[siteId]`. |
| 3 | Catalog API | Products/services/categories CRUD under `/sites/:siteId/...`; public read under `/public/sites/:siteId/...` or `/public/sites/:siteId/catalog/...`. |
| 4 | Catalog CMS UI | List/create/edit products, services, categories in dashboard. |
| 5 | E-commerce components | Implement each block in smartstore-app (see Section 6); register in component registry with category `ecommerce` if desired. |

---

## 9. Summary

- **Sync**: On PUT /templates/:id (and optional page save), detect e-commerce block types and set “site has e-commerce” for affected sites.
- **Flag**: GET /sites and GET /sites/:id return **has_ecommerce**; frontend stores in Redux and shows Products entry and site picker.
- **Dashboard**: /dashboard/products → choose site → /dashboard/products/[siteId] for catalog CMS (products, services, categories).
- **Blocks**: Each e-commerce component (product-grid, store, featured-products, product-detail, product-card, cart, checkout, services-list) is documented in Section 6 with block type, config, catalog dependency, and template variants. They fetch from the site’s catalog via public API; they do not store full product lists in block data.

This plan aligns with the Forms pattern and **ECOMMERCE_DASHBOARD_CMS_DESIGN.md** and gives implementers a clear phase order and per-component detail.

---

## 10. Phase 6 – Catalog UX, Cart, Search & Storefront

Phase 6 covers dashboard catalog UX improvements, storefront product-detail and navigation fixes, add-to-cart, cart page, related products, product selection/config on the detail page, and comprehensive product search and filtering.

### 10.1 Auto slugs (products and categories)

| Area | Detail |
|------|--------|
| **When** | On create and on edit when name (or source field) changes; optional: always derive from name on save if slug is empty. |
| **Products** | If user leaves **slug** empty: derive from **name** (lowercase, replace spaces/special with hyphens, deduplicate). On edit, optional "regenerate from name" or auto-update when name changes. API: accept `slug` optional; if omitted, backend generates from `name` and ensures uniqueness per site (e.g. append `-2` if collision). |
| **Categories** | Same: optional slug; if empty, derive from **name**; ensure unique per site. |
| **Dashboard** | Slug field optional; show "Auto-generated from name" when empty; allow override. |
| **Implementation** | Backend: in product and category create/update, if `slug` is blank or not sent, set `slug = slugify(name)`; then `SELECT` for existing with same slug in site, if exists set `slug = slugify(name) + '-' + suffix` (e.g. increment). Reuse or add shared `slugify()` helper. |

### 10.2 Product images from assets library

| Area | Detail |
|------|--------|
| **Current** | Products may have `images` (array of URLs or asset identifiers). |
| **Target** | Product images are chosen from the **site/assets library** (dashboard assets or site-scoped assets). No free-text image URL in product form. |
| **Dashboard** | In product create/edit: **Images** field uses an **asset picker** (modal or inline) that lists assets for the site (or user); user selects one or more assets; form stores asset IDs or stored URLs returned by assets API. |
| **API** | Products store `images` as array of strings: either **asset IDs** (e.g. `asset_123`) or **resolved URLs** (from assets service). Public product API returns **URLs** (resolve asset IDs to URLs when returning product; or store URLs in DB when asset is selected). Recommendation: store asset IDs in `catalog_products.images` (JSONB array of strings); on read (dashboard + public), resolve IDs to URLs via assets service or a small lookup. Alternatively store URLs at save time when user picks from assets (simpler; URLs in DB). |
| **Assets API** | Dashboard already has `GET /sites/:siteId/assets` or similar; asset picker calls this to list selectable images. On product save, send selected asset IDs (or URLs); backend validates they belong to site and saves. |
| **Migration** | If `catalog_products.images` is currently free-text URLs, keep column; new flow writes asset-derived URLs or asset IDs. If using IDs, add resolution step in product service when attaching to response. |

### 10.3 Product detail page – on-click fix

| Area | Detail |
|------|--------|
| **Issue** | Clicking a product in the grid (or card) should open the product detail page; currently links may be wrong or the detail page does not load. |
| **Storefront** | Ensure product grid and cards link to **`/{siteSlug}/store/{productSlug}`** (or configured product base path). Route must be **`[siteSlug]/store/[productSlug]/page.tsx`**; page fetches product by slug and renders product-detail block with slug from URL. |
| **Checks** | (1) Product grid/card `href` uses correct base (site slug + product page slug from block config). (2) Next.js route exists and matches. (3) No client-side navigation issues (use Next.js `Link`). (4) Product detail block receives `productSlug` from route (synthetic page or context) and fetches product. |
| **Implementation** | Verify `app/[siteSlug]/store/[productSlug]/page.tsx` builds synthetic page with `productSlug` in block data; ensure block uses it. Fix any `basePath` or `productPageSlug` mismatch in product-grid templates. |

### 10.4 Add to cart

| Area | Detail |
|------|--------|
| **Scope** | Add-to-cart on **product card** (in grid) and on **product detail** page. Cart state can be client-only (context + localStorage/cookie) or server (cart API); Phase 6 can start with **client-side cart** (no orders yet). |
| **Product card** | Each card has an **Add to cart** button (or icon). On click: add one unit of that product (id/slug) to cart state; optional toast "Added to cart"; cart icon in header can show count. |
| **Product detail** | **Product selection/config section** (see 10.6) includes quantity and **Add to cart** button. On submit: add product with chosen quantity to cart; optional redirect to cart or stay with toast. |
| **Cart state** | Store: `{ items: [{ productId, slug, name, price, quantity, image? }], updatedAt }`. Persist in **localStorage** (key e.g. `cart_{siteId}`) so cart survives refresh. Context provider in storefront (or per-site) for cart state and actions (add, update quantity, remove). |
| **Implementation** | smartstore-app: CartContext (or store), cart reducer (add/update/remove), persist to localStorage; product grid card and product-detail block get add-to-cart button and call context action. |

### 10.5 Cart page

| Area | Detail |
|------|--------|
| **Purpose** | Full-page (or block) view of cart: list line items, quantity controls, remove, subtotal, link to checkout. |
| **Route** | e.g. `/{siteSlug}/cart` (or block on a page with slug `cart`). |
| **Block** | **Cart** block type (Section 6.6): template `sidebar` \| `page` \| `minimal`. For "cart page", use template **page**: list items, edit quantities, remove, subtotal, **Proceed to checkout** button → `/{siteSlug}/checkout` or configured URL. |
| **Data** | Cart block reads from same CartContext (client cart); no API required for read. Display product name, price, quantity, image from cart state; optionally re-fetch current price from catalog for validation (can phase). |
| **Implementation** | Implement **cart** block in smartstore-app; add route or page slug `cart` that contains cart block; block renders line items from context. |

### 10.6 Product selection/config section (detail page, before add to cart)

| Area | Detail |
|------|--------|
| **Purpose** | On the product detail page, **before** the Add to cart button: section where user can configure the selection (quantity, and later: variants, options). |
| **Content** | Minimum: **Quantity** (number input, default 1). Optional: variant picker (e.g. size, color) if product has variants (can phase). Then **Add to cart** button. |
| **Placement** | In product-detail block template: after image(s) and description, a clear "Selection" or "Order" section: quantity + Add to cart. |
| **Implementation** | Product-detail template: add quantity state (useState); form/div with label "Quantity", input type number, min 1; button "Add to cart" that calls cart context add(product, quantity). |

### 10.7 Related products

| Area | Detail |
|------|--------|
| **Purpose** | On product detail page, show a short list of **related products** (e.g. same category, or same tag) to encourage discovery. |
| **Config** | Product-detail block config: `showRelated?: boolean`, `relatedLimit?: number` (e.g. 4). |
| **Data** | When rendering product detail, call public API: e.g. `GET /public/sites/:siteId/products?category_id={product.category_id}&limit=4&exclude={product.id}` (or by tag). Backend: add optional `exclude` (product id) and use `category_id` / `tag` to return related. |
| **UI** | Below main product content, a row of product cards (reuse product-card style from grid) with title "You may also like" or "Related products". |
| **Implementation** | API: extend list products to support `exclude` (array of ids). Product-detail block: fetch related when `showRelated` true; render small grid. |

### 10.8 Comprehensive product search and filtering

| Area | Detail |
|------|--------|
| **API** | Public list products already supports `category_slug`, `category_id`, `type`, `limit`, `offset`, `sort`, `tag`. Add: **`q`** (full-text or name/description search), **`min_price`**, **`max_price`** (optional). Backend: `q` filters by name/description (ILIKE or full-text); price range filters. |
| **Storefront** | Product grid (or store) block or a dedicated **store page** can show: **Search** input (debounced, sets `q`); **Category** dropdown or pills; **Sort** (newest, price asc/desc, name); optional **Price range** (min/max). Filters update URL query params and refetch products. |
| **Block config** | Product grid (or store) config: `showSearch?: boolean`, `showFilters?: boolean`, `showSort?: boolean`. When true, render search bar and filter controls above grid; state in block or URL. |
| **Implementation** | Backend: add `q`, `min_price`, `max_price` to list products handler and product model list filter. Frontend: product-grid or store block: add search input and filter UI; on change, update params and call `getPublicProducts(siteId, { q, category_slug, sort, min_price, max_price, limit, offset })`. Optional: persist filters in URL for shareable links. |

### 10.9 File / implementation checklist (Phase 6)

| Item | Where |
|------|--------|
| Auto slug (products) | Backend: product model create/update; slugify + uniqueness per site. Dashboard: slug optional, show "Auto from name". |
| Auto slug (categories) | Backend: category model create/update; same. Dashboard: slug optional. |
| Product images from assets | Dashboard: product form asset picker (list site assets, multi-select); API: accept asset IDs or URLs, validate; store in `catalog_products.images`. Resolve to URLs on read if storing IDs. |
| Product detail on-click | smartstore-app: verify route `[siteSlug]/store/[productSlug]`, Link href in grid/cards, productSlug passed to block. |
| Add to cart | smartstore-app: CartContext, localStorage key by siteId, add/update/remove; Add to cart on card and detail. |
| Cart page | smartstore-app: cart block (page template), route or page slug `cart`; list items from context, quantity, remove, subtotal, checkout link. |
| Product selection (detail) | Product-detail block: quantity input + Add to cart button. |
| Related products | API: list products `exclude` param; product-detail block: fetch related by category_id, render row. |
| Search & filtering | API: `q`, `min_price`, `max_price`; product grid/store: search input, category/sort/price UI, refetch with params. |

### 10.10 Phase 6 status (tracking)

| Item | Status | Notes |
|------|--------|--------|
| 10.1 Auto slugs (products & categories) | **Done** | Backend: `ensureUniqueSlug` in product and category models; create/update use it. Dashboard: slug optional + hint. |
| 10.2 Product images from assets | **Done** | Dashboard: ProductImagePicker (site assets + paste URL) on catalog new/edit; API resolves asset IDs to URLs and stores string[] in catalog_products.images. |
| 10.3 Product detail on-click | **Done** | Route `[siteSlug]/store/[productSlug]`, product-detail block, links from grid. |
| 10.4 Add to cart | **Done** | CartContext (localStorage by siteId), add on card and detail. |
| 10.5 Cart page | **Done** | Route `[siteSlug]/cart`, cart block (cart-section-1): items, quantity, remove, subtotal, checkout link. |
| 10.6 Product selection (detail) | **Done** | Quantity input + Add to cart in productdetail-section-1. |
| 10.7 Related products | **Done** | Product-detail: `showRelated`, `relatedLimit`; fetch with `exclude`, `category_id`; related row with cards. |
| 10.8 Search & filtering | **Done** | Backend: `q`, `min_price`, `max_price`, `exclude`. Product grid: `showFilters`, search + category + sort + min/max price. |

**Future (not yet implemented):**
- **Product options (e.g. color, size, type):** Backend would need `product.options` (e.g. `[{ name: 'Color', values: ['Red', 'Blue'] }, { name: 'Size', values: ['S','M','L'] }]`) or variant SKUs. Storefront product-detail would then render option selectors and pass selected options when adding to cart.
- **Topnav/Footer from template:** Layout default regions use static block data. To show template-configured nav links or footer columns, the API could return resolved block data for header/footer from the template, or the dashboard could save nav/footer config into the layout block data when the template is saved.
