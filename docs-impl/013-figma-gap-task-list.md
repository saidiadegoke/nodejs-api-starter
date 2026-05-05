---
name: Figma gap closure task list
description: TDD-ordered task breakdown to close the gaps identified in 011-figma-vs-api-gap-analysis.md, organized by initiative and priority.
type: project
---

# Figma gap closure task list (TDD)

This breaks the gaps from `011-figma-vs-api-gap-analysis.md` into bite-sized,
TDD-shaped tasks. Each task is **red → green → refactor** unless it is a
pure schema or doc change.

The order follows the priority list at the bottom of `011`:

1. NIN-pending flow (covered by `012-nin-pending-task-list.md` — already in flight).
2. Composite read endpoints.
3. Soft-skip biometric + replace flow.
4. Sittings + result-types intake fields.
5. Candidate list joins, search, KPIs.
6. Export + batch actions.
7. Attendance + class sessions (separate initiative).
8. PDF-of-registration-form generator.
9. Cross-cutting cleanups.

Conventions:
- New utility-style code → `*.utils.test.js`.
- HTTP routes → `*.api.test.js` with the migration-probe `beforeAll` skip
  pattern.
- Each task lists the **screens it unblocks** so we can demo to product
  per increment.

---

## Initiative A — Composite read endpoints

Unblocks: figma §3 (Student Information validated), §11 (Final review),
§14 (NIN Details after verify), §17 (Profile).

### A.1 — Extend NIN response payload schema

- [ ] Red: extend `src/tests/jupeb.identity.utils.test.js` with assertions
      that the mock adapter's `verified` outcome carries `address`,
      `state_of_origin`, `lga`, `place_of_birth`, `phone`, `next_of_kin`,
      and `photo_url` keys.
- [ ] Green: extend `nin-adapter.service.js#mockOutcome` to populate those
      fields.
- [ ] Refactor: extract `MOCK_PROFILE` constant.

Files: `src/modules/jupeb/services/nin-adapter.service.js`,
`src/tests/jupeb.identity.utils.test.js`.

### A.2 — `GET /registration/me/profile`

- [ ] Red: new test `src/tests/jupeb.registration.profile.api.test.js`:
  - Unauth → 401.
  - Authenticated student with a claimed registration → 200 with
    `{ candidate, basic_information, contact_information, next_of_kin,
       subject_combination, photo_url }` joined from users + profiles +
    nin verification + jupeb_registrations + jupeb_subject_combinations.
  - When NIN verification is `pending`, NIN-derived fields are still
    surfaced from the cached `intake_payload`.
- [ ] Green: implement `RegistrationService.getMeProfile` and route
      `GET /registration/me/profile`.
- [ ] Refactor: pull join logic into `RegistrationModel.findFullProfileForUser`.

Files: `src/modules/jupeb/services/registration.service.js`,
`src/modules/jupeb/controllers/registration.controller.js`,
`src/modules/jupeb/routes/registration.routes.js`,
`src/modules/jupeb/models/registration.model.js`,
`src/tests/jupeb.registration.profile.api.test.js`.

### A.3 — `GET /registration/me/submission-preview`

- [ ] Red: new test asserts the response carries identity card,
      basic_information, contact_information, next_of_kin,
      academic_details (per-result subject/grade rows),
      biometric_status, document urls.
- [ ] Green: composite read joining registration + documents + biometrics
      + result entries (introduced in B/D below) + signed file URLs.
- [ ] Refactor: split into composer functions per section.

Files: as above + `src/tests/jupeb.registration.submission-preview.api.test.js`.

### A.4 — Embed display names on FK fields (cross-cutting)

- [ ] Red: extend existing `*.api.test.js` for `me/current` and
      `institution/registrations` to assert each row includes
      `subject_combination: { id, code, title }`,
      `university: { id, name }`, `session: { id, academic_year }`.
- [ ] Green: change `_publicRegistrationSummary` and `serializeRegistration`
      to load and embed these.
- [ ] Refactor: consider a cached lookup in the model.

Files: `src/modules/jupeb/services/registration.service.js`.

### A.5 — Signed photo URL helper

- [ ] Red: new test on `IdentityService.getRegistrationPhotoUrl` returning
      `{ url, expires_at }` for the latest `face` capture.
- [ ] Green: implement, lean on `files` module's signing utility.
- [ ] Wire route `GET /identity/registrations/:id/photo`.

