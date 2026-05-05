# JUPEB Academic Module Technical Design (Phase 2)

## Purpose

`academic` manages grade ingestion and score computation rules for JUPEB results.

Rule from business requirement:
- Grades `A`, `B`, `C`, `D`, `E` each contribute `+1` to overall score
- Grade `F` contributes `0`

## Boundaries

- In scope:
  - Course catalog for grading context (optional if external)
  - Candidate course-grade records
  - Score computation API
- Out of scope:
  - Registration approval logic
  - Payments

## Database Tables

## `jupeb_courses`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `code` | VARCHAR(20) | UNIQUE, NOT NULL | |
| `title` | VARCHAR(120) | NOT NULL | |
| `status` | VARCHAR(20) | NOT NULL default `active` | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

## `jupeb_registration_results`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `registration_id` | UUID | FK -> `jupeb_registrations.id`, NOT NULL | |
| `course_id` | UUID | FK -> `jupeb_courses.id`, NOT NULL | |
| `grade` | CHAR(1) | NOT NULL | `A`..`F` |
| `plus_one_awarded` | BOOLEAN | NOT NULL | Derived from grade |
| `entered_by` | UUID | FK -> `users.id`, NOT NULL | |
| `entered_at` | TIMESTAMPTZ | NOT NULL default `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

Constraints:
- Unique (`registration_id`, `course_id`)
- Check grade in (`A`,`B`,`C`,`D`,`E`,`F`)

## `jupeb_registration_scores` (materialized snapshot, optional)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `registration_id` | UUID | PK/FK -> `jupeb_registrations.id` | |
| `passed_courses_count` | INTEGER | NOT NULL | Grades A-E count |
| `failed_courses_count` | INTEGER | NOT NULL | Grade F count |
| `plus_one_total` | INTEGER | NOT NULL | Equals passed count |
| `computed_at` | TIMESTAMPTZ | NOT NULL | |

## API Endpoints

Base path: `/academic`

- `POST /courses` create course (admin)
- `GET /courses` list courses
- `POST /registrations/:registrationId/results` upsert course results (bulk)
- `GET /registrations/:registrationId/results` list raw grades
- `GET /registrations/:registrationId/score` return computed score breakdown
- `POST /registrations/:registrationId/recompute-score` force recompute (admin/registrar)

## Scoring Logic

Pseudo:

- `plus_one_awarded = grade IN (A,B,C,D,E)`
- `plus_one_total = count(plus_one_awarded=true)`
- `failed_courses_count = count(grade='F')`

## Authorization Matrix

- Result entry: `registrar`, `institution_admin` (if policy allows), `admin`.
- Score read: student owner, institution scope, registrar/admin.
- Course management: registrar/admin/super_admin.

## Test Plan

## Unit tests

- Grade-to-plus-one mapper.
- Score aggregator from result rows.

## Integration tests

- Bulk result upload and upsert behavior.
- Score endpoint returns expected counts for mixed grades.
- Invalid grades rejected.

## RBAC tests

- Students cannot submit grades.
- Students can read only their own score.

## Consistency tests

- Updating a grade recomputes plus-one and total score snapshot.
- Duplicate course rows blocked by unique constraint.

