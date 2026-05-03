---
name: NIN-pending implementation task list
description: TDD-ordered task breakdown for shipping the NIN-pending flow described in 010-nin-pending-flow.md.
type: project
---

# NIN-pending implementation task list (TDD)

Each task is **red → green → refactor**:

1. **Red** — write a failing test (unit, integration, or migration test).
2. **Green** — write the smallest production change that turns it green.
3. **Refactor** — clean up names, dedupe, leave no commented code.

Run `npm test -- --testPathPattern=<pattern>` to scope tests during the
loop. Whole suite must pass before moving to the next task.

Conventions (from existing tests):
- `*.utils.test.js` for pure-function unit tests.
- `*.api.test.js` for supertest-driven HTTP tests guarded by a
  `beforeAll` migration probe (skip if not migrated).
- Tests must not require live external providers; the mock adapter is
  driven via env vars.

## Task 1 — Adapter outcome contract (unit)

**Why first:** the entire feature hinges on distinguishing `unavailable`
from `failed`. Until the adapter contract is correct, every higher-level
test will be ambiguous.

- [ ] Red: extend `src/tests/jupeb.identity.utils.test.js` with a new
      `describe('nin-adapter outcome contract')` block:
  - returns `{ outcome: 'verified', provider_reference, profile }` on
    valid mock NIN.
  - returns `{ outcome: 'failed', error_code: 'invalid_nin' }` on
    11-zero NIN.
  - returns `{ outcome: 'unavailable', error_code, retry_after_seconds }`
    when `process.env.JUPEB_NIN_FORCE_UNAVAILABLE === '1'` (test sets
    and unsets it).
- [ ] Green: rewrite `nin-adapter.service.js`:
  - replace `{ ok }` with `{ outcome }`.
  - honor `JUPEB_NIN_FORCE_UNAVAILABLE` for tests.
  - keep `getProvider` exported.
- [ ] Refactor: extract a `mockOutcome(nin)` helper for clarity.

Files: `src/modules/jupeb/services/nin-adapter.service.js`,
`src/tests/jupeb.identity.utils.test.js`.

## Task 2 — Migration 010 columns (integration)

- [ ] Red: new test file `src/tests/jupeb.identity.nin-pending.schema.test.js`:
  - asserts columns `intake_payload`, `retry_after`, `attempt_count`,
    `last_attempt_at`, `last_error_code` exist on
    `jupeb_nin_verifications`.
  - asserts the partial index on `(status, retry_after)` exists.
  - skip if migration 004 not applied (use the same probe pattern as
    `jupeb.identity.api.test.js`).
- [ ] Green: write `src/db/migrations/010_jupeb_nin_pending.sql` per
      the schema in `010-nin-pending-flow.md`. Apply migration via
      `npm run migrate` before re-running the test.
- [ ] Refactor: confirm idempotency (`IF NOT EXISTS` everywhere).

Files: `src/db/migrations/010_jupeb_nin_pending.sql`,
`src/tests/jupeb.identity.nin-pending.schema.test.js`.

## Task 3 — Model writes for pending state (unit + integration)

- [ ] Red: extend `nin-verification.model.js` with three new methods
      and add tests in
      `src/tests/jupeb.identity.nin-pending.model.test.js`:
  - `createPending({ nin_hash, nin_last4, provider, intake_payload,
    retry_after, last_error_code, requested_by })` → returns row with
    `status='pending'`, `attempt_count=1`.
  - `markVerified(id, response_payload, provider_reference)` →
    transitions row, sets `verified_at`, increments `attempt_count`,
    clears `retry_after` + `last_error_code`.
  - `markFailed(id, error_payload)` → terminal failure, clears
    `retry_after`.
  - `findDuePending({ now, limit })` → only rows with `status='pending'
    AND retry_after <= now`.
- [ ] Green: implement methods.
- [ ] Refactor: collapse SQL fragments into named constants if more
      than two methods share them.

Files: `src/modules/jupeb/models/nin-verification.model.js`,
`src/tests/jupeb.identity.nin-pending.model.test.js`.

## Task 4 — Service: handle `unavailable` outcome (unit)

- [ ] Red: new tests in `src/tests/jupeb.identity.utils.test.js` (or a
      new `jupeb.identity.service.test.js`) using a stubbed adapter:
  - When adapter returns `unavailable`, service:
    - persists row with `status='pending'`,
    - stores `intake_payload` from request body,
    - returns `{ verification_id, status: 'pending', retry_after }` to
      the caller,
    - never returns `failed`.
  - When adapter returns `verified`, behavior is unchanged.
  - When adapter returns `failed`, behavior is unchanged.
- [ ] Green: add the `unavailable` branch in
      `IdentityService.verifyNin`. Accept `intake_payload` (whitelist
      keys: `name`, `email`, `phone`, `subject_combination_id`).
- [ ] Refactor: extract `_persistVerification(outcome, ...)` so the
      three branches share row-building.

Files: `src/modules/jupeb/services/identity.service.js`.

## Task 5 — Controller + route: retry endpoint (api)

- [ ] Red: extend `src/tests/jupeb.identity.api.test.js`:
  - `POST /identity/nin/verifications/:id/retry` requires auth.
  - Privileged role can retry a pending verification; if adapter is
    forced `verified`, the row flips to verified and the response
    reflects the new status.
  - Retrying a terminal verification returns the same terminal state
    without writing.
- [ ] Green:
  - `IdentityService.retryVerification(verificationId, userId)`.
  - `IdentityController.retryVerification`.
  - Add route in `identity.routes.js` with the same RBAC as
    `POST /identity/nin/verify`.
- [ ] Refactor: share the persistence helper with Task 4.

