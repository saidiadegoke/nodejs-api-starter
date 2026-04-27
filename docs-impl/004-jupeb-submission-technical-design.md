# JUPEB Submission Module Technical Design

## Purpose

`submission` handles student document requirements and submission completeness checks before institution review.

## Boundaries

- In scope:
  - Required document definitions
  - Student document attachment tracking
  - Submission completeness evaluation
- Out of scope:
  - File upload storage implementation (handled by `files` module)
  - Registration state transition rules (handled by `registration`)

## Database Tables

## `jupeb_document_requirements`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `key` | VARCHAR(60) | UNIQUE, NOT NULL | e.g. `waec_result`, `birth_certificate` |
| `title` | VARCHAR(120) | NOT NULL | |
| `description` | TEXT | NULL | |
| `is_mandatory` | BOOLEAN | NOT NULL default `true` | |
| `allowed_mime_types` | JSONB | NOT NULL default `[]` | |
| `max_file_size_mb` | INTEGER | NOT NULL default `10` | |
| `status` | VARCHAR(20) | NOT NULL default `active` | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

## `jupeb_registration_documents`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `registration_id` | UUID | FK -> `jupeb_registrations.id`, NOT NULL | |
| `requirement_id` | UUID | FK -> `jupeb_document_requirements.id`, NOT NULL | |
| `file_id` | UUID | FK -> `files.id`, NOT NULL | |
| `status` | VARCHAR(20) | NOT NULL default `submitted` | `submitted`, `replaced`, `rejected`, `accepted` |
| `review_note` | TEXT | NULL | |
| `reviewed_by` | UUID | FK -> `users.id`, NULL | |
| `reviewed_at` | TIMESTAMPTZ | NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

Constraints:
- Unique active row per (`registration_id`, `requirement_id`) if latest replacement model is used.

Indexes:
- `idx_registration_documents_registration_id`
- `idx_registration_documents_status`

## API Endpoints

Base path: `/submission`

## Requirement management (registrar/admin)

- `POST /requirements`
- `GET /requirements`
- `PATCH /requirements/:requirementId`
- `POST /requirements/:requirementId/activate`
- `POST /requirements/:requirementId/deactivate`

## Student submission endpoints

- `GET /me/requirements` requirements + completion status for current registration
- `POST /me/documents` attach uploaded file to requirement
- `PATCH /me/documents/:documentId` replace file/metadata
- `GET /me/documents` list current submitted docs
- `POST /me/validate-completeness` returns missing requirements

## Institution review endpoints (optional in phase 1)

- `GET /institution/registrations/:registrationId/documents`
- `POST /institution/documents/:documentId/accept`
- `POST /institution/documents/:documentId/reject`

## Request/Response Notes

- Files must already exist in `files` and be owned by the same student unless admin override.
- Completeness validator checks mandatory requirements + biometric conditions if configured.

## Authorization Matrix

- Student endpoints: owner only.
- Institution review: institution-scoped user roles.
- Requirement management: registrar/admin.

## Test Plan

## Unit tests

- Requirement validator (mime type, size, mandatory flags).
- Completeness evaluator with mixed mandatory/optional requirements.

## Integration tests

- Student can attach and replace required documents.
- Completeness endpoint reports exact missing keys.
- Institution review updates status and review metadata.

## RBAC tests

- Students cannot manage requirement definitions.
- Institution cannot read documents from another institution.

## Consistency tests

- Document replacement marks old row as `replaced`.
- Deactivated requirements are excluded from new completeness checks unless locked by session snapshot policy.

