---
name: NIN-pending student registration flow
description: Design for handling NIN-unavailable scenarios so the student can submit info now and have NIN verification settle asynchronously without re-typing data.
type: project
---

# NIN-pending student registration flow

## Problem

Today, both the institution flow (`POST /identity/nin/verify` from the
NIM Details / Register New Candidate screens) and any student-side path
require a synchronous, successful response from the NIN provider before
a registration row can be created. If the upstream NIN provider (NIBSS,
NIMC, or whichever adapter is configured in `nin-adapter.service.js`) is
slow or unavailable, the institution staff (or student) must abandon the
form and start over later — losing all the typed-in data: name, email,
subject combination, etc.

Per the figma "Enter Candidate NIN Number" dialog and the NIN Details
screen, the user must enter:

- Full name
- Candidate email
- NIN
- Subject combination

These need to be captured **once**, even if the verification settles
later.

## Goal

Allow the institution user (and, where applicable, the student claimer)
to submit candidate info even when NIN provider is unreachable. The
registration must:

1. Persist immediately so the user does not need to retype.
2. Be marked with `nin_status = pending`.
3. Move to `nin_status = verified` automatically once the background
   resolver succeeds — without any UX action on the student's part.
4. Be marked `nin_status = failed` if the provider explicitly rejects
   the NIN, with a clear reason surfaced on the UI.

## What we already have

- `jupeb_nin_verifications.status` already accepts `pending` (see
  `004_jupeb_identity.sql`, line 16: `CHECK (status IN ('verified',
  'failed', 'pending'))`). The table column is ready.
- `IdentityService.verifyNin` (in `identity.service.js`) currently writes
  rows only with `status = 'verified'` or `status = 'failed'` and does
  not handle a "provider unavailable" branch.
- `nin-adapter.service.js` returns `{ ok: true | false, ... }`. There is
  no distinction between "provider said no" and "we could not reach the
  provider".
- `RegistrationService.institutionCreate` requires that
  `nin_verification_id` either be omitted or be a valid UUID; it does
  not distinguish a verified vs pending verification.
- `registration-state.service.js` has no `nin_status` field on the
  registration. The state machine governs `provisional → code_issued →
  …`, not NIN status, which is good — NIN verification is orthogonal
  and should remain its own track.

## Proposed model

NIN verification is a **side-channel** to the registration state machine.
A registration can be in any status (e.g. `code_issued`, `claimed`,
`pending_documents`) while NIN is still `pending`, `verified`, or
`failed`. We do **not** add NIN states to the registration FSM.

### Schema additions (new migration `010_jupeb_nin_pending.sql`)

```sql
-- Allow a NIN verification row to record a soft failure (provider unavailable)
ALTER TABLE jupeb_nin_verifications
  ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(40) NULL;

CREATE INDEX IF NOT EXISTS idx_nin_verifications_pending_retry
  ON jupeb_nin_verifications (status, retry_after)
  WHERE status = 'pending';

-- Cache the candidate's submitted intake fields against the verification row
-- so the institution doesn't have to re-enter them when re-trying.
ALTER TABLE jupeb_nin_verifications
  ADD COLUMN IF NOT EXISTS intake_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
```

