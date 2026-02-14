# Form Submissions Service – Design & Implementation

## 1. Overview

A backend service that **accepts, persists, and exposes submissions for any form rendered on any page** of a SmartStore site. When a form block (e.g. contact form, generic form, newsletter) is added to a page, the system stores **form instance** metadata so the **dashboard** can show a dedicated section to list submissions for that form and optionally **respond** (e.g. internal note or reply).

### Goals

- **Generic**: Support any form on the UI (contactform, form block, hero quote form, newsletter, etc.).
- **Persistent**: All submissions stored in the database, queryable per form.
- **Dashboard**: When a form is used in a block, the site dashboard gets a section to manage that form’s submissions and respond.
- **Secure**: Public submit endpoint for anonymous users; list/respond only for authenticated site owners/admins.

---

## 2. Concepts

| Concept | Description |
|--------|-------------|
| **Form instance** | A single form as it appears in one place: identified by **site + page + block**. One block = one form instance. |
| **Form submission** | One submit event: payload (field key/value), timestamp, optional metadata (IP, user agent). |
| **Form response** | Optional admin action on a submission: e.g. “Replied”, “Archived”, or an internal note. |

---

## 3. Data Model

### 3.1 Form instances (registration / metadata)

When a page is saved and its content includes one or more form blocks, the backend can **register** or **sync** form instances for that page so the dashboard knows which forms exist and can attach submissions to them.

**Option A – Explicit registration (recommended)**  
Form instances are rows in a table, created/updated when:
- A page is saved (API or builder) and the payload contains blocks of form types, or
- A dedicated “register form” endpoint is called (e.g. when the block renderer mounts a form block).

**Option B – Implicit (no registration table)**  
Submissions reference `site_id`, `page_id`, `block_id` only. Dashboard discovers “forms” by scanning `pages.content` for block types that are forms and then fetches submissions by `(site_id, page_id, block_id)`. No separate form_instances table.

**Recommended: Option A** so the dashboard can show a stable list of “forms” with optional display name and settings (e.g. “Contact – Home”, “Newsletter – Footer”) and so form-level settings (e.g. notify email) can live in one place.

**Table: `form_instances`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique form instance id (used in submit and list APIs). |
| `site_id` | INT (FK → sites) | Site this form belongs to. |
| `page_id` | INT (FK → pages) | Page where the form block lives. |
| `block_id` | VARCHAR(255) | Block id from `pages.content` (e.g. `block-1`). |
| `block_type` | VARCHAR(100) | Component type (e.g. `contactform`, `form`, `newsletter`). |
| `display_name` | VARCHAR(255) | Optional label for dashboard (e.g. “Contact (Home)”). |
| `config_snapshot` | JSONB | Optional copy of block `data`/`settings` at registration (field names, labels, notify email, etc.). |
| `created_at` | TIMESTAMP | When the instance was registered. |
| `updated_at` | TIMESTAMP | Last sync/update. |

- **Unique constraint**: `(site_id, page_id, block_id)` so the same block always maps to one form instance.
- **Indexes**: `site_id`, `(site_id, page_id)`, and optionally `block_type` for filtering.

When a form block is **removed** from the page, either:
- Soft-delete the row (e.g. `deleted_at`), or
- Delete the row and keep submissions linked by `site_id, page_id, block_id` only (submissions remain queryable by page/block even if the instance row is gone).

---

### 3.2 Form submissions

**Table: `form_submissions`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique submission id. |
| `form_instance_id` | UUID (FK → form_instances) | Which form was submitted (nullable if Option B). |
| `site_id` | INT (FK → sites) | Denormalized for fast per-site queries. |
| `page_id` | INT (FK → pages) | Denormalized. |
| `block_id` | VARCHAR(255) | Denormalized; required if form_instance_id is nullable. |
| `payload` | JSONB | Field name → value (string or array for multi-value). All form fields stored here. |
| `status` | VARCHAR(50) | e.g. `new`, `read`, `replied`, `archived`. |
| `source_url` | TEXT | Optional: page URL or path at submit time. |
| `ip_address` | VARCHAR(45) | Optional; for abuse/spam. |
| `user_agent` | TEXT | Optional. |
| `created_at` | TIMESTAMP | Submit time. |
| `updated_at` | TIMESTAMP | Last status/response change. |