Files: `src/modules/jupeb/services/identity.service.js`,
`src/modules/jupeb/routes/identity.routes.js`,
`src/tests/jupeb.identity.api.test.js`.

---

## Initiative B — Soft-skip biometric + replace flow

Unblocks: figma §7 (biometric capture), §8 (Skip dialog), §9 (face
quality).

### B.1 — Schema: `fingerprint_skipped_at`, `face_skipped_at`

- [ ] Red: schema test asserts both columns exist on `jupeb_registrations`.
- [ ] Green: migration `011_jupeb_biometric_skip.sql` adds them.

Files: `src/db/migrations/011_jupeb_biometric_skip.sql`,
`src/tests/jupeb.identity.biometric-skip.schema.test.js`.

### B.2 — `POST /identity/registrations/:id/biometrics/skip`

- [ ] Red: API tests:
  - Body `{ capture_type: 'fingerprint' }` sets
    `fingerprint_skipped_at` and locks self-service capture for that type.
  - Subsequent `POST /identity/biometrics` with the same type from a
    student → 403 `self_service_locked`.
  - Institution role can still post on behalf.
- [ ] Green: `IdentityService.skipBiometric` + controller + route + RBAC
      gate in `createBiometric`.
- [ ] Refactor: extract `assertNotSelfSkipped(registration, captureType)`.

Files: `src/modules/jupeb/services/identity.service.js`,
`src/modules/jupeb/controllers/identity.controller.js`,
`src/modules/jupeb/routes/identity.routes.js`,
`src/modules/jupeb/models/registration.model.js`,
`src/tests/jupeb.identity.biometric-skip.api.test.js`.

### B.3 — `PUT /identity/biometrics/:captureId` replace-in-place

- [ ] Red: API test:
  - Replaces an existing capture without the `(registration_id, capture_type)`
    unique-index conflict.
  - Soft-archives the old row OR overwrites in place — pick one and assert.
- [ ] Green: implement chosen strategy. Recommended: soft-archive via a
      new `replaced_at` column and exclude archived rows from the unique
      index.

Files: as above + a small migration for `replaced_at`.

### B.4 — Server-side quality threshold

- [ ] Red: when `JUPEB_FACE_MIN_QUALITY=0.6`, posting a face capture with
      `quality_score=0.4` returns `422 quality_too_low`.
- [ ] Green: validation in `createBiometric`.

---

## Initiative C — Sittings + result-types intake

Unblocks: figma §5 (Document Upload — sittings), §6 (full doc form).

### C.1 — Schema: `sittings_count`, `result_types`, `university_type`

- [ ] Red: schema tests for new columns.
- [ ] Green: migration `012_jupeb_intake_extensions.sql`:
  - `jupeb_registrations.sittings_count INTEGER NOT NULL DEFAULT 1
     CHECK (sittings_count IN (1,2))`.
  - `jupeb_registrations.result_types JSONB NOT NULL DEFAULT '[]'::jsonb`.
  - `jupeb_universities.university_type VARCHAR(20) NULL CHECK (university_type
     IN ('federal','state','private'))` — only if absent today.
- [ ] Refactor: backfill defaults for existing rows.

### C.2 — `PATCH /registration/me/academic-intake`

- [ ] Red: API test sets `{ sittings_count: 2, result_types: ['waec','neco'] }`
      and reads them back via `me/current`.
- [ ] Green: service method + route.

### C.3 — Catalog filter by university type

- [ ] Red: `GET /jupeb/catalog/universities?type=federal` returns only
      federal universities.
- [ ] Green: extend `CatalogService.listUniversities` to accept `type`.

### C.4 — Seed canonical document requirements

- [ ] Red: integration test `GET /submission/me/requirements` returns
      both a `waec` and `neco` requirement after a fresh DB.
- [ ] Green: seed file `src/db/seeds/jupeb_document_requirements.seed.sql`
      with keys `waec`, `neco`, `signed_registration_form` and reasonable
      defaults; wire into `seed.js` runner.

Files: `src/db/seeds/...`, `src/db/seed.js`.

---

## Initiative D — Result entries (manual + future OCR)

Unblocks: figma §11 (parsed subject/grade rows on submission preview).

### D.1 — Schema `jupeb_result_entries`

- [ ] Red: schema test.
- [ ] Green: migration `013_jupeb_result_entries.sql`:

