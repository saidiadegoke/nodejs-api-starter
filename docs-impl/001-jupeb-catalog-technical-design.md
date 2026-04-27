# JUPEB Catalog Module Technical Design

## Purpose

`catalog` owns master reference data used by other JUPEB modules:
- Universities and their candidate number prefixes
- Subject combinations available for enrollment

This module is read-heavy and write-restricted (registrar/admin only for writes).

## Boundaries

- In scope:
  - University CRUD and activation/deactivation
  - Subject combination CRUD and publication
  - Read APIs for institution and student flows
- Out of scope:
  - Session lifecycle (`sessions`)
  - Candidate workflow state (`registration`)
  - NIN/biometrics (`identity`)
  - Document submission (`submission`)

## Database Tables

## `jupeb_universities`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, default `gen_random_uuid()` | |
| `code` | VARCHAR(20) | UNIQUE, NOT NULL | Human-readable institution code |
| `name` | VARCHAR(255) | NOT NULL | |
| `short_name` | VARCHAR(80) | NULL | |
| `jupeb_prefix` | CHAR(3) | UNIQUE, NOT NULL | 3-digit numeric prefix (`001`) |
| `status` | VARCHAR(20) | NOT NULL default `active` | `active`, `inactive` |
| `metadata` | JSONB | NOT NULL default `{}` | Extensible fields |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL default `now()` | |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft delete |

Indexes:
- `idx_jupeb_universities_status` (`status`) where `deleted_at IS NULL`
- `idx_jupeb_universities_name_trgm` (GIN trigram on `name`) for search

## `jupeb_subject_combinations`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, default `gen_random_uuid()` | |
| `code` | VARCHAR(40) | UNIQUE, NOT NULL | e.g. `ARTS_ENG_LIT_GOV` |
| `title` | VARCHAR(255) | NOT NULL | Display name |
| `subjects` | JSONB | NOT NULL | Array of subjects (`["English","Literature","Government"]`) |
| `status` | VARCHAR(20) | NOT NULL default `active` | `active`, `inactive` |
| `is_global` | BOOLEAN | NOT NULL default `true` | If false, scoped by university |
| `university_id` | UUID | FK -> `jupeb_universities.id`, NULL | Used when `is_global=false` |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL default `now()` | |
| `deleted_at` | TIMESTAMPTZ | NULL | |

Constraints:
- Check: `is_global = true AND university_id IS NULL` OR `is_global = false AND university_id IS NOT NULL`
- Optional uniqueness: (`title`, `coalesce(university_id,'00000000-0000-0000-0000-000000000000')`) where `deleted_at IS NULL`

Indexes:
- `idx_subject_combinations_status`
- `idx_subject_combinations_university_id`
- `idx_subject_combinations_subjects_gin` on `subjects`

## API Endpoints

Base path: `/catalog`

## Registrar/Admin endpoints

- `POST /universities`
- `GET /universities`
- `GET /universities/:universityId`
- `PATCH /universities/:universityId`
- `POST /universities/:universityId/activate`
- `POST /universities/:universityId/deactivate`

- `POST /subject-combinations`
- `GET /subject-combinations`
- `GET /subject-combinations/:subjectCombinationId`
- `PATCH /subject-combinations/:subjectCombinationId`
- `POST /subject-combinations/:subjectCombinationId/activate`
- `POST /subject-combinations/:subjectCombinationId/deactivate`

## Public/Institution read endpoints

- `GET /universities/public`
- `GET /subject-combinations/public?university_id=<uuid>`

## Request/Response Notes

- `jupeb_prefix` validation: exactly 3 numeric chars.
- Subject combinations require at least 3 unique subjects.
- Deactivating a university does not delete existing registrations; it blocks new registrations.

## Authorization Matrix

- Read (public lists): anonymous allowed for mobile preload endpoints.
- Read (full details): authenticated roles.
- Write: `registrar`, `admin`, `super_admin`.

## Validation Rules

- University code/prefix uniqueness checks are case-insensitive.
- Subject array max length: 6.
- Reject payloads with duplicate subject names.

## Test Plan

## Unit tests

- Prefix validation (`001` valid, `01`, `AB1` invalid).
- Subject array normalization (trim, title-case, dedupe).
- Scope checks for `is_global` vs `university_id`.

## Integration tests

- Create/list/update/deactivate university lifecycle.
- Prevent duplicate `jupeb_prefix`.
- Create global and university-scoped subject combinations.
- Public listing filters out inactive/deleted rows.

## RBAC tests

- Student cannot create/edit catalog entries.
- Registrar can write catalog entries.

## Edge-case tests

- Soft-deleted university code can be recreated only if policy allows (document expected behavior).
- Deactivate university with active session registrations returns warning metadata.

## Non-functional checks

- List endpoints support pagination (`page`, `limit`) and stable sort.
- Search by `name` remains performant with 50k+ catalog rows.

