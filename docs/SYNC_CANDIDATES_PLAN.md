# Candidates for the exam delivery system: plan

**Status:** plan for review (2026-09-27). Nothing is built yet.

**Scope:** `reg-portal-api`.

## 1. The request

The exam delivery system (the Exam Solution) needs to pull approved JUPEB candidates from the Reg Portal. The proposed endpoint is `GET /sync/candidates` (contract **B3** in `sib-ms/EXAM_SOLUTION_INTERFACES.md` §3.4). Per candidate it needs:

- **Name**
- **The finalized `jupeb_candidate_number`**, with `final_numbers_generated_at` so that only the approved, finalized bucket is taken
- **The subject combination as actual subject codes**, not just the combination label
- **Centre code** and **exam session code**. These are not returned today, and the request calls this a gap, not a nice-to-have.

**Interim flow, until B3 exists:**
1. The Exam Solution resolves the academic year to a `session_id` through `GET /sessions` (B1).
2. It requires `final_numbers_generated_at` to be set on that session.
3. It calls `GET /institution/registrations?session_id=…&bucket=approved` (B2).

## 2. What the Reg Portal has

| Needed | Where it lives today | Status |
|---|---|---|
| Name | `users` / `profiles` (`first_name`, `last_name`, `display_name`), already returned by B2 | ✅ |
| `jupeb_candidate_number` | `jupeb_registrations.jupeb_candidate_number` | ✅ |
| `final_numbers_generated_at` | `jupeb_registration_sessions.final_numbers_generated_at`. Until it is set, numbers are provisional and will change. | ✅ as a filter and a field |
| Approved bucket | `jupeb_registrations.status` (B2's `bucket=approved`) | ✅ |
| Subject codes | `jupeb_registrations.subject_combination_id` → `jupeb_subject_combination_items` (ordered by `position`) → `jupeb_subjects.code` | ✅ derivable. B2 returns only `{ code, title }` of the combination. |
| Centre code | **Nothing.** The Reg Portal has no centres and no candidate-to-centre assignment. The only place-like data is the candidate's university (`jupeb_universities.code`, `short_name`). | ❌ needs a decision (D1) |
| Exam session code | **Nothing.** Registration sessions have `academic_year` (for example `2025/2026`) and `year_short`, but no code. | ❌ needs a decision (D2) |

**Existing mechanics to reuse:**
- **API-key auth:** `Authorization: Bearer sk_live_…`. It authenticates as the key's owning user, with that user's permissions.
- **The `requirePermission(...)` guard.**
- **The `sendPaginated` response envelope.**
- **B2's query** (`registrationService.institutionList`), which joins registrations to the candidate, university and combination. B2 is **scoped to the caller's institution** and falls back to the caller's "currently viewed" session when `session_id` is omitted. A system feed must do neither.

## 3. Plan

### 3.1 `GET /sync/candidates`: a new, system-wide, read-only feed

```http
GET /sync/candidates?academic_year=2025/2026&page=1&limit=200
Authorization: Bearer sk_live_…
```

| Param | Behaviour |
|---|---|
| `academic_year` or `session_id` | **Required.** One or the other. The year resolves to its session on the server, so there is no implicit "viewed session" fallback. |
| `university_id` | Optional. When absent, the feed covers **all institutions**; this is the difference from B2. |
| `updated_since` | Optional (ISO 8601), on `jupeb_registrations.updated_at`, for incremental pulls. It needs an index. |
| `page` / `limit` | Defaults `1` / `100`, capped at `200`. |

**Always applied, not optional:**
- only the **approved** bucket;
- only sessions with **`final_numbers_generated_at` set**. A session that isn't finalized answers `409 SESSION_NOT_FINALIZED`, instead of returning provisional numbers;
- only candidates **with** a `jupeb_candidate_number`.

**Permission:** a new permission, `candidate.sync`, held by a dedicated service user whose API key the Exam Solution uses. Institution users don't get it, so B2 stays institution-scoped and B3 is program-wide.

**Response:**

```jsonc
{
  "success": true,
  "data": [{
    "registration_id": "a71c…",
    "jupeb_candidate_number": "JB/UNILAG/2026/00123",
    "name": "Amina Okafor", "first_name": "Amina", "last_name": "Okafor",
    "session": {
      "id": "3c9e…", "academic_year": "2025/2026",
      "exam_session_code": "JUPEB26",                  // D2
      "final_numbers_generated_at": "2026-02-02T10:00:00Z"
    },
    "centre": { "code": "UNILAG", "name": "University of Lagos" },   // D1
    "university": { "id": "1b4f…", "code": "UNILAG", "name": "University of Lagos" },
    "subject_combination": {
      "code": "JUPEB SC-001", "title": "CRS, Government, Literature",
      "subjects": [ { "code": "CRS", "name": "Christian Religious Studies", "position": 1 }, … ]
    },
    "subject_codes": ["CRS", "GOV", "LIT"],            // the Reg Portal's subject codes
    "approved_at": "…", "updated_at": "…"
  }],
  "pagination": { "page": 1, "limit": 200, "total": 4820, "totalPages": 25 }
}
```

- **Idempotency key:** `jupeb_candidate_number`, always present on this feed.
- **PII** is limited to what the Exam Solution asked for: name. No email, phone, NIN or biometrics.

### 3.2 Build

1. **Service:** `candidateSync.service.js`. It resolves the session and enforces the finalized gate, then builds one query over registrations with the candidate name, university, combination and ordered subject codes (a lateral `json_agg` over `jupeb_subject_combination_items` → `jupeb_subjects`). It applies the approved and numbered filters, `university_id` and `updated_since`, and pages the result.
2. **Route and controller:** `GET /sync/candidates`, behind `requireAuth` + `requirePermission('candidate.sync')`.
3. **Migration:**
   - the `candidate.sync` permission;
   - an index on `jupeb_registrations(session_id, status, updated_at)`;
   - whatever D1/D2/D3 need.
4. **Tests,** in the style of `src/tests/jupeb.*.api.test.js`:
   - the finalized gate (409);
   - only approved and numbered candidates are returned;
   - subject codes come out in combination order;
   - the feed covers all institutions without `university_id`;
   - `updated_since` and paging work;
   - an API key without `candidate.sync` gets 403.
5. **Docs:**
   - OpenAPI (`openapi.yaml`/`.json`);
   - the interim flow above;
   - B3 in `EXAM_SOLUTION_INTERFACES.md`, marked as implemented.

## 4. Decisions needed

| # | Question | Options / recommendation |
|---|---|---|
| D1 | **Centre code.** The Reg Portal has no centres. What is a JUPEB candidate's centre? | (a) **The candidate's university**: JUPEB candidates sit at their study centre, so `centre.code = jupeb_universities.code`. This needs no new data, and I recommend it if true. (b) A real centre assignment, with a centre per university or per candidate, synced from AutoTest's centre list (`GET /centres`, A1). That means new tables and a way to assign. (c) The Exam Solution assigns centres itself, and the Reg Portal doesn't send them. |
| D2 | **Exam session code.** What should it be? | (a) Derived from the registration session, for example `JUPEB` + `year_short` (`JUPEB26`), or the `academic_year`. (b) A new `exam_session_code` column on `jupeb_registration_sessions`, set by admins. Does the Exam Solution expect a particular format? |
| D3 | **Subject codes.** Are the Reg Portal's codes (`ACC`, `BIO`, `VSA`…) the ones the Exam Solution uses? | If they are, send them as they are. If it uses a different list (for example SIB's subject codes), a mapping is needed. |
| D4 | Is a dedicated service user and API key with only `candidate.sync` acceptable? | Recommended. Keys have no scopes, so a key inherits its user's permissions. |
| D5 | Branch | `master` and `main` are the same commit. Build on `feature/sync-candidates` from `main`? |