- **Indexes**: `form_instance_id`, `site_id`, `(site_id, form_instance_id)`, `created_at`, `status`.

If **Option B** (no form_instances) is used, `form_instance_id` is null and queries use `(site_id, page_id, block_id)`.

---

### 3.3 Form responses (optional)

**Table: `form_responses`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Unique response id. |
| `submission_id` | UUID (FK → form_submissions) | Submission this response belongs to. |
| `type` | VARCHAR(50) | e.g. `note`, `reply`, `status_change`. |
| `body` | TEXT | Note text or reply body. |
| `created_by` | UUID (FK → users) | Admin who wrote it. |
| `created_at` | TIMESTAMP | When the response was added. |

- **Index**: `submission_id`.

Status on `form_submissions` can be updated when a “reply” is sent (e.g. set `status = 'replied'`) or via a separate status field update.

---

## 4. API Design

### 4.1 Public (unauthenticated)

**POST** `/api/sites/:siteId/forms/submit`

- **Purpose**: Submit any form on the site.
- **Body** (JSON):
  - `form_instance_id` (optional if fallback is supported): UUID of the form instance.
  - **Or** `page_slug` + `block_id`: so the backend can resolve the form (and optionally create/lookup form_instance).
  - `payload`: object of field names to values (e.g. `{ "name": "...", "email": "...", "message": "..." }`.
  - `source_url` (optional): current path or full URL.
- **Response**: `201 Created` with `{ "submissionId": "...", "message": "..." }` or `400`/`422` for validation errors.
- **Security**: Rate limit by IP and/or by (site_id, form_instance_id). Optional CAPTCHA or honeypot for public forms. No auth required.

**Resolving the form**

- If `form_instance_id` is sent, use it and ensure it belongs to `siteId`.
- If only `page_slug` + `block_id` are sent:
  - Load page by `site_id` and `slug = page_slug`.
  - Find block in `content.regions[].blocks[]` with `id === block_id` and `type` in a known form types list (e.g. `contactform`, `form`, `newsletter`).
  - Create or get `form_instances` row for `(site_id, page_id, block_id)` and use its `id` for the submission.

### 4.2 Dashboard (authenticated)

Assume existing auth middleware: user must be site owner or have a “manage site” / “view submissions” role.

**GET** `/api/sites/:siteId/forms`

- **Purpose**: List form instances for the site (for dashboard sidebar or dropdown).
- **Response**: Array of `{ id, page_id, page_slug, block_id, block_type, display_name, submissions_count?, created_at }`.
- **Query**: Optional `page_slug` to filter by page.

**GET** `/api/sites/:siteId/forms/:formInstanceId/submissions`

- **Purpose**: List submissions for one form (paginated).
- **Query**: `page`, `limit`, `status` (optional filter).
- **Response**: `{ items: [...], total, page, limit }`. Each item includes `id`, `payload`, `status`, `created_at`, optional `responses_count` or last response snippet.

**GET** `/api/sites/:siteId/forms/submissions/:submissionId`

- **Purpose**: Single submission detail (payload + responses) for viewing/responding.
- **Response**: Submission + nested `responses[]`.

**PATCH** `/api/sites/:siteId/forms/submissions/:submissionId`

- **Purpose**: Update submission (e.g. `status` only).
- **Body**: `{ "status": "read" | "replied" | "archived" }`.

**POST** `/api/sites/:siteId/forms/submissions/:submissionId/responses`

- **Purpose**: Add a response (note or reply).
- **Body**: `{ "type": "note" | "reply", "body": "..." }`.
- **Side effect**: Optionally set submission `status` to `replied` when `type === 'reply'`.

**DELETE** `/api/sites/:siteId/forms/submissions/:submissionId` (optional)

- **Purpose**: Delete or soft-delete a submission (per policy).

---

## 5. Frontend Integration

### 5.1 Submitting from the UI

- Each form block (contactform, form, newsletter, etc.) must submit to the new API when “persist submissions” is desired.
- **Contract**: The block receives (from block renderer or page/site config):
  - `siteId`
  - `formInstanceId` (if pre-registered) or `pageSlug` + `blockId`
  - Optional `submitEndpoint` (default: `/api/sites/:siteId/forms/submit`).

**Example (contactform):**

- On submit, if `formInstanceId` or `(pageSlug, blockId)` and `siteId` are available, POST to the submit endpoint with `payload` (and optional `source_url`). Otherwise fall back to current behavior (e.g. `/api/contact` or custom `onSubmit`).

### 5.2 Form instance registration

- **On page save (recommended):** When the site builder or API saves `pages.content`, the backend parses blocks and:
  - For each block whose `type` is in a known form list (`contactform`, `form`, `newsletter`, etc.):
    - Upsert `form_instances` for `(site_id, page_id, block.id)` with `block_type`, optional `display_name` from block data, and optional `config_snapshot`.
- **On first submit (lazy):** If submit is called with only `page_slug` + `block_id`, resolve page and block, then create the form instance if it doesn’t exist (idempotent upsert).

Either approach ensures that once a form is used, the dashboard can list it and its submissions.

### 5.3 Dashboard section “Form submissions”

- When the dashboard loads a site, call `GET /api/sites/:siteId/forms` to get form instances.
- For each form instance, show a section (or link) like “Contact (Home)” that links to a submissions list for that form.
- Submissions list: `GET /api/sites/:siteId/forms/:formInstanceId/submissions`.
- Detail view: open a submission and use:
  - `GET /api/sites/:siteId/forms/submissions/:submissionId`
  - `PATCH` for status
  - `POST .../responses` to add note/reply.

So: **when a form is added to a block, the backend stores form instance (and optionally config). That automatically adds a section in the dashboard to manage submissions and respond.**

---

## 6. Security & Compliance

### 6.1 Form security (bot prevention)

The public submit endpoint is unauthenticated, so it is a target for bots and abuse. Use layered defenses:

| Measure | Description | Implementation |
|--------|-------------|----------------|
| **Honeypot** | Hidden field that humans leave empty; bots often fill all fields. If present and non-empty in the request body, reject the submission with a generic error (do not reveal it was bot detection). | Body field `_hp` (or `website`). Backend rejects if `_hp` is truthy. Frontend: add `<input type="text" name="_hp" autocomplete="off" tabindex="-1" style="position:absolute;left:-9999px" />` and omit it or send empty. |
| **Rate limiting** | Limit submissions per IP (and optionally per form) per time window to throttle automated floods. | Apply a rate limiter to `POST .../forms/submit` only (e.g. 10 requests per minute per IP). Use `express-rate-limit` or a shared rate-limit middleware. Return 429 when exceeded. |
| **Optional CAPTCHA** | Server-side verification of a challenge token (e.g. Cloudflare Turnstile, reCAPTCHA v3). When enabled, require a valid token before accepting the submission. | Body field `captcha_token` (or `cf-turnstile-response`). If env `TURNSTILE_SECRET_KEY` is set, verify token with Turnstile API; if invalid or missing, return 422. If env not set, skip verification so forms work without CAPTCHA. |

**Recommendation:** Enable honeypot and rate limiting by default. Add CAPTCHA for high-value or high-abuse forms (configurable per form or globally via env).

**Environment variables (implementation):**

- `FORM_SUBMIT_RATE_LIMIT_WINDOW_MS` – rate limit window in ms (default: 60000).
- `FORM_SUBMIT_RATE_LIMIT_MAX` – max submissions per IP per window (default: 10).
- `TURNSTILE_SECRET_KEY` – if set, form submit requires a valid Cloudflare Turnstile token in `captcha_token`; frontend must embed Turnstile widget and send the response token.

- **Authorization**: All dashboard endpoints require the user to have access to the site (owner or role with “manage forms” / “view submissions”).
- **Public submit**: No auth; validate `siteId` and that the form instance (or page+block) exists and is a valid form type. Rate limit per IP and per (site, form) to prevent abuse.
- **Data**: Store only what the form sends in `payload`. Avoid logging sensitive fields in plain text in application logs; consider masking in logs if needed for GDPR.
- **Retention**: Optional policy to auto-archive or delete submissions older than X months (configurable per site or globally).

---

## 7. Implementation Phases

### Phase 1 – Persist and list

1. **DB**: Add migrations for `form_instances`, `form_submissions`, and (if needed) `form_responses`.
2. **API**: Implement `POST /api/sites/:siteId/forms/submit` (with resolution by `form_instance_id` or `page_slug` + `block_id`). Implement form instance upsert on submit or on page save.
3. **API**: Implement `GET /api/sites/:siteId/forms` and `GET /api/sites/:siteId/forms/:formInstanceId/submissions` (with pagination).
4. **App**: In block renderer or page data, pass `siteId`, `pageSlug`, `blockId` (and when available `formInstanceId`) to form blocks. Update contactform (and optionally form block) to POST to the new submit endpoint when these are present.

### Phase 2 – Dashboard and responses

5. **API**: Implement `GET/PATCH` submission by id and `POST .../responses`; ensure auth and site scoping.
6. **Dashboard**: Add “Forms” or “Form submissions” to the site dashboard; list form instances and link to per-form submission lists and submission detail with response UI.

### Phase 3 – Optional enhancements

7. **Page save**: On page update, scan content and upsert/soft-delete form_instances so the dashboard list stays in sync.
8. **Notifications**: Optional email to site owner or configured address on new submission.
9. **Export**: CSV/JSON export of submissions per form.
10. **Spam**: Optional CAPTCHA or honeypot and a “spam” status for submissions.

---

## 8. File and Module Layout (Backend)

Suggested structure under `smartstore-api/src`:

```
src/
  modules/
    formSubmissions/
      controllers/
        form-instance.controller.js   # list forms for site
        form-submission.controller.js  # submit, list, get, patch, responses
      models/
        form-instance.model.js
        form-submission.model.js
        form-response.model.js
      routes/
        submit.routes.js    # public POST submit
        dashboard.routes.js # authenticated list/get/patch/responses
      services/
        form-instance.service.js  # upsert by site/page/block, list by site
        form-submission.service.js # create, list by form, get, update, add response
      README.md
  db/
    migrations/
      XXX_create_form_instances.sql
      XXX_create_form_submissions.sql
      XXX_create_form_responses.sql
```

Routes can be mounted under `/api/sites/:siteId/forms` (public submit and dashboard) with dashboard routes protected by auth middleware that verifies site access.

---

## 9. Summary

| Item | Description |
|------|-------------|
| **Form instance** | One row per form block (site + page + block_id); optional display name and config snapshot. |
| **Form submission** | One row per submit; payload (JSONB), status, optional IP/UA and source_url. |
| **Form response** | Optional notes/replies attached to a submission. |
| **Public API** | `POST /api/sites/:siteId/forms/submit` with `form_instance_id` or `page_slug` + `block_id` + `payload`. |
| **Dashboard API** | List forms, list submissions per form, get/patch submission, add response. |
| **Dashboard UI** | Section per form instance to manage submissions and respond. |
| **When form is added to block** | Form instance is stored (on page save or first submit), which drives the dashboard section for that form. |

This design keeps the backend form-agnostic (any form type), persists all submissions, allows fetching per form, and ties dashboard management and responses to form instances that are created when a form block is present on a page.
