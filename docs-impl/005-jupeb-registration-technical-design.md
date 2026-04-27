# JUPEB Registration Module Technical Design

## Purpose

`registration` owns the JUPEB candidate enrollment workflow:
- Institution-created enrollment records
- Candidate code claim flow
- Subject confirmation workflow states
- Institution approval/rejection
- Dashboard lock/unlock state
- Final candidate numbering after session close

## Explicit definition

`registration` here means a **JUPEB candidate enrollment record for one university in one session**.
It is not a generic user profile table and not a full KYC subsystem.

## Database Tables

## `jupeb_registrations`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `session_id` | UUID | FK -> `jupeb_registration_sessions.id`, NOT NULL | |
| `university_id` | UUID | FK -> `jupeb_universities.id`, NOT NULL | |
| `user_id` | UUID | FK -> `users.id`, NULL | Set after claim |
| `subject_combination_id` | UUID | FK -> `jupeb_subject_combinations.id`, NOT NULL | |
| `nin_verification_id` | UUID | FK -> `jupeb_nin_verifications.id`, NULL | Identity linkage |
| `institution_issued_code` | VARCHAR(32) | UNIQUE, NOT NULL | Claim code |
| `provisional_serial` | INTEGER | NOT NULL | Per university/session sequence |
| `provisional_candidate_code` | VARCHAR(20) | NOT NULL | e.g. `0010001` |
| `jupeb_candidate_number` | VARCHAR(20) | UNIQUE, NULL | Finalized on session close |
| `status` | VARCHAR(30) | NOT NULL | See state machine |
| `status_reason` | TEXT | NULL | Rejection/withdrawal reason |
| `dashboard_unlocked_at` | TIMESTAMPTZ | NULL | Set on approve |
| `claimed_at` | TIMESTAMPTZ | NULL | |
| `submitted_at` | TIMESTAMPTZ | NULL | |
| `approved_at` | TIMESTAMPTZ | NULL | |
| `approved_by` | UUID | FK -> `users.id`, NULL | |
| `created_by` | UUID | FK -> `users.id`, NOT NULL | Institution user |
| `updated_at` | TIMESTAMPTZ | NOT NULL default `now()` | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

Constraints:
- Unique candidate per (`session_id`, `university_id`, `nin_verification_id`) if policy uses NIN as uniqueness basis.
- `jupeb_candidate_number` must match `[0-9]{2}[0-9]{3}[0-9]{4,}` format.

Indexes:
- `idx_registrations_session_status`
- `idx_registrations_university_status`
- `idx_registrations_user_id`
- `idx_registrations_institution_code`

## `jupeb_registration_status_history`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `registration_id` | UUID | FK -> `jupeb_registrations.id`, NOT NULL | |
| `from_status` | VARCHAR(30) | NULL | |
| `to_status` | VARCHAR(30) | NOT NULL | |
| `reason` | TEXT | NULL | |
| `changed_by` | UUID | FK -> `users.id`, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

## State Machine

- `provisional`
- `code_issued`
- `claimed`
- `pending_student_confirm`
- `pending_documents`
- `pending_institution_review`
- `approved`
- `rejected`
- `withdrawn`

Only allowed transitions should be codified in `registration-state.service.js`.

## API Endpoints

Base path: `/registration`

## Institution endpoints

- `POST /institution/registrations` create provisional registration and code
- `PATCH /institution/registrations/:registrationId` update subject combo before student confirms
- `GET /institution/registrations` list by scope (`status`, `session_id`)
- `POST /institution/registrations/:registrationId/approve` approve and unlock dashboard
- `POST /institution/registrations/:registrationId/reject` reject with reason

## Student endpoints

- `POST /me/claim-code` bind registration to authenticated student
- `GET /me/current` fetch current registration summary
- `POST /me/confirm-subjects` confirm selected combination
- `POST /me/submit` move to institution review
- `GET /me/dashboard-access` return locked/unlocked state

## Registrar endpoints

- `POST /sessions/:sessionId/finalize-candidate-numbers` assign final numbers for eligible registrations
- `GET /sessions/:sessionId/numbering-preview` dry-run preview and conflicts

## Request/Response Notes

- Claim code is one-time, time-bound token (recommended TTL: session close or configurable).
- Approve endpoint should emit notification/webhook events.
- Finalization is idempotent and should skip already-numbered records.

## Authorization Matrix

- Institution registration create/update/approve/reject: `program_director`, `institution_admin`.
- Student claim/confirm/submit/read own: `student` or regular authenticated `user`.
- Finalize numbering: `registrar`, `admin`, `super_admin`.

## Test Plan

## Unit tests

- State transition validator allows only legal transitions.
- Candidate number formatter (`YY + prefix + padded_serial`).
- Code generation collision handling.

## Integration tests

- Institution create -> code issued.
- Student claim -> confirm -> submit.
- Institution approve sets `dashboard_unlocked_at` and status history.
- Reject flow requires reason and does not unlock dashboard.
- Finalization endpoint assigns final numbers for eligible rows only.

## Concurrency tests

- Two concurrent claim attempts for same code: one success, one conflict.
- Concurrent finalization job executions remain idempotent.

## RBAC tests

- Student cannot approve/reject.
- Institution cannot finalize candidate numbers.

## Event tests

- Approval emits notification and webhook payload with registration identifiers.

