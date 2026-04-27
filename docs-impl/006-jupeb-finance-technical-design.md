# JUPEB Finance Module Technical Design

## Purpose

`finance` maps JUPEB registrations to the existing `payments` module and provides reconciliation views for finance admins.

## Boundaries

- In scope:
  - Payment intent linkage with registration
  - Payment status projection for JUPEB workflows
  - Finance reporting endpoints
- Out of scope:
  - Gateway SDK logic (already in `payments`)
  - Core transaction processing/webhook signature verification (already in `payments`)

## Database Tables

Preferred schema change in existing `payments` table:

## `payments` (extension)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `registration_id` | UUID | FK -> `jupeb_registrations.id`, NULL | Add index for joins |

Alternative if payments schema cannot be altered:
- Use existing nullable `campaign_id` as registration correlation ID (UUID string convention).

## `jupeb_payment_reconciliations` (optional)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `registration_id` | UUID | FK -> `jupeb_registrations.id`, NOT NULL | |
| `payment_id` | UUID | FK -> `payments.id`, NOT NULL | |
| `status_snapshot` | VARCHAR(20) | NOT NULL | `pending`, `successful`, `failed`, `refunded` |
| `captured_amount` | NUMERIC(12,2) | NOT NULL | |
| `currency` | VARCHAR(10) | NOT NULL | |
| `gateway_reference` | VARCHAR(120) | NULL | |
| `reconciled_by` | UUID | FK -> `users.id`, NULL | |
| `reconciled_at` | TIMESTAMPTZ | NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL default `now()` | |

Indexes:
- `idx_payments_registration_id`
- `idx_reconciliations_registration_id`

## API Endpoints

Base path: `/finance`

## Student-facing helper endpoints

- `POST /me/checkout` creates payment intent through `/payments` and stores registration linkage
- `GET /me/payments` list payments linked to student's current registration

## Finance/admin endpoints

- `GET /payments` list payment rows joined with registration/session/university
- `GET /registrations/:registrationId/payment-summary` aggregate per candidate
- `POST /registrations/:registrationId/reconcile` manual reconciliation override (audited)
- `GET /reports/session/:sessionId` session-level totals (paid/unpaid/partial)

## Webhook integration

- Existing paystack/flutterwave webhook handlers update payment status.
- Finance module listener updates registration payment projection:
  - `unpaid`
  - `pending`
  - `paid`
  - `payment_failed`

## Authorization Matrix

- Student checkout/list own payments: authenticated student/user owner.
- Finance views/reconciliation: `financial_admin`, `registrar`, `admin`, `super_admin`.

## Validation Rules

- Prevent checkout on closed sessions unless policy override.
- Enforce single active unpaid intent per registration and fee type (if needed).
- Verify amount and currency match configured session fee rules.

## Test Plan

## Unit tests

- Registration-to-payment linking resolver.
- Projection mapper from gateway states to registration payment state.

## Integration tests

- Checkout creates payment with registration reference.
- Webhook success marks registration as paid.
- Failed webhook states do not unlock registration workflows.

## RBAC tests

- Non-finance users cannot access finance reporting endpoints.
- Student cannot view another student's payments.

## Reconciliation tests

- Manual reconciliation writes audit event and overrides snapshot.
- Duplicate webhook delivery remains idempotent.