```sql
CREATE TABLE jupeb_result_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES jupeb_registrations(id) ON DELETE CASCADE,
  source VARCHAR(10) NOT NULL CHECK (source IN ('waec','neco')),
  sitting INT NOT NULL CHECK (sitting IN (1,2)),
  serial INT NOT NULL,
  subject TEXT NOT NULL,
  grade TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (registration_id, source, sitting, serial)
);
```

### D.2 — `POST /submission/me/result-entries` bulk upsert

- [ ] Red: API test posts an array; subsequent GET returns the rows.
- [ ] Green: model + service + route.
- [ ] Edge case: replacing previously-uploaded rows for the same
      `(source, sitting)` pair.

### D.3 — Embed result entries on submission preview (A.3)

- [ ] Red: extend submission-preview test to assert the parsed rows are
      included.
- [ ] Green: join in the composite read.

---

## Initiative E — Candidate management (institution portal)

Unblocks: figma §15 (Candidate Management dashboard).

### E.1 — List join with candidate identity

- [ ] Red: API test for `GET /institution/registrations` asserts each row
      includes `candidate: { id, name, email, candidate_id }` and
      `biometric_status: 'yes'|'no'|'partial'`.
- [ ] Green: change the model to join `users`, `profiles`, and a
      sub-query on `jupeb_biometric_captures`. Watch row counts; consider
      a view for performance.
- [ ] Refactor: cap query cost — add an index if needed.

### E.2 — Search by `q`

- [ ] Red: API test for `?q=natali` returns candidates whose name OR
      email OR candidate_id ILIKE `%natali%`.
- [ ] Green: param + parameterised SQL with `LOWER(...) LIKE LOWER($n)`.

### E.3 — `bucket=approved|pending|rejected`

- [ ] Red: API test maps `bucket=pending` to the union of pending
      statuses (`pending_documents`, `pending_institution_review`,
      `pending_student_confirm`, `claimed`, `code_issued`).
- [ ] Green: server-side mapping (do **not** expose the union to the
      client query string).

### E.4 — Stats endpoint `GET /jupeb/overview/registrations/stats`

- [ ] Red: API test:
  - Returns `{ total, approved, pending, rejected, with_biometrics }`
    scoped to `university_id` / `session_id`.
  - Returns `delta_pct_vs_previous_period` based on `previous_period`
    query param.
- [ ] Green: SQL `count(*) FILTER (WHERE status = ...)` patterns.

### E.5 — Bar chart endpoint `GET /jupeb/overview/registrations/by-university`

- [ ] Red: API test returns `[{ university_id, university_name,
      registered_count }]` ordered desc, capped by `?limit=12`.
- [ ] Green: aggregation query.

### E.6 — Export `GET /institution/registrations/export?format=csv`

- [ ] Red: API test:
  - Returns `Content-Type: text/csv`.
  - Honors the same filters as the list endpoint.
  - Streams (does not buffer) rows.
- [ ] Green: simple CSV writer (no third-party dep unless one is already
      in `package.json`).

### E.7 — Batch `POST /institution/registrations/batch`

- [ ] Red: API test:
  - `{ ids: [...], action: 'approve' }` approves each, respecting NIN
    gate per-row; returns `{ accepted: [...], rejected: [...] }`.
  - `{ action: 'reject', reason: '...' }` rejects each.
- [ ] Green: loop over rows, reuse the per-row guards.

### E.8 — Per-row withdraw `POST /institution/registrations/:id/withdraw`

- [ ] Red: API test transitions row to `withdrawn`, with `reason`.
- [ ] Green: reuses `transitionStatus`.

---

## Initiative F — Code shape, claim flow, sign-up

Unblocks: figma §1 (Login → Get Started), §2 (6-cell code).

### F.1 — Shorten institution code to 6 chars

- [ ] Red: API test asserts `institution_issued_code.length === 6` (or
      a configurable constant) and remains unique.
- [ ] Green: change `generateUniqueInstitutionCode` to base32-style 6
      chars; bump collision retry.
- [ ] Migration consideration: existing codes may be longer — leave
      historical data alone, only new codes follow the new format.

### F.2 — Pre-validate code without claiming

- [ ] Red: API test for `GET /registration/me/code-status?code=...` returns
      `{ valid, expires_at, university_name }`. Expired returns
      `{ valid: false, error_code: 'code_expired', expires_at }`.
- [ ] Green: read-only lookup, no mutation.

### F.3 — Structured 410 body on expired claim

