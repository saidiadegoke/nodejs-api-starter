---
name: Registrar portal (sessions / institutions / subjects / combinations) task list
description: TDD-ordered task breakdown to close the gaps from figma/session-inst-sub-comb against the existing API.
type: project
---

# Registrar portal task list (TDD)

Scope: the figma/session-inst-sub-comb folder — Session Management
dashboard, plus the create/edit modals for Institution, Subject,
Subject Combination, and Session.

## Source figma assets

- `session.jpg` — Session Management dashboard (KPIs + cutoff
  columns + table).
- `modal.jpg` / `modal (1).jpg` — Create / Edit Institution.
- `modal (2).jpg` / `modal (3).jpg` — Create / Edit Subject (standalone).
- `modal (4).jpg` — Create New Subject Combination.
- `modal (5).jpg` / `modal (6).jpg` — Create / View Session.

## Conventions

- TDD red → green → refactor for every code task.
- New columns in their own migration (additive, IF NOT EXISTS).
- Schema tests use the `information_schema` probe pattern (see
  `jupeb.identity.nin-pending.schema.test.js`).
- API tests assert on `res.body`, never on raw SELECTs.
- Direct `pool.query` in tests only as fixture for state no API can
  produce.

---

## Initiative L — Subjects as a first-class catalog

Unblocks: figma `modal (2).jpg`, `modal (3).jpg`, and indirectly
`modal (4).jpg`'s dropdowns.

This is the **structural gap**. Today `jupeb_subject_combinations.subjects`
is a JSONB string array. Figma wants subjects to be CRUDable resources
referenced by combinations.

### L.1 — Schema: `jupeb_subjects` table

- [ ] Red: schema test asserts `jupeb_subjects` exists with `id`,
      `code`, `name`, `description`, `status`, timestamps + soft-delete.
- [ ] Green: migration `013_jupeb_subjects.sql`:

```sql
CREATE TABLE IF NOT EXISTS jupeb_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT jupeb_subjects_status_check CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_subjects_code_lower
  ON jupeb_subjects (LOWER(code))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jupeb_subjects_status
  ON jupeb_subjects (status)
  WHERE deleted_at IS NULL;
```

### L.2 — Subject CRUD endpoints

- [ ] Red: API tests for:
  - `GET /catalog/subjects` (admin list, paginated).
  - `GET /catalog/subjects/public` (active only).
  - `POST /catalog/subjects` (admin create, dedup on `LOWER(code)`).
  - `GET /catalog/subjects/:id`.
  - `PATCH /catalog/subjects/:id`.
  - `POST /catalog/subjects/:id/activate` and `/deactivate`.
- [ ] Green: model + service + controller + routes following the
      existing `jupeb_universities` pattern.
- [ ] Refactor: factor common admin-list pagination util shared with
      universities.

### L.3 — Bulk upload endpoint

- [ ] Red: `POST /catalog/subjects/bulk` accepts CSV (multipart) and
      returns per-row outcome `[{ row, ok, error_code? }]`.
- [ ] Green: implement using existing `files`/`assets` ingest if a CSV
      parser is already in the deps; else add a minimal parser.

### L.4 — Migrate combinations to reference subjects

This is the trickier piece — pick one of two strategies:

**Option A (simpler):** keep `jupeb_subject_combinations.subjects` as
a JSONB string array but require each entry to match an existing
subject's `code`. Validate at create/patch time.

**Option B (cleaner):** introduce a join table
`jupeb_subject_combination_items (combination_id, subject_id, position)`
and migrate existing rows. Drop the JSONB column once dual-write proves
out.

- [ ] Red (Option A): API test creating a combination with a
      non-existent subject code returns 422.
- [ ] Red (Option B): schema test for the join table; combo create
      with subject UUIDs persists rows.
- [ ] Green: pick + implement.

Recommendation: **Option A first** for speed; revisit Option B after
the registrar portal ships.

---

## Initiative M — Subject Combination UX (auto title/code)

Unblocks: figma `modal (4).jpg`. The figma form shows only Subject 1,
2, 3 dropdowns — no `code` or `title` input — but the API requires
both today.

### M.1 — Auto-generate code/title when omitted

- [ ] Red: `POST /catalog/subject-combinations` with only
      `{ subjects: ['MTH','PHY','CHE'] }` returns 201 with
      auto-generated `code` (e.g. `MTH-PHY-CHE`) and `title`
      (e.g. `Mathematics, Physics, Chemistry`).
- [ ] Green: in `CatalogService.createSubjectCombination`, if `code`
      missing, build from sorted subject codes; if `title` missing,
      build from sorted subject names.
- [ ] Edge case: collision on auto-generated code → append a numeric
      suffix and retry.
- [ ] Refactor: extract `deriveCombinationDefaults(subjects)` for
      direct unit testing.

### M.2 — Bulk upload combinations

- [ ] Red: `POST /catalog/subject-combinations/bulk` with CSV.
- [ ] Green: parse and reuse single-create path.

---

## Initiative N — Institution contact fields

Unblocks: figma `modal.jpg`, `modal (1).jpg`.

### N.1 — Schema: institution contact + capacity columns

- [ ] Red: schema test asserts new columns on `jupeb_universities`:
  - `email VARCHAR(255) NULL`
  - `address TEXT NULL`
  - `phone VARCHAR(40) NULL`
  - `expected_candidate_count INTEGER NULL CHECK (expected_candidate_count >= 0)`
  - `description TEXT NULL`
- [ ] Green: migration `014_jupeb_institution_contact.sql`.
- [ ] Refactor: add an email-format check constraint or trust
      validation at the service layer (lean toward service for
      flexibility).

