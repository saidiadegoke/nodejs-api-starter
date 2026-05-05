# JUPEB Sessions Module Technical Design

## Purpose

`sessions` manages registration windows, timeline controls, and session-level stats.

## Boundaries

- In scope:
  - Session creation/update/open/close
  - Session policy dates (submission deadlines, approval deadlines)
  - Session-level reporting counters
- Out of scope:
  - Candidate-level state transitions (`registration`)
  - Final candidate number generation logic (triggered here, implemented in `registration`)

## Database Tables

## `jupeb_registration_sessions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, default `gen_random_uuid()` | |
| `academic_year` | VARCHAR(9) | NOT NULL, UNIQUE | `2026/2027` |
| `year_short` | CHAR(2) | NOT NULL | Used in final candidate number (`27`) |
| `status` | VARCHAR(20) | NOT NULL default `draft` | `draft`, `open`, `closed`, `archived` |
| `opens_at` | TIMESTAMPTZ | NOT NULL | |
| `closes_at` | TIMESTAMPTZ | NOT NULL | |
| `student_submission_deadline` | TIMESTAMPTZ | NULL | |
| `institution_approval_deadline` | TIMESTAMPTZ | NULL | |
| `final_numbers_generated_at` | TIMESTAMPTZ | NULL | |
| `notes` | TEXT | NULL | |
| `created_by` | UUID | FK -> `users.id` | |
| `updated_by` | UUID | FK -> `users.id` | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

Constraints:
- `opens_at < closes_at`
- `status='open'` requires `now()` between open/close or explicit override flag

Indexes:
- `idx_sessions_status`
- `idx_sessions_dates` (`opens_at`, `closes_at`)

## `jupeb_session_events` (audit helper)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `session_id` | UUID | FK -> `jupeb_registration_sessions.id` | |
| `event_type` | VARCHAR(40) | NOT NULL | `opened`, `closed`, `reopened`, `finalization_triggered` |
| `payload` | JSONB | NOT NULL default `{}` | |
| `created_by` | UUID | FK -> `users.id` | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

## API Endpoints

Base path: `/sessions`

- `POST /` create session
- `GET /` list sessions
- `GET /:sessionId` session details
- `PATCH /:sessionId` update draft session
- `POST /:sessionId/open` open session
- `POST /:sessionId/close` close session
- `POST /:sessionId/reopen` reopen closed session (restricted)
- `GET /:sessionId/stats` aggregate stats by status and payment state
- `POST /:sessionId/finalize-candidate-numbers` fire final numbering job (delegates to registration service)

## Request/Response Notes

- Exactly one session can be `open` at a time (unless multi-session explicitly supported later).
- `close` endpoint is idempotent.
- `finalize-candidate-numbers` can run only on `closed` sessions.

## Authorization Matrix

- Read: all authenticated users.
- Write/open/close/finalize: `registrar`, `admin`, `super_admin`.
- Reopen: `super_admin` only (recommended).

## Validation Rules

- `academic_year` format regex: `^\d{4}/\d{4}$`.
- `year_short` must equal last two digits of second year.
- Disallow update of immutable fields after session is `closed` (except admin notes).

## Test Plan

## Unit tests

- Date validation and academic-year parser.
- State transition guard (`draft -> open -> closed -> archived`).

## Integration tests

- Create/open/close lifecycle.
- Enforce single open session.
- Finalization endpoint rejects non-closed sessions.
- Reopen restrictions by role.

## RBAC tests

- Student/program director cannot open/close session.
- Registrar can open/close/finalize.

## Reporting tests

- Stats endpoint returns expected totals with mixed registration statuses.
- Stats filters by `university_id` (if query parameter provided).