Why a `intake_payload` column instead of dropping name/email onto the
registration row? Because the institution form captures these fields
**before** the registration row is created (the screen is "Enter
Candidate NIN Number", which gates registration creation). Storing them
on the verification row keeps the registration row pristine and lets us
attempt verification idempotently without losing the captured data.

### Adapter contract change (`nin-adapter.service.js`)

Replace the current `{ ok, ... }` return with an explicit reason:

```js
{
  outcome: 'verified' | 'failed' | 'unavailable',
  provider_reference?: string,
  profile?: {...},
  error_code?: string,
  error_message?: string,
  retry_after_seconds?: number, // when outcome === 'unavailable'
}
```

`unavailable` covers: HTTP 5xx from upstream, timeouts, circuit-breaker
open, network errors. Anything where we genuinely don't know whether
the NIN exists. We must not write `failed` in that case — failed is a
terminal user-facing state ("Invalid NIN").

### Service change (`identity.service.js#verifyNin`)

Pseudo-flow:

```text
1. Normalize + hash NIN.
2. Re-use existing verification by idempotency_key when supplied.
3. Call adapter.verifyNin(normalized).
4. switch (adapterResult.outcome):
   case 'verified':
     persist row with status='verified', verified_at=now, response_payload
   case 'failed':
     persist row with status='failed', error_payload
   case 'unavailable':
     persist row with status='pending',
       intake_payload = { name, email, subject_combination_id, ... },
       retry_after = now + retry_after_seconds (default 5 min),
       attempt_count = 1,
       last_attempt_at = now,
       last_error_code = adapterResult.error_code
5. Return verification_id and current status to caller.
```

### New endpoint: re-attempt + resolver

- `POST /identity/nin/verifications/:verificationId/retry` — institution
  staff (or a background worker) can re-trigger verification. Internally
  re-calls the adapter and updates the row in place. Returns the new
  status. Idempotent if the row is already terminal.
- A periodic worker (Bull queue or simple cron — pick whichever the
  rest of the API uses; the project already has webhooks/notifications
  infrastructure) scans `WHERE status='pending' AND retry_after <= now()`
  and calls the same retry path. Backoff: 1m → 5m → 30m → 2h → 12h
  with `attempt_count`-driven jitter, cap at 24h, give up after N
  attempts (configurable; default 12) and flip to `failed` with
  `error_code = 'provider_unavailable_giveup'`.

Side effect when status transitions `pending → verified`:

- Look up `jupeb_registrations` rows referencing this
  `nin_verification_id`. For each one, fire a webhook
  `jupeb.nin.verified` so the UI can update without polling, and emit a
  notification to the student (`{ user_id, kind: 'nin_verified' }`)
  using the existing notifications module.
- If the student claimer was waiting on the NIN check (because the
  flow created the registration before NIN settled — see next section),
  no state-machine transition is needed; the registration row already
  has its own status.

### Registration-side change

In `RegistrationService.institutionCreate`, today the adapter is called
implicitly through identity service; the institution form passes
`nin_verification_id`. With the pending flow:

1. Institution calls `POST /identity/nin/verify` from the dialog.
2. If the response is `{ status: 'pending' }`, the dialog explains
   "We've received the candidate's information. NIN will be verified
   automatically; you can generate the code now."
3. Institution then calls `POST /institution/registrations` with the
   pending `nin_verification_id`.
4. `institutionCreate` accepts a `pending` verification — it must not
   reject a registration just because NIN is not verified yet. We add a
   read-through field on the registration response:

   ```jsonc
   {
     "id": "...",
     "status": "code_issued",
     "nin_verification": {
       "id": "...",
       "status": "pending" // or 'verified' | 'failed'
     },
     // ... rest of fields
   }
   ```

5. `institutionApprove` MUST NOT allow approval while
   `nin_verification.status !== 'verified'`. This is the actual gate:
   we can issue the code and even let the student log in, but we
   refuse to approve them and unlock the dashboard until NIN is
   resolved.

   Add to `assertCanApprove`: load the linked
   `jupeb_nin_verifications` row; if `status !== 'verified'`, throw
   `422 Cannot approve while NIN is pending`. (Optionally allow
   override by `super_admin` with `force_approve` flag for legal
   exception cases — discuss with stakeholders before adding.)

### State of the candidate while NIN is pending

| Field | Value while pending |
|---|---|
| `jupeb_registrations.status` | normal FSM (`code_issued` → `claimed` → ...) |
| `jupeb_registrations.nin_verification_id` | set, but pointing at pending row |
| Student dashboard | locked (as today, until `approved`) |
| Student can claim code? | yes |
| Student can confirm subjects? | yes |
| Student can upload documents? | yes |
| Student can `submit` for review? | yes |
| Institution can `approve`? | **no** — gated by NIN being `verified` |

This means the student's typed-in data is never lost: the row exists
the moment the institution clicks "Generate Code".

### API changes summary

New / changed endpoints:

| Method | Path | Change |
|---|---|---|
| `POST` | `/identity/nin/verify` | Response can now return `status: 'pending'` with `retry_after`. Accepts an optional `intake_payload` object with `name`, `email`, `subject_combination_id`, `phone`. |
| `POST` | `/identity/nin/verifications/:verificationId/retry` | New. Institution / cron driven. |
| `GET` | `/identity/nin/verifications/:verificationId` | Existing; response now exposes `attempt_count` and `last_error_code`. |
| `POST` | `/registration/institution/registrations` | Now accepts a `pending` verification id. |
| `POST` | `/registration/institution/registrations/:id/approve` | New 422 case: NIN not verified. |
| Webhook | `jupeb.nin.verified` | New. |
| Webhook | `jupeb.nin.failed` | New (terminal failure or give-up). |
| Notification | `jupeb_nin_verified` | New. |
| Notification | `jupeb_nin_failed` | New. |

### Test plan

- **Unit:** adapter returns `unavailable` on simulated 503; service
  writes a `pending` row, never a `failed` row.
- **Unit:** state-machine `canTransition` to `approved` is unchanged;
  the new gate lives in the service layer.
- **Integration:** create registration with pending NIN; institution
  cannot approve; resolver flips NIN to verified; institution can now
  approve; webhook fired.
- **Integration:** all retries exhausted → status flips to `failed`;
  webhook fired; institution sees actionable error on the candidate
  detail screen.
- **Concurrency:** retry endpoint and cron worker race on the same
  verification — second loser must observe the terminal state without
  double-writing.
- **RBAC:** student cannot trigger retry for someone else's
  verification.

### File-level change list

- `src/db/migrations/010_jupeb_nin_pending.sql` — new.
- `src/modules/jupeb/services/nin-adapter.service.js` — return
  `outcome` shape; add HTTP/timeout handling for real provider.
- `src/modules/jupeb/services/identity.service.js` — handle
  `unavailable`; add `retryVerification(verificationId)`.
- `src/modules/jupeb/models/nin-verification.model.js` — add
  `findDuePending`, `incrementAttempt`, `markVerified`, `markFailed`.
- `src/modules/jupeb/controllers/identity.controller.js` — add
  `retryVerification`.
- `src/modules/jupeb/routes/identity.routes.js` — add retry route.
- `src/modules/jupeb/services/registration.service.js` — relax
  `institutionCreate` to accept pending; tighten `institutionApprove`
  to require verified.
- `src/modules/jupeb/services/registration.service.js` — embed
  `nin_verification` summary in the response shape.
- New: `src/modules/jupeb/jobs/nin-resolver.job.js` (or equivalent
  using the existing job runner) — periodic resolver.
- `docs/jupeb-003-identity-swagger.yaml` — document new fields and
  retry route.
- `docs/jupeb-005-registration-swagger.yaml` — document the gating
  behavior on approve.