### N.2 — Pass new fields through service + controller

- [ ] Red: API test for `POST /catalog/universities` returns and
      persists the new fields; `PATCH` updates them.
- [ ] Green: extend `UniversityModel.create` and `updateById`'s
      whitelist; extend `CatalogService.createUniversity` and
      `patchUniversity`.

### N.3 — Validation

- [ ] Red: invalid email format → 422; negative
      `expected_candidate_count` → 422.
- [ ] Green: lightweight validation in service.

### N.4 — Bulk upload institutions

- [ ] Red: `POST /catalog/universities/bulk` CSV ingest.
- [ ] Green: implement; reuse single-create validation per row.

---

## Initiative O — Session fees + cutoff columns

Unblocks: figma `modal (5).jpg`, `modal (6).jpg`, and the cutoff
columns in `session.jpg` table.

### O.1 — Schema: cutoff and fee columns

- [ ] Red: schema test for new columns on
      `jupeb_registration_sessions`:
  - `candidate_info_cutoff_at TIMESTAMP NULL`
  - `profile_update_cutoff_at TIMESTAMP NULL`
  - `ca_cutoff_at TIMESTAMP NULL`
  - `max_ca_score INTEGER NULL`
  - `affiliation_fee_existing NUMERIC(12,2) NULL`
  - `affiliation_fee_new NUMERIC(12,2) NULL`
  - `exam_fee_per_candidate NUMERIC(12,2) NULL`
  - `description TEXT NULL` *(or alias `notes`)*
- [ ] Green: migration `015_jupeb_session_cutoffs_fees.sql`.

### O.2 — Service + controller pass-through

- [ ] Red: `POST /sessions` accepts the new fields; `GET /sessions/:id`
      returns them; `PATCH /sessions/:id` updates them.
- [ ] Green: extend `SessionModel.create`, `update`, and the whitelist
      in service.

### O.3 — Field-level validation

- [ ] Red: cutoff dates must satisfy
      `opens_at < registration_end <= candidate_info_cutoff_at <=
      profile_update_cutoff_at <= ca_cutoff_at`. Out-of-order returns
      422 with the offending pair named.
- [ ] Green: validation in service; document the order in swagger.

### O.4 — Backfill default for `description` ↔ existing `notes`

- [ ] Red: API still accepts `notes` on input/output (no breaking
      change for existing callers).
- [ ] Green: alias `description` ↔ `notes` in the controller layer
      until consumers migrate.

---

## Initiative P — Session dashboard KPIs

Unblocks: the 5 KPI cards on `session.jpg`.

### P.1 — Extend `GET /sessions/:id/stats`

Today returns `{ total_registrations, registrations_by_status }`.
Extend to:

- [ ] Red: response also includes:
  - `institutions_count` (active universities for this session — i.e.
    distinct `university_id` referenced by registrations).
  - `subject_combinations_count` (distinct `subject_combination_id`).
  - `candidates_with_biometrics` (count of registrations with at least
    one active biometric capture).
  - `candidates_without_biometrics` (the complement).
- [ ] Green: SQL with `COUNT DISTINCT ... FILTER` clauses; lean on
      indices already present.

### P.2 — Period-over-period delta

- [ ] Red: `GET /sessions/:id/stats?previous_period=...` returns
      `{ value, delta_pct, delta_direction: 'up'|'down'|'flat' }`
      shapes for each KPI.
- [ ] Green: compute by subtracting against prior period stats.
- [ ] Refactor: extract `computeDeltaPct(current, previous)` for
      pure-function unit tests.

### P.3 — Top institutions by registrations (for overview chart)

The `Candidates.jpg` figma has a top-12 institutions chart. We've
already noted this gap in 011 §15; tracking here too.

- [ ] Red: `GET /jupeb/overview/registrations/by-university?session_id&limit=12`.
- [ ] Green: aggregation query.

---

## Initiative Q — Session export

Unblocks: figma `session.jpg` Export button.

### Q.1 — `GET /sessions/export`

- [ ] Red: returns `Content-Type: text/csv` with a row per session
      including the new cutoff/fee columns.
- [ ] Green: small CSV streamer.

---

## Initiative R — Bulk upload framework (cross-cutting)

Initiatives L.3, M.2, N.4 each need a bulk endpoint. Share one
implementation.

### R.1 — Common bulk-upload util

- [ ] Pure-function tests for: header parsing, per-row validation
      orchestration, per-row outcome aggregation `{ row, ok,
      error_code, error_message }`.
- [ ] Implementation: `src/modules/jupeb/utils/bulk-upload.js`.
- [ ] Plug into each module's bulk route as the single ingest path.

---

## Suggested execution order

1. **L** (subjects catalog) — biggest structural change, blocks several
   modal flows.
2. **M** (combination UX) — small, builds on L.
3. **N** (institution contact fields) — independent, additive.
4. **O** (session fees + cutoffs) — independent, additive.
5. **P** (session dashboard KPIs) — depends on existing stats endpoint;
   benefits from O for context but doesn't require it.
6. **Q** (session export) — fast.
7. **R** (bulk upload util) — implement before L.3, M.2, N.4 to avoid
   three parallel implementations.

---

## What's NOT in this doc

- Anything outside `figma/session-inst-sub-comb`. The wider gap audit
  lives in `011-figma-vs-api-gap-analysis.md`; the broader task list
  lives in `013-figma-gap-task-list.md`.
- Subject CA / academic scoring beyond `max_ca_score` capture (already
  partly covered by `007-jupeb-academic-technical-design.md`).
- Permission / RBAC tuning per role (treated as cross-cutting in K.x).
