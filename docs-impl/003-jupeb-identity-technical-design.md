# JUPEB Identity Module Technical Design

## Purpose

`identity` handles identity proofing integrations and biometric capture references.

## Clarification

This module is **not** the JUPEB enrollment workflow owner.  
It provides identity signals consumed by `registration`.

## Boundaries

- In scope:
  - NIN verification request/response handling
  - Secure storage of verification metadata
  - Biometric capture metadata + file/external references
- Out of scope:
  - Approval/rejection decisions
  - Dashboard lock/unlock logic
  - Candidate numbering

## Database Tables

## `jupeb_nin_verifications`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `nin_hash` | CHAR(64) | NOT NULL, indexed | SHA-256 NIN hash; no raw NIN persistence |
| `nin_last4` | CHAR(4) | NOT NULL | Masked display aid |
| `provider` | VARCHAR(40) | NOT NULL | e.g. `nibss`, `mock` |
| `provider_reference` | VARCHAR(120) | NULL | Upstream trace id |
| `status` | VARCHAR(20) | NOT NULL | `verified`, `failed`, `pending` |
| `response_payload` | JSONB | NOT NULL default `{}` | PII-minimized normalized payload |
| `error_payload` | JSONB | NOT NULL default `{}` | |
| `verified_at` | TIMESTAMPTZ | NULL | |
| `requested_by` | UUID | FK -> `users.id` | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

Indexes:
- `idx_nin_verifications_nin_hash`
- `idx_nin_verifications_status_created_at`

## `jupeb_biometric_captures`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `registration_id` | UUID | FK -> `jupeb_registrations.id`, NOT NULL | Candidate linkage |
| `capture_type` | VARCHAR(20) | NOT NULL | `face`, `fingerprint` |
| `file_id` | UUID | FK -> `files.id`, NULL | If stored in local/S3 via files module |
| `external_reference` | VARCHAR(200) | NULL | If stored in external biometric vault |
| `quality_score` | NUMERIC(5,2) | NULL | |
| `device_metadata` | JSONB | NOT NULL default `{}` | Device/app version/source |
| `captured_at` | TIMESTAMPTZ | NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

Constraints:
- Must provide one of `file_id` or `external_reference`.
- Unique optional rule: one active `face` and one active `fingerprint` per registration.

## API Endpoints

Base path: `/identity`

- `POST /nin/verify` verify NIN and return normalized profile summary
- `GET /nin/verifications/:verificationId` fetch verification outcome (privileged)
- `POST /biometrics` attach biometric capture to registration
- `GET /registrations/:registrationId/biometrics` list biometric captures
- `DELETE /biometrics/:captureId` remove/void capture (policy controlled)

## Request/Response Notes

- Never return full raw NIN to clients or logs.
- `POST /nin/verify` should include idempotency key to prevent duplicate provider calls.
- Biometric endpoints validate registration ownership and session timeline.

## Authorization Matrix

- NIN verify: `program_director`, `institution_admin` (institution flow), optional student self-verify only if policy allows.
- Read verification details: `registrar`, `admin`, `super_admin`, scoped institution.
- Biometric create: student on own registration; institution on behalf (optional).
- Biometric read: student owner + institution scope + registrar roles.

## Test Plan

## Unit tests

- NIN hashing and masking utility.
- Provider adapter normalization from external formats to internal schema.
- Biometric capture validation (`file_id` xor `external_reference`).

## Integration tests

- Successful NIN verification with mock provider.
- Provider error mapping (`timeout`, `not_found`, `invalid_nin`).
- Biometric create/list/delete flow with registration ownership checks.

## Security tests

- Ensure logs redact NIN and biometric references.
- Ensure API responses do not leak raw provider payload fields marked sensitive.

## RBAC tests

- Student cannot query arbitrary verification IDs.
- Institution users cannot access other institutions' verification records.