Files: `src/modules/jupeb/services/identity.service.js`,
`src/modules/jupeb/controllers/identity.controller.js`,
`src/modules/jupeb/routes/identity.routes.js`,
`src/tests/jupeb.identity.api.test.js`.

## Task 6 — Embed nin_verification on registration responses (api)

- [ ] Red: extend `src/tests/jupeb.registration.api.test.js`:
  - `POST /institution/registrations` with a pending NIN succeeds and
    returns `nin_verification: { id, status: 'pending' }` on the body.
  - `GET /me/current` includes `nin_verification` summary.
- [ ] Green:
  - In `registration.service.js`, replace the bare row return with a
    helper that joins/loads the verification row's `id` + `status` and
    embeds it under `nin_verification`.
  - Update `_publicRegistrationSummary` likewise.
- [ ] Refactor: introduce a `serializeRegistration(reg, { ninVerification })`.

Files: `src/modules/jupeb/services/registration.service.js`,
`src/tests/jupeb.registration.api.test.js`.

## Task 7 — Approval gate when NIN not verified (api)

- [ ] Red: in `jupeb.registration.api.test.js`:
  - Force adapter `unavailable`; create registration; institution
    `approve` returns 422 with body `{ error_code:
    'nin_not_verified' }` (or whichever shape `sendError` uses).
  - Force adapter `verified` (default mock) afterwards; approve
    succeeds.
- [ ] Green: in `RegistrationService.institutionApprove`, before
      transitioning, load the linked `nin_verification`. If status !=
      `verified`, throw `httpError(422, 'NIN not verified')` with a
      `code` property. Update the controller / response helper to pass
      the `code` through (`sendError` may need a small extension).
- [ ] Refactor: name the gate `assertNinVerified(reg)` and unit-test
      it directly.

Files: `src/modules/jupeb/services/registration.service.js`,
`src/modules/jupeb/controllers/registration.controller.js`
(only if error shape needs adjusting).

## Task 8 — Background resolver job (unit)

- [ ] Red: new file
      `src/tests/jupeb.identity.nin-resolver.test.js`:
  - Seeds two pending verifications: one due, one not due.
  - Calls `resolvePendingOnce({ now })`.
  - With the adapter forced to `verified`, the due row flips to
    `verified` and the not-due row stays pending.
  - With the adapter forced to `unavailable`, the due row's
    `attempt_count` increments and `retry_after` advances per the
    backoff schedule.
  - After max attempts, the row flips to `failed` with
    `error_code: 'provider_unavailable_giveup'`.
- [ ] Green: implement
      `src/modules/jupeb/jobs/nin-resolver.job.js` exporting
      `resolvePendingOnce(opts)` and a `start()` that schedules it
      (use the project's existing job pattern; if none, a simple
      `setInterval` gated by `JUPEB_NIN_RESOLVER_INTERVAL_MS`). Wire
      `start()` into `app.js` only when `process.env.NODE_ENV !==
      'test'`.
- [ ] Refactor: extract `nextRetryAfter(attemptCount)` (pure) for
      easy unit-testing of the backoff curve; cover edge cases
      (attempt 0, attempt > cap).

Files: `src/modules/jupeb/jobs/nin-resolver.job.js`,
`src/app.js`,
`src/tests/jupeb.identity.nin-resolver.test.js`.

## Task 9 — Webhook + notification on verified/failed (unit + integration)

- [ ] Red: in `jupeb.identity.api.test.js`, after a retry that flips
      pending → verified, assert that:
  - a webhook event `jupeb.nin.verified` is fired (spy on
    `WebhookService.fire`),
  - a notification is queued for the registration's `user_id` (spy
    on the notifications service).
- [ ] Green: emit events from the persistence helper used by Task 4 +
      Task 8 — only on transitions, never on no-op terminal calls.
- [ ] Refactor: ensure the resolver and the manual retry path share
      the same emission code (single source of truth).

Files: `src/modules/jupeb/services/identity.service.js`,
`src/modules/jupeb/jobs/nin-resolver.job.js`.

## Task 10 — Swagger docs

- [ ] Red: not strictly TDD — but add a quick lint check or a snapshot
      test that loads the swagger YAML and asserts the new path /
      fields exist.
- [ ] Green: update `docs/jupeb-003-identity-swagger.yaml`:
  - `POST /identity/nin/verify` response schema can return
    `status: pending` plus `retry_after`.
  - new `POST /identity/nin/verifications/:verificationId/retry`.
  - body of `verify` accepts `intake_payload` object.
- [ ] Update `docs/jupeb-005-registration-swagger.yaml`:
  - `approve` 422 case documents `nin_not_verified`.
  - response includes `nin_verification` summary.

Files: `docs/jupeb-003-identity-swagger.yaml`,
`docs/jupeb-005-registration-swagger.yaml`.

## Task 11 — End-to-end happy path (api)

- [ ] Red: end-to-end test that walks: institution verifies NIN with
      provider forced `unavailable` → registration created → student
      claims code → confirms subjects → uploads docs → submits →
      institution `approve` 422 → operator forces adapter to
      `verified` and calls retry → approve succeeds.
- [ ] Green: should pass once Tasks 1–7 are complete; this is the
      regression net.

Files: `src/tests/jupeb.nin-pending.e2e.test.js`.

## Task 12 — Stop-gap polish

- [ ] Confirm `npm run lint` passes.
- [ ] Confirm `npm test` passes the whole suite.
- [ ] Update `docs-impl/jupeb-task-list.md` to mark this initiative
      complete.

## Out of scope (parked)

- Real provider integration (NIBSS / NIMC). Adapter contract is the
  seam; flipping the env var swaps mock for real.
- Address / next-of-kin / state-of-origin extension to the NIN
  response payload — tracked in `011-figma-vs-api-gap-analysis.md` §3
  and §14.
- Force-approve override for super_admin — pending product decision.