- [ ] Red: claim-code 410 response includes `error_code: 'code_expired'`
      and `expires_at`.
- [ ] Green: change controller to forward structured fields.

### F.4 — `POST /auth/register-with-code` single-shot signup

- [ ] Red: API test creates a new user AND binds the code in one call.
      Idempotent on duplicate email collisions.
- [ ] Green: service method composing `auth.register` + `claim-code`
      inside a transaction.

---

## Initiative G — Bio Data Update + immutable NIN fields

Unblocks: figma §4 (Bio Data Update).

### G.1 — Whitelist editable fields

- [ ] Red: `PUT /users/me` from a JUPEB student is rejected with
      `422 nin_field_immutable` if any of `name`, `date_of_birth`, or
      `gender` differ from the linked NIN verification's response payload.
- [ ] Green: extend the `users` controller (or a JUPEB-aware
      middleware) to compare and reject.

Files: `src/modules/users/...` plus a small adapter consulting the
linked verification.

---

## Initiative H — Profile + downloadable registration form

Unblocks: figma §17 (Profile).

### H.1 — Generate registration form PDF

- [ ] Red: API test for `GET /registration/me/registration-form.pdf`:
  - Streams `application/pdf`.
  - Returns 422 if registration is not yet `pending_institution_review`
    or later (no point exporting an empty form).
- [ ] Green: use a small PDF lib already in deps if any (or `pdfkit` if
      adding is acceptable). Render: identity, basic info, contact, NoK,
      academic details, biometric status, signature block.
- [ ] Refactor: store generated PDF to `files` once, return signed URL on
      subsequent requests.

### H.2 — Profile composite read

- [ ] Covered by A.2 if we extend the profile composite to include
      `documents: [{ name, uploaded_at, download_url }]` and
      `biometric_status` boolean.

---

## Initiative I — Notifications

Unblocks: figma §16 notification bell (and is also a follow-on for
several initiatives).

### I.1 — `GET /notifications/me/unread-count`

- [ ] Red: API test returns `{ count: N }`.
- [ ] Green: small endpoint over `NotificationModel.getUnreadCount`.

---

## Initiative J — Attendance + class sessions (large, parked)

Unblocks: figma §16 (Home / Dashboard).

This is its own subsystem — track separately. Skeleton tasks to seed
the next milestone:

- [ ] J.1 — Schema `jupeb_class_sessions (id, course_id, university_id,
      starts_at, ends_at, status)`.
- [ ] J.2 — Schema `jupeb_attendance_marks (id, class_session_id, user_id,
      marked_at, status)`.
- [ ] J.3 — `POST /attendance/me/mark` self-mark with anti-replay window.
- [ ] J.4 — `GET /attendance/me/summary` weekly + cumulative.
- [ ] J.5 — `GET /jupeb/academic/me/today-classes` ordered by `starts_at`.
- [ ] J.6 — `GET /jupeb/academic/me/score` resolved via
      `findLatestForUser` then existing per-registration score endpoint.

---

## Initiative K — Cross-cutting hygiene

### K.1 — Composite read style guide

- [ ] Document under `docs-impl/conventions.md` (new) the shape of
      `_display` sub-objects so all FKs render the same way.

### K.2 — Test cleanup helper for JUPEB tables

- [ ] `cleanup-helper.js` truncates `jupeb_*` tables (in dependency
      order) before suites that need a clean slate. Surfaces as a
      helper called in `beforeAll` of integration suites.

### K.3 — Lint + suite-wide green run

- [ ] Confirm `npm run lint` clean.
- [ ] Confirm `npm test` green end-to-end (after K.2 is in).

---

## Suggested milestones

- **Milestone 1 — Wizard unblocked**: A.1, A.2, A.3, A.4, A.5, C.1, C.2,
  C.4, F.1, F.2, F.3.
- **Milestone 2 — Submission richness**: B.1, B.2, B.3, B.4, D.1, D.2,
  D.3, G.1, H.1.
- **Milestone 3 — Institution portal**: E.1, E.2, E.3, E.4, E.5, E.6,
  E.7, E.8.
- **Milestone 4 — Onboarding polish**: F.4, I.1, K.1, K.2, K.3.
- **Milestone 5 — Attendance subsystem**: Initiative J.

Skip nothing without product sign-off — every task here maps to a
specific figma element in `011-figma-vs-api-gap-analysis.md`.
