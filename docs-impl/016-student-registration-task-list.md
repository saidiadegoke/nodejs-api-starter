---
name: Student registration end-to-end task list
description: TDD-ordered tasks to close remaining gaps so the figma end-to-end student registration flow runs without manual workarounds. Pairs with 016-student-registration-end-to-end.md.
type: project
---

# Student registration — end-to-end task list (TDD)

Closes the gaps named in `016-student-registration-end-to-end.md`.
Each task is `red → green → refactor`. Cross-references
`013-figma-gap-task-list.md` task IDs where the same item already had
an entry there (so we don't double-count).

## Conventions

- New columns / tables in their own additive migration (`IF NOT EXISTS`).
- Schema tests use the `information_schema` probe pattern.
- API tests assert on `res.body`, never on raw `SELECT`s.
- `npm run test:reg` is added (sibling to `test:jupeb`, `test:ocr`).
- OCR-coupled tests use the `mock` provider (`NODE_ENV=test` only).
- All endpoints: `requireAuth` + role gate; tests cover RBAC negatives.

## Milestones

- **M-1 — Schema + signup**: M.1, M.2, M.3, M.4, M.5, M.9
- **M-2 — OCR auto-flow**: M.6, M.7, M.8
- **M-3 — Profile downloads + polish**: M.10, M.11
- **M-4 — Registrar polish + 013 leftovers**: M.12, M.13, plus 013
  §E.\*, §F.1, §G.1, §B.3, §B.4

Ship M-1 → M-2 → M-3 → M-4.

---

## Initiative M — End-to-end gaps

### M.1 — Next-of-kin: schema + endpoints

Unblocks: figma `log in 12`, `log in 18`, `Profile` (Step 4).

- [ ] Red: schema test asserts `jupeb_next_of_kin` exists with
      `id, registration_id (FK), name, relationship, phone, email,
      address, source ('nin'|'student'), created_at, updated_at,
      deleted_at`.
- [ ] Green: migration `004_jupeb_next_of_kin.sql`. Unique partial index
      on `registration_id WHERE deleted_at IS NULL` (one active NoK per
      registration; track history via soft-delete).
- [ ] Red: API test for:
  - `GET /registration/me/next-of-kin` — 200 returns active row, 404
    when none.
  - `POST /registration/me/next-of-kin` — 201 creates; 409 if active
    exists (require `PUT` to change).
  - `PUT /registration/me/next-of-kin` — soft-deletes prior + inserts
    new with `source='student'`. Reason captured in history.
  - RBAC: students operate only on their own registration.
- [ ] Green: model + service + controller + routes.
- [ ] Refactor: extract a `softReplaceLatest` helper if reusable.

Files: `src/db/migrations/004_jupeb_next_of_kin.sql`,
`src/modules/jupeb/models/next-of-kin.model.js`,
`src/modules/jupeb/services/next-of-kin.service.js`,
`src/modules/jupeb/controllers/next-of-kin.controller.js`,
`src/modules/jupeb/routes/next-of-kin.routes.js`,
`src/tests/jupeb.next-of-kin.api.test.js`.

### M.2 — Editable address + phone on registration profile

Unblocks: figma `log in 13` (Step 3).

- [ ] Red: schema test for new columns on `profiles`:
  `residential_address TEXT`, `state_of_origin VARCHAR(80)`,
  `lga VARCHAR(80)`, `place_of_birth VARCHAR(120)`, plus
  `users.phone` (already exists; verify).
- [ ] Green: migration `005_profiles_address_extensions.sql`.
- [ ] Red: API test for `PATCH /registration/me/profile`:
  - Accepts `residential_address`, `state_of_origin`, `lga`,
    `place_of_birth`, `phone`.
  - Rejects updates to `name`, `date_of_birth`, `gender` if these
    differ from the linked NIN response (013 §G.1 absorbed here).
  - Returns the new composite shape from
    `GET /registration/me/profile`.
- [ ] Green: extend `RegistrationService.updateProfile` (new method) +
      controller + route.
- [ ] Refactor: factor an `assertNinImmutable(field, value, reg)` helper.

Files: `src/db/migrations/005_profiles_address_extensions.sql`,
`src/modules/jupeb/services/registration.service.js`,
`src/modules/jupeb/controllers/registration.controller.js`,
`src/modules/jupeb/routes/registration.routes.js`,
`src/tests/jupeb.registration.profile-edit.api.test.js`.

### M.3 — `POST /auth/register-with-code` single-shot signup

Unblocks: figma `log in 11` (Step 1) — new candidate path.

- [ ] Red: API test:
  - `POST /auth/register-with-code` with `{ code, password,
    confirm_password, email? }` creates a `users` row, claims the
    code, links registration → user. Returns access + refresh tokens.
  - Email defaults to the value carried on the registration's NIN
    intake; explicit body email overrides if provided.
  - Idempotent on duplicate email (returns 409 with structured
    `error_code: 'email_in_use'`).
  - Expired code → 410 `error_code: 'code_expired'`.
  - Already-claimed code → 409 `error_code: 'code_already_claimed'`.
  - Wraps the user-create + claim in a single DB transaction.
- [ ] Green: `AuthService.registerWithCode` composes the existing
      register flow + `RegistrationService.claimCode` against the same
      client connection.
- [ ] Refactor: thread an optional `client` parameter through claim-code
      so we don't duplicate the SQL.

Files: `src/modules/auth/services/auth.service.js`,
`src/modules/auth/controllers/auth.controller.js`,
`src/modules/auth/routes.js`,
`src/modules/jupeb/services/registration.service.js`,
`src/tests/auth.register-with-code.api.test.js`.

Maps to 013 §F.4.

### M.4 — Document source + sitting metadata

Unblocks: figma `log in 14` / `log in 15` (Step 5) ambiguity.

- [ ] Red: schema test for new columns on
      `jupeb_registration_documents`: `source VARCHAR(20)` (`waec`,
      `neco`, `nabteb`, `gce`, `other`), `sitting INTEGER` (1 or 2),
      both NOT NULL with defaults backfilled.
- [ ] Green: migration `006_registration_documents_meta.sql`.
- [ ] Red: API test for `POST /submission/me/documents`:
  - Body now includes `source` + `sitting`; required when the
    requirement is one of the result-result keys (`waec_result`,
    `neco_result`, …).
  - Two uploads with same `(registration_id, source, sitting)` →
    409, must replace via existing `PATCH /me/documents/:id`.
- [ ] Green: validation + model + service updates.

Files: `src/db/migrations/006_registration_documents_meta.sql`,
`src/modules/jupeb/services/submission.service.js`,
`src/modules/jupeb/controllers/submission.controller.js`,
`src/tests/jupeb.submission.source-sitting.api.test.js`.

### M.5 — Seed canonical document requirements

Unblocks: figma `log in 15` upload tiles.

- [ ] Red: integration test asserts a fresh DB returns at least
      `waec_result`, `neco_result`, `signed_registration_form`
      requirements via `GET /submission/me/requirements`.
- [ ] Green: `src/db/seeds/jupeb_document_requirements.seed.sql` (new)
      with rows:
  - `waec_result` — title "WAEC SSCE result", mandatory, max 5MB,
    `pdf,jpeg,png`
  - `neco_result` — title "NECO SSCE result", optional, max 5MB
  - `nabteb_result` — title "NABTEB result", optional
  - `gce_result` — title "GCE / A-Level result", optional
  - `signed_registration_form` — title "Signed registration form",
    mandatory at submit time
- [ ] Wire into `src/db/seed.js` runner.

Maps to 013 §C.4.

Files: `src/db/seeds/jupeb_document_requirements.seed.sql`,
`src/db/seed.js`,
`src/tests/jupeb.submission.requirements-seed.test.js`.

### M.6 — Submission → OCR auto-trigger

Unblocks: figma `log in 18` parsed grades; OCR module integration.

- [ ] Red: API test for `POST /submission/me/documents`:
  - When the requirement key is in `{waec_result, neco_result,
    nabteb_result, gce_result}` and the file mime is allowed, the
    response includes `ocr_job: { id, status: 'queued' }`.
  - An `ocr_jobs` row is created with `metadata.registration_id =
    req.user.registration.id`, `metadata.requirement_id`,
    `metadata.source`, `metadata.sitting`.
  - Other requirement keys (`signed_registration_form` etc.) do
    **not** trigger OCR.
  - `FEATURE_OCR_ENABLED=false` skips trigger gracefully.
- [ ] Green: `SubmissionService.attachMeDocument` calls
      `OcrService.createJob({ fileId, examType: 'auto', metadata })`
      after the row is inserted, in the same transaction or
      best-effort post-commit (see refactor).
- [ ] Refactor: dispatch via the existing in-process queue (added in
      `015-ocr-technical-design.md`); failures are logged, do **not**
      fail the upload.

Files: `src/modules/jupeb/services/submission.service.js`,
`src/modules/jupeb/controllers/submission.controller.js`,
`src/tests/jupeb.submission.ocr-trigger.api.test.js`.

Depends on M.4 (need `source` field to pass to OCR metadata).

### M.7 — `jupeb_result_entries` table

Unblocks: figma `log in 18` subject + grade table.

- [ ] Red: schema test for `jupeb_result_entries`:
  ```
  id UUID PK
  registration_id UUID NOT NULL FK
  source VARCHAR(20) NOT NULL  -- 'waec','neco','nabteb','gce'
  sitting INT NOT NULL CHECK (sitting IN (1,2))
  serial INT NOT NULL          -- order on the certificate
  subject TEXT NOT NULL
  grade VARCHAR(4) NOT NULL    -- A1, B2, ... F9, A..U
  grade_normalized CHAR(1) NULL  -- A..F (academic-scoring lookup)
  score INT NULL
  origin VARCHAR(10) NOT NULL  -- 'ocr','manual'
  ocr_job_id UUID NULL FK
  created_at, updated_at
  UNIQUE (registration_id, source, sitting, serial)
  ```
- [ ] Green: migration `007_jupeb_result_entries.sql`.

Maps to 013 §D.1.

Files: `src/db/migrations/007_jupeb_result_entries.sql`,
`src/tests/jupeb.result-entries.schema.test.js`.

### M.8 — OCR write-through to result entries

Unblocks: figma `log in 18` auto-fill.

- [ ] Red: integration test:
  - Upload a WAEC PDF (mock OCR provider returns the canned WAEC
    fixture from `015-ocr-technical-design.md`).
  - Wait for `ocr.job.completed` event (or poll for status).
  - Assert `jupeb_result_entries` rows exist for that registration
    with `origin='ocr'`, `source='waec'`, `sitting=1` (default), the
    expected subjects / grades.
  - `GET /registration/me/submission-preview` returns those rows
    grouped by source.
- [ ] Green: in OCR worker (`ocr.worker.js`), after
      `OcrResultModel.create(...)`, if `metadata.registration_id` is
      set and `exam_type_detected` is in the supported set, upsert
      `jupeb_result_entries` rows.
- [ ] Red: manual entry path — `POST /submission/me/result-entries`
      bulk upsert (013 §D.2). Manual entries have `origin='manual'`
      and **win** over OCR rows on conflict (same key) by overwriting.
- [ ] Green: model + service + endpoint.
- [ ] Refactor: extract `mapOcrSubjectsToEntries(ocrResult, meta)`.

Files: `src/modules/ocr/services/ocr.worker.js`,
`src/modules/jupeb/services/result-entries.service.js`,
`src/modules/jupeb/controllers/result-entries.controller.js`,
`src/modules/jupeb/routes/submission.routes.js`,
`src/modules/jupeb/models/result-entries.model.js`,
`src/tests/ocr.submission.integration.test.js`,
`src/tests/jupeb.result-entries.api.test.js`.

Depends on M.6, M.7.

### M.9 — Public `GET /auth/code-status` (no auth)

Unblocks: figma `log in 11` (Step 1) — pre-validate before signup.

- [ ] Red: API test:
  - `GET /auth/code-status?code=ABC123` returns
    `{ valid, expires_at, university: { name, short_name } }` for a
    valid code, no auth required.
  - Expired → `{ valid: false, error_code: 'code_expired',
    expires_at }`.
  - Unknown → `{ valid: false, error_code: 'code_not_found' }`.
  - Already claimed → `{ valid: false, error_code:
    'code_already_claimed' }`.
  - **Does not** leak candidate identity (name, email, NIN).
- [ ] Green: thin wrapper around the existing
      `RegistrationService.codeStatus`, exposed under `/auth` so it
      doesn't require the JUPEB student middleware.

Maps to 013 §F.2 (existing private route stays for the in-portal
"continue later" path).

Files: `src/modules/auth/controllers/auth.controller.js`,
`src/modules/auth/routes.js`,
`src/tests/auth.code-status.api.test.js`.

### M.10 — Registration form PDF

Unblocks: figma `Profile` "Download Registration Form".

- [ ] Add `pdfkit` (or reuse if already in `package.json`) — confirm
      first.
- [ ] Red: API test for
      `GET /registration/me/registration-form.pdf`:
  - 200 streams `application/pdf`.
  - 422 `not_ready` if status is earlier than
    `pending_institution_review`.
  - PDF body bytes start with `%PDF`.
  - Content includes candidate code, full name, university, subject
    combination, sittings + result grades, biometric status.
- [ ] Green: `RegistrationFormPdfService.render(registration)` →
      `Buffer`. Cache to `files` (context `registration_forms`) and
      reuse the cached file on second request unless registration
      `updated_at` is newer.
- [ ] Refactor: split renderer into header / sections / footer.

Maps to 013 §H.1.

Files: `src/modules/jupeb/services/registration-form-pdf.service.js`,
`src/modules/jupeb/controllers/registration.controller.js`,
`src/modules/jupeb/routes/registration.routes.js`,
`src/tests/jupeb.registration.pdf.api.test.js`.

### M.11 — Per-document signed download for the candidate

Unblocks: figma `Profile` per-result download icons.

- [ ] Red: API test:
  - `GET /registration/me/documents/:registrationDocumentId/download-url`
    → 200 `{ url, expires_at }` for the owner; 403 otherwise.
  - URL is a 5-minute signed S3 URL (mocked in tests).
- [ ] Green: small endpoint over `FileService.getSignedUrl` scoped via
      the `jupeb_registration_documents.registration_id`.

Files: `src/modules/jupeb/services/submission.service.js`,
`src/modules/jupeb/routes/submission.routes.js`,
`src/tests/jupeb.submission.download-url.api.test.js`.

### M.12 — NIN verify writes through to NoK + address tables

Polish: students see fewer empty fields.

- [ ] Red: when `POST /identity/nin/verify` succeeds and a registration
      is linked, NoK + address from `response_payload` are upserted
      into `jupeb_next_of_kin` (source `nin`) and into
      `profiles.residential_address` if profile is empty.
- [ ] Green: `IdentityService.verifyNin` post-commit hook.

Depends on M.1, M.2.

Files: `src/modules/jupeb/services/identity.service.js`,
`src/tests/jupeb.identity.write-through.api.test.js`.

### M.13 — Registrar OCR review & override

Polish: institutions can correct OCR mistakes.

- [ ] Red: API test for
      `GET /institution/registrations/:id/result-entries`:
  - Returns OCR-origin and manual rows together with `origin` and
    `confidence` (from joined OCR result).
- [ ] Red: API test for
      `PATCH /institution/registrations/:id/result-entries/:entryId`:
  - Allows registrar to overwrite `subject` / `grade`. Sets
    `origin='manual'` on the patched row.
- [ ] Green: model + service + controller wiring.

Depends on M.7, M.8.

Files: `src/modules/jupeb/controllers/result-entries.controller.js`,
`src/modules/jupeb/routes/institution.routes.js` (or wherever the
institution routes live),
`src/tests/jupeb.result-entries.review.api.test.js`.

---

## 013 leftovers to fold into M-4

These are still relevant but not on the critical path:

- **013 §B.3** — biometric replace-in-place (avoid delete-then-create).
- **013 §B.4** — server-side face quality threshold.
- **013 §E.1–E.8** — candidate list joins, search, KPIs, bar chart,
  bucket filter, export, batch actions, withdraw.
- **013 §F.1** — short 6-char institution codes.
- **013 §F.3** — structured 410 body on expired claim.
- **013 §G.1** — fold into M.2 (handled there).
- **013 §I.1** — `GET /notifications/me/unread-count`.
- **013 §K.1, K.2, K.3** — conventions doc + cleanup helper +
  green-suite confirmation.

---

## Test scaffolding

- Add `npm run test:reg` running:
  ```
  jest \
    src/tests/auth.register-with-code.api.test.js \
    src/tests/auth.code-status.api.test.js \
    src/tests/jupeb.next-of-kin.api.test.js \
    src/tests/jupeb.registration.profile-edit.api.test.js \
    src/tests/jupeb.submission.source-sitting.api.test.js \
    src/tests/jupeb.submission.requirements-seed.test.js \
    src/tests/jupeb.submission.ocr-trigger.api.test.js \
    src/tests/jupeb.result-entries.api.test.js \
    src/tests/jupeb.result-entries.review.api.test.js \
    src/tests/ocr.submission.integration.test.js \
    src/tests/jupeb.registration.pdf.api.test.js \
    src/tests/jupeb.submission.download-url.api.test.js \
    --runInBand
  ```
- Reuse `MockProvider.registerFixture(...)` for OCR-coupled tests so
  WAEC / NECO PDFs return deterministic text.

---

## Done definition

- [ ] All M.1–M.11 tasks closed.
- [ ] `npm run test:reg` green end-to-end.
- [ ] A manual run of the figma flow (login 10 → 11 → 12 → 13 → 14 → 15
      → confirm subjects → biometrics → 18 submit → Profile download)
      succeeds against the dev DB without manual data fixture writes.
