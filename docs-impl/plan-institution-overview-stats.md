# Plan: Improve `GET /registration/institution/overview/stats`

## Goal

Enhance [`GET /registration/institution/overview/stats`](src/modules/jupeb/routes/registration.routes.js) so institution dashboards get **percentage growth vs the previous registration session** and **counts aligned** with the program dashboard logic, **without** embedding time-series or other widgets in this response (those stay on existing [`/dashboard/*`](src/modules/jupeb/routes/dashboard.routes.js) routes).

**User scope choice:** deltas + alignment only; chart / quick stats / scope remain separate calls.

## Current gaps

1. **No `delta_pct`:** Response is flat counts only (`total`, `approved`, `pending`, `rejected`, `with_biometrics`).
2. **Semantic drift vs [`dashboard.service` `kpiCounts`](src/modules/jupeb/services/dashboard.service.js):**
   - Overview [`statsInstitution`](src/modules/jupeb/models/registration.model.js): `total` is raw `COUNT(*)` (includes **withdrawn**); pending list omits **`provisional`**; biometrics use `LEFT JOIN` without **`replaced_at IS NULL`** (can diverge from dashboard).
   - Dashboard: `total` excludes withdrawn; pending uses full `PENDING_STATUSES`; biometrics use `EXISTS` with `replaced_at IS NULL`.

Aligning overview stats removes mismatches between top cards and sidebar when the UI mixes sources.

## Proposed API shape (backward compatible)

Keep existing top-level keys as the **current session** (aligned) counts so existing clients keep working:

- `total`, `approved`, `pending`, `rejected`, `with_biometrics`

Add:

- `compared_to`: `{ session_id, label } | null` — previous session used for deltas (same idea as [`getStatCards`](src/modules/jupeb/services/dashboard.service.js) `compared_to`).
- `growth` (or `cards`) — per-metric objects for the UI arrows, mirroring dashboard:

  ```json
  "growth": {
    "total_registered": { "value": 8, "delta_pct": 200.0 },
    "approved": { "value": 4, "delta_pct": null },
    "pending": { "value": 3, "delta_pct": 100.0 },
    "with_biometrics": { "value": 3, "delta_pct": 0.0 }
  }
  ```

- **`rejected`:** include in flat `rejected` count; optional `growth.rejected` with `delta_pct` if product wants parity (dashboard stat-cards do not expose rejected card — add only if needed for UI).

`delta_pct` rules: reuse [`deltaPct`](src/modules/jupeb/services/dashboard.service.js) (previous `null`/`undefined` → `null`; previous `0` and current `0` → `0`; previous `0` and current `>0` → `null` for “infinite %”, same as stat-cards).

## Session resolution for comparison

Match dashboard behavior:

1. **Current session:** If query `session_id` is present, use that row; else resolve “open session first, else latest by `opens_at`” (same as [`resolveSession`](src/modules/jupeb/services/dashboard.service.js) when called with `null` — may need to export or duplicate minimal query in registration layer).
2. **Previous session:** `opens_at < current.opens_at` order by `opens_at` desc limit 1 ([`findPreviousSession`](src/modules/jupeb/services/dashboard.service.js)).

If there is **no** current session row in DB, return counts with zeros/nulls and `compared_to: null`, `growth.*.delta_pct: null`.

## Implementation approach

### 1. Single source of truth for KPI SQL

- Extract shared **institution + session scoped** KPI query from `kpiCounts` into a small module (e.g. `src/modules/jupeb/services/institution-registration-metrics.js` or `utils/registration-kpi.js`) exporting:
  - `PENDING_STATUSES` (or import from one place),
  - `kpiCounts({ university_id, session_id })` — same SQL as current dashboard `kpiCounts` (parameterize `university_id` optional for reuse; registration overview always passes scoped university from service).
- Update [`registrationModel.statsInstitution`](src/modules/jupeb/models/registration.model.js) to **delegate** to that helper **or** replace its body with the same SQL so E.4 and dashboard stay identical.

### 2. Service layer

- [`registrationService.institutionStats`](src/modules/jupeb/services/registration.service.js):
  - Resolve `currentSession` and `previousSession` (shared helpers or thin duplicate of dashboard session queries to avoid circular `registration` → `dashboard` dependency).
  - `current = kpiCounts(scopedUniversityId, currentSession?.id)`
  - `previous = previousSession ? kpiCounts(scopedUniversityId, previousSession.id) : null`
  - Map to response: flat fields from `current` + `rejected` (add `rejected` to shared KPI query if not already in `kpiCounts` — **note:** dashboard `kpiCounts` does **not** include `rejected`; overview today **does**. Extend shared SQL to also return `rejected` count for overview compatibility.)
- Add `rejected` to the shared SELECT with `COUNT(*) FILTER (WHERE r.status = 'rejected')` so one query returns all overview fields.

### 3. Refactor dashboard (optional but recommended)

- Change [`dashboard.service.js`](src/modules/jupeb/services/dashboard.service.js) `kpiCounts` to import from the new shared module so behavior cannot drift.

### 4. Docs and tests

- Update [`docs/jupeb-005-registration-swagger.yaml`](docs/jupeb-005-registration-swagger.yaml) (and [`docs/api-flows.md`](docs/api-flows.md) if there is an E.4 row) with new fields and semantics (`total` excludes withdrawn, pending includes provisional, biometrics rule).
- Extend [`src/tests/jupeb.registration.institution-list.api.test.js`](src/tests/jupeb.registration.institution-list.api.test.js) E.4 test: assert `growth` / `compared_to` when two sessions exist (seed or use existing fixtures).

## Out of scope (per user)

- Registration trends time series → keep `GET /dashboard/registration-trends?university_id=&session_id=`.
- Active session label / university header → keep `GET /dashboard/scope` or `GET /dashboard/quick-stats` as today.

## Files likely touched

| File | Change |
|------|--------|
| New: `src/modules/jupeb/.../registration-kpi.js` (name TBD) | Shared `kpiCounts` + `rejected`, pending list, withdrawn-safe total, biometric EXISTS |
| [`registration.model.js`](src/modules/jupeb/models/registration.model.js) | `statsInstitution` uses shared helper OR thin wrapper |
| [`registration.service.js`](src/modules/jupeb/services/registration.service.js) | Session resolve + previous + assemble `growth` / `compared_to` |
| [`dashboard.service.js`](src/modules/jupeb/services/dashboard.service.js) | Import shared `kpiCounts` |
| Swagger + api-flows + institution-list API test | Contract + regression |

## Execution

**Status:** Implemented (shared `registration-kpi.service.js`, enriched `institutionStats`, dashboard refactor, swagger, tests).
