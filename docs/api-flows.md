# API flows

Practical walk-throughs of the most common end-to-end flows in
`reg-portal-api`. Each section: a brief explanation, then ordered HTTP
steps with `req` and `res` shapes (illustrative — full schemas live in
the swagger YAMLs under `docs/`).

All endpoints (unless marked **public**) require:

```
Authorization: Bearer <jwt>
```

Roles below are abbreviated:

- `inst` = `program_director` or `institution_admin`
- `registrar` = `registrar` / `admin` / `super_admin`
- `student` = a regular authenticated user (the candidate)

---

## 0. Auth: create user, log in, manage tokens

Every other flow starts here. The auth module supports email-or-phone
identifiers, JWT access + refresh tokens, OTP phone verification, and
password reset.

### Create user (sign-up)

```
POST /auth/register     (public)
```

`req`
```json
{
  "email": "candidate@example.com",
  "phone": "+2348000000000",
  "country_id": 566,
  "password": "S3curePass!",
  "first_name": "Adebayo",
  "last_name": "Salami",
  "role": "user",
  "referral_code": "OPTIONAL"
}
```

Validation:
- At least one of `email` or `phone` is required.
- `password` ≥ 8 chars.
- `first_name`, `last_name` required.
- `role` must be one of `super_admin`, `admin`, `agent`, `user`,
  `registrar`, `program_director`, `institution_admin`.
- `phone` (when provided) matches `^(\+)?\d{8,20}$`.

`res 201`
```json
{
  "success": true,
  "message": "User registered",
  "data": {
    "user": { "id": "uuid", "email": "candidate@example.com", "phone": "+2348000000000",
              "first_name": "Adebayo", "last_name": "Salami", "status": "active" },
    "access_token": "eyJhbGc...",
    "refresh_token": "eyJhbGc..."
  }
}
```
- `409` on duplicate email/phone.
- `422` on validation failures (each issue under `errors[]`).

If `phone` is provided, an OTP is dispatched (or mocked when
`USE_MOCK_OTP=true`, with `MOCK_OTP_CODE` as the expected value).
Verify with `POST /auth/verify-phone` (next).

### Verify phone (OTP)

```
POST /auth/verify-phone     (public)
```

`req`
```json
{ "phone": "+2348000000000", "otp": "123456" }
```

`res 200` — `phone_verified` flips `true`.
- `422` invalid OTP / phone mismatch.

To re-send the OTP: `POST /auth/resend-otp` with `{ "phone": "..." }`.

### Log in

```
POST /auth/login     (public)
```

`req`
```json
{ "identifier": "candidate@example.com", "password": "S3curePass!" }
```

`identifier` accepts either the user's email or phone.

`res 200`
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "...", "first_name": "...", "roles": ["user"] },
    "access_token": "eyJhbGc...",
    "refresh_token": "eyJhbGc..."
  }
}
```
- `401` on bad credentials.
- `403` if account is suspended/locked.

The access token is short-lived; pass it as `Authorization: Bearer
<access_token>` on every subsequent call. The refresh token is
long-lived and used only against `/auth/refresh-token`.

### Refresh access token

```
POST /auth/refresh-token     (public)
```

`req`
```json
{ "refresh_token": "eyJhbGc..." }
```

`res 200`
```json
{ "data": { "access_token": "eyJhbGc...", "refresh_token": "eyJhbGc..." } }
```

The refresh response may rotate the refresh token; replace the stored
value with whatever comes back.

### Log out

```
POST /auth/logout     (any authenticated user)
```

No body. `res 200` — server invalidates the refresh-token chain for
this session. Client should drop both tokens locally.

### Forgot password / reset

```
POST /auth/forgot-password     (public)
```

`req`
```json
{ "identifier": "candidate@example.com" }
```

`res 200` — always returns success (does not leak account existence);
when the identifier matches, a reset token is dispatched via email/SMS.

```
POST /auth/reset-password     (public)
```

`req`
```json
{ "token": "<reset-token>", "new_password": "Newpass123!" }
```

`res 200` — password is rotated; existing refresh tokens are revoked,
forcing re-login.

### Change password (logged-in)

```
POST /auth/change-password     (any authenticated user)
```

`req`
```json
{ "current_password": "S3curePass!", "new_password": "Newpass123!" }
```

`res 200` — password rotated. `422` if `current_password` is wrong.

### OAuth (social login)

The auth module also mounts OAuth routes at `/auth/...` (Google,
Facebook, GitHub, Twitter) under `routes/oauth.routes.js`. Initiate via
`GET /auth/{provider}` and the provider redirects back to
`GET /auth/{provider}/callback`, which mints the same `{ access_token,
refresh_token }` envelope as `/auth/login`.

---

## 0b. RBAC: roles, permissions, user assignment (admin)

The admin module exposes full CRUD for roles and permissions, plus
attach/detach for `role_permissions` and a single endpoint for
managing a user's role set. `admin@example.com` and `super_admin` users
can hit these endpoints.

`GET /users/me/permissions` continues to be the user-facing read for
the **current** user's resolved permissions.

### List roles

```
GET /admin/roles?page=1&limit=50     (admin)
```

`res 200` (paginated)
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "super_admin", "display_name": "Super Admin",
      "description": null, "is_system": true,
      "created_at": "...", "updated_at": "..." }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 12, "totalPages": 1 }
}
```

### Create role

```
POST /admin/roles     (admin)
```

`req`
```json
{ "name": "billing_clerk", "display_name": "Billing Clerk", "description": "Reads finance reports" }
```
`name` must be lowercase `snake_case`, 2–50 chars.

`res 201` — the created role; `is_system: false`.
- `409` if `name` already exists.
- `422` on validation failure.

### Get / patch / delete role

```
GET    /admin/roles/{roleId}
PATCH  /admin/roles/{roleId}    body: { name?, display_name?, description? }
DELETE /admin/roles/{roleId}
```

System roles (e.g. `admin`, `super_admin`) **cannot be deleted** and
**cannot be renamed**; only their `description` may be patched. Both
illegal operations return 422.

### Attach / detach a permission to a role

```
GET    /admin/roles/{roleId}/permissions
POST   /admin/roles/{roleId}/permissions/{permissionId}
DELETE /admin/roles/{roleId}/permissions/{permissionId}
```

Both attach + detach are idempotent. Responses include
`{ attached: true|false }` or `{ detached: true|false }`.

### List permissions

```
GET /admin/permissions?page=1&limit=100&resource=users     (admin)
```

`res 200` (paginated). Optional `?resource=` filter.

```
GET /admin/permissions?group_by=role     (admin)
```

`res 200` — a non-paginated array, one entry per role:
```json
{
  "success": true,
  "data": [
    {
      "role_id": "uuid", "role_name": "registrar", "display_name": "Registrar",
      "permissions": [
        { "id": "uuid", "name": "sessions:open", "resource": "sessions", "action": "open" }
      ]
    }
  ]
}
```

### Create permission

```
POST /admin/permissions     (admin)
```

`req`
```json
{
  "resource": "jupeb_registration",
  "action": "approve",
  "description": "Approve a registration after institution review"
}
```

`name` defaults to `resource:action` (e.g. `jupeb_registration:approve`)
and may be overridden in the body.

`res 201` — created permission.
- `409` on duplicate `name` or duplicate `(resource, action)`.

### Get / patch / delete permission

```
GET    /admin/permissions/{permissionId}
PATCH  /admin/permissions/{permissionId}    body: { name?, resource?, action?, description? }
DELETE /admin/permissions/{permissionId}
```

Deleting a permission cascades through `role_permissions` (FK ON DELETE
CASCADE), automatically detaching it from every role that held it.

### Assign / unassign roles for a user

```
GET   /admin/users/{userId}/roles      (admin)   — list current active roles
PATCH /admin/users/{userId}/roles      (admin)
```

`PATCH` accepts three mutually-compatible operations; provide one or
more:

| Field | Semantics |
|---|---|
| `role_ids: [uuid, ...]` | **Replace** — wipe the user's roles and set exactly this list. |
| `add: [uuid, ...]` | Additively grant these roles (idempotent on duplicates). |
| `remove: [uuid, ...]` | Revoke these roles (idempotent if absent). |

`req` (replace example)
```json
{ "role_ids": ["<role-uuid-A>", "<role-uuid-B>"] }
```

`req` (additive example)
```json
{ "add": ["<role-uuid-C>"], "remove": ["<role-uuid-A>"] }
```

`res 200` — the user's resulting **active** role rows (expired
assignments are filtered out).

- `404` if the user or any referenced role doesn't exist.
- `422` if no operation is provided or any uuid is malformed.

The `assigned_by` column is automatically set to the calling admin's
user id for audit. Each call is transactional (replace) or per-row
idempotent (add/remove).

---

## 1. Generating a candidate number

A JUPEB candidate number is two values: a **provisional** code allocated
when the institution creates the registration, and a **final** number
assigned by the registrar after the session is closed.

Final number format: `[YY][UniversityPrefix][Serial]` — e.g. `270010001`
for academic year 2026/27, university prefix `001`, serial `0001`.

### Step 1 — Session must be open

```
POST /sessions/{sessionId}/open       (registrar)
```

`req` (no body)
`res 200`
```json
{ "success": true, "data": { "id": "...", "status": "open", "...": "..." } }
```

### Step 2 — Institution creates a registration → provisional number issued

```
POST /registration/institution/registrations    (inst)
```

`req`
```json
{
  "session_id": "uuid",
  "university_id": "uuid",
  "subject_combination_id": "uuid",
  "nin_verification_id": "uuid"
}
```

`res 201`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "code_issued",
    "institution_issued_code": "F7K2P9",
    "provisional_serial": 1,
    "provisional_candidate_code": "270010001",
    "nin_verification": { "id": "uuid", "status": "pending" },
    "subject_combination": { "id": "uuid", "code": "SC-001", "title": "..." },
    "university": { "id": "uuid", "name": "University of Lagos", "jupeb_prefix": "001" },
    "session": { "id": "uuid", "academic_year": "2026/2027", "year_short": "27" }
  }
}
```

### Step 3 — Close the session when registration window ends

```
POST /sessions/{sessionId}/close      (registrar)
```

`res 200` — `data.status: "closed"`.

### Step 4 — Preview the final numbering (dry-run, no writes)

```
GET /registration/sessions/{sessionId}/numbering-preview     (registrar)
```

`res 200`
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "proposed": [
      { "registration_id": "uuid", "university_id": "uuid",
        "provisional_serial": 1, "proposed_jupeb_candidate_number": "270010001" }
    ],
    "conflicts": []
  }
}
```

### Step 5 — Assign the final candidate numbers (idempotent)

```
POST /sessions/{sessionId}/finalize-candidate-numbers     (registrar)
```

`res 200`
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "assigned": 1,
    "skipped": 0,
    "numbers": [
      { "registration_id": "uuid", "jupeb_candidate_number": "270010001" }
    ]
  }
}
```

The registration row's `jupeb_candidate_number` is now set. Re-running
the endpoint is a no-op for already-numbered rows.

---

## 2. CRUDing a session

A session is the academic-year window that gates registration. Only
**one** session can be `open` globally. Lifecycle: `draft → open →
closed → archived`. Reopen is allowed under `super_admin` only.

### Create

```
POST /sessions      (registrar)
```

`req`
```json
{
  "academic_year": "2026/2027",
  "year_short": "27",
  "opens_at": "2026-04-01T00:00:00Z",
  "closes_at": "2026-09-30T23:59:59Z",
  "candidate_info_cutoff_at": "2026-10-15T23:59:59Z",
  "profile_update_cutoff_at": "2026-10-30T23:59:59Z",
  "ca_cutoff_at": "2027-01-31T23:59:59Z",
  "max_ca_score": 30,
  "affiliation_fee_existing": 250000,
  "affiliation_fee_new": 1500000,
  "exam_fee_per_candidate": 50000,
  "description": "2026/2027 JUPEB Session"
}
```

Cutoff dates must satisfy `closes_at ≤ candidate_info_cutoff_at ≤
profile_update_cutoff_at ≤ ca_cutoff_at`. `max_ca_score` is bounded
0–100. `description` is an alias for `notes`.

`res 201` — body shape matches the `Session` schema in
`jupeb-002-sessions-swagger.yaml`.
- `409` if `academic_year` already exists.
- `422` for cutoff order, fee/score range violations.

### Read

| Verb | Path | Notes |
|---|---|---|
| `GET` | `/sessions` | Paginated. `?status=open|closed|...` |
| `GET` | `/sessions/{id}` | Single |
| `GET` | `/sessions/{id}/stats` | KPIs (see below) |
| `GET` | `/sessions/{id}/stats?previous_session_id={uuid}` | KPIs + per-metric `delta_pct` and direction (`up`/`down`/`flat`) |
| `GET` | `/sessions/export` | CSV stream of all sessions, registrar-only |

`GET /sessions/{id}/stats` `res 200`
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "total_registrations": 256,
    "registrations_by_status": { "code_issued": 12, "approved": 200, "rejected": 44 },
    "institutions_count": 119,
    "subject_combinations_count": 1,
    "candidates_with_biometrics": 200,
    "candidates_without_biometrics": 56
  }
}
```

With `?previous_session_id=...`, the response also includes a `deltas`
block:
```json
{
  "deltas": {
    "total_registrations": { "value": 256, "previous": 222, "delta_pct": 15.31, "direction": "up" }
  }
}
```

### Update

```
PATCH /sessions/{id}     (registrar)
```

Patchable fields depend on status. `closed` sessions only accept `notes`.

### Lifecycle transitions

```
POST /sessions/{id}/open         draft → open       (registrar)
POST /sessions/{id}/close        open → closed      (registrar)
POST /sessions/{id}/reopen       closed → open      (super_admin)
```

`409` on `/open` if another session is already open.

### Delete

Not supported; archive a session by closing it. Hard delete would
violate the audit/finalization invariants.

---

## 3. CRUDing an institution

"Institution" maps to `jupeb_universities`. A JUPEB prefix (3 digits) is
unique per institution and feeds the candidate-number formula.

### Create

```
POST /catalog/universities      (registrar)
```

`req`
```json
{
  "code": "UNILAG",
  "name": "University of Lagos",
  "short_name": "UniLag",
  "jupeb_prefix": "001",
  "university_type": "federal",
  "email": "registry@unilag.edu.ng",
  "address": "Akoka, Yaba, Lagos",
  "phone": "+234 813 978 0233",
  "expected_candidate_count": 2000,
  "description": "Flagship institution",
  "metadata": {}
}
```

`res 201` — `data` is the full `University` row.
- `422` for malformed email, negative capacity, bad prefix format.
- `409` if `code` or `jupeb_prefix` collides.

### Bulk create

```
POST /catalog/universities/bulk      (registrar)
Content-Type: text/csv
```

`req` (CSV body)
```
code,name,jupeb_prefix,university_type,email,phone,expected_candidate_count,description
UNILAG,University of Lagos,001,federal,registry@unilag.edu.ng,+2348139780233,2000,...
UNN,University of Nigeria,002,federal,registry@unn.edu.ng,+2348011112222,1500,...
```

`res 200` — per-row outcomes:
```json
{
  "success": true,
  "data": {
    "total": 2,
    "succeeded": 2,
    "failed": 0,
    "outcomes": [
      { "row": 1, "ok": true, "data": { "id": "...", "code": "UNILAG", "...": "..." } },
      { "row": 2, "ok": true, "data": { "id": "...", "code": "UNN", "...": "..." } }
    ]
  }
}
```

### Read

| Verb | Path | Notes |
|---|---|---|
| `GET` | `/catalog/universities/public` | **public** — active only; supports `?type=federal|state|private` |
| `GET` | `/catalog/universities` | Paginated admin list |
| `GET` | `/catalog/universities/{id}` | Single (admin) |

### Update

```
PATCH /catalog/universities/{id}     (registrar)
```

`req`
```json
{ "phone": "+234 900 000 0000", "expected_candidate_count": 2500 }
```

`res 200` — full `University` row.

### Activate / deactivate

```
POST /catalog/universities/{id}/activate     (registrar)
POST /catalog/universities/{id}/deactivate   (registrar)
```

Toggles `status`. No hard delete — soft-archive via `deleted_at` is the
durable strategy if needed.

---

## 4. CRUDing a subject and subject combination

Subjects are first-class as of migration 013. A combination references
3–6 subjects via `jupeb_subject_combination_items` (migration 016). The
legacy JSONB `subjects` column on combinations was removed in migration
017 — `subject_items[]` is the single source of truth.

### Subjects — create

```
POST /catalog/subjects     (registrar)
```

`req`
```json
{ "code": "MTH", "name": "Mathematics", "description": "Pure and applied" }
```

`res 201`
```json
{ "success": true, "data": { "id": "uuid", "code": "MTH", "name": "Mathematics", "status": "active" } }
```

- `409` if a subject with this code (case-insensitive) already exists.
- `422` if `code` or `name` missing / `code` > 20 chars.

### Subjects — bulk

```
POST /catalog/subjects/bulk     (registrar)
Content-Type: text/csv
```

`req`
```
code,name,description
MTH,Mathematics,Pure and applied
PHY,Physics,
CHE,Chemistry,
```

`res 200` — same `BulkResult` shape as institutions (`total`,
`succeeded`, `failed`, `outcomes[]`).

### Subjects — read / update / activate / deactivate

| Verb | Path | Notes |
|---|---|---|
| `GET` | `/catalog/subjects/public` | **public** — active only |
| `GET` | `/catalog/subjects` | Paginated |
| `GET` | `/catalog/subjects/{id}` | Single |
| `PATCH` | `/catalog/subjects/{id}` | Update name / code / description |
| `POST` | `/catalog/subjects/{id}/activate` | Set `active` |
| `POST` | `/catalog/subjects/{id}/deactivate` | Set `inactive` |

---

### Subject combinations — create (auto-derive code/title)

```
POST /catalog/subject-combinations     (registrar)
```

`req` (minimal — figma form sends only the three subject pickers)
```json
{
  "subjects": ["MTH", "PHY", "CHE"],
  "is_global": true
}
```

The service:
1. Validates 3–6 unique subjects.
2. Resolves each entry against `jupeb_subjects` (by code, then by name).
   - With `JUPEB_ENFORCE_SUBJECT_CATALOG=true`, missing entries return 422.
   - Otherwise, missing entries are auto-created as `{ code: UPPER(input), name: input }`.
3. Auto-derives `code` from sorted subject codes (`CHE-MTH-PHY`) with a
   `-1`, `-2`… suffix on collision.
4. Auto-derives `title` from sorted subject names (`Chemistry, Mathematics, Physics`).
5. Inserts the combination row + `jupeb_subject_combination_items` in
   lockstep.

`res 201`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "code": "CHE-MTH-PHY",
    "title": "Chemistry, Mathematics, Physics",
    "is_global": true,
    "university_id": null,
    "status": "active",
    "subject_items": [
      { "id": "uuid", "position": 0, "subject_id": "uuid", "code": "CHE", "name": "Chemistry" },
      { "id": "uuid", "position": 1, "subject_id": "uuid", "code": "MTH", "name": "Mathematics" },
      { "id": "uuid", "position": 2, "subject_id": "uuid", "code": "PHY", "name": "Physics" }
    ]
  }
}
```

Caller may still supply `code` and/or `title` to override the derivation.

### Subject combinations — bulk

```
POST /catalog/subject-combinations/bulk     (registrar)
Content-Type: text/csv
```

CSV columns: `subjects` (separator `,` `;` or `|` inside the cell),
optional `code`, `title`, `is_global`, `university_id`.

```
subjects,is_global
"MTH,PHY,CHE",true
"ENG;LIT;HIS",true
```

### Subject combinations — read / update / activate / deactivate

| Verb | Path | Notes |
|---|---|---|
| `GET` | `/catalog/subject-combinations/public` | **public** — supports `?university_id` |
| `GET` | `/catalog/subject-combinations` | Paginated |
| `GET` | `/catalog/subject-combinations/{id}` | Includes `subject_items[]` |
| `PATCH` | `/catalog/subject-combinations/{id}` | Sending `subjects` re-resolves and replaces the join rows in lockstep |
| `POST` | `/catalog/subject-combinations/{id}/activate` | |
| `POST` | `/catalog/subject-combinations/{id}/deactivate` | |

---

## 5. Registering a new candidate

Two halves to this flow: the **institution** seeds the candidate's
record and the **candidate** completes registration via the mobile app.

```
   Institution portal              Mobile app (candidate)
   ---------------------           --------------------------
   1. Verify NIN
   2. Generate code            →   3. Sign in / sign up
                                   4. Pre-validate code (optional)
                                   5. Claim code
                                   6. Review profile
                                   7. Update bio fields
                                   8. Confirm subjects
                                   9. Upload documents
                                  10. Capture biometrics
                                  11. Submit for review     →
  12. Approve (or reject)
                                  13. Dashboard unlocks
```

### Institution: 1 — Verify NIN (capture intake fields up-front)

```
POST /identity/nin/verify     (inst)
```

`req`
```json
{
  "nin": "12345678901",
  "idempotency_key": "register-2026-04-12-1",
  "intake_payload": {
    "name": "Adebayo Salami",
    "email": "adesalam@example.com",
    "phone": "+2348000000000",
    "subject_combination_id": "uuid"
  }
}
```

`res 200` — three possible shapes:
- **verified** (provider responded):
  ```json
  { "data": { "verification_id": "uuid", "status": "verified",
              "profile": { "first_name": "...", "address": "...", "next_of_kin": { "name": "..." }, "...": "..." } } }
  ```
- **failed** (provider rejected the NIN — terminal):
  ```json
  { "data": { "verification_id": "uuid", "status": "failed", "error": { "code": "invalid_nin", "message": "..." } } }
  ```
- **pending** (provider unavailable — no need to retry the form):
  ```json
  { "data": { "verification_id": "uuid", "status": "pending",
              "retry_after": "2026-05-03T18:00:00Z", "last_error_code": "provider_unavailable" } }
  ```

A background resolver (and `POST /identity/nin/verifications/{id}/retry`)
flips pending → verified or failed asynchronously. Webhooks
`jupeb.nin.verified` / `jupeb.nin.failed` fire on resolution.

### Institution: 2 — Generate the candidate code

```
POST /registration/institution/registrations     (inst)
```

`req`
```json
{
  "session_id": "uuid",
  "university_id": "uuid",
  "subject_combination_id": "uuid",
  "nin_verification_id": "uuid"
}
```

`res 201`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "code_issued",
    "institution_issued_code": "F7K2P9",
    "provisional_candidate_code": "270010001",
    "nin_verification": { "id": "uuid", "status": "pending" },
    "subject_combination": { "id": "uuid", "code": "SC-001", "title": "..." },
    "university": { "id": "uuid", "name": "...", "jupeb_prefix": "001" },
    "session": { "id": "uuid", "academic_year": "2026/2027", "year_short": "27" }
  }
}
```

Hand `institution_issued_code` to the candidate.

### Candidate: 3 — Sign in (or sign up)

Standard JWT login: `POST /auth/login` with `{ identifier, password }`,
returns `{ access_token, refresh_token }`.

### Candidate: 4 — Pre-validate the code (read-only, optional)

```
GET /registration/me/code-status?code=F7K2P9     (student)
```

`res 200`
```json
{ "data": { "valid": true, "university_name": "University of Lagos",
            "expires_at": "2026-09-30T23:59:59Z",
            "university": { "id": "uuid", "name": "University of Lagos", "jupeb_prefix": "001" } } }
```
Or, on a bad code:
```json
{ "data": { "valid": false, "error_code": "code_expired", "expires_at": "2026-04-01T00:00:00Z" } }
```

### Candidate: 5 — Claim the code

```
POST /registration/me/claim-code     (student)
```

`req`
```json
{ "institution_issued_code": "F7K2P9" }
```

`res 200` — registration row, now bound to the user, status `claimed`.
- `409` if already claimed.
- `410` if expired:
  ```json
  { "success": false, "message": "This institution code has expired",
    "details": { "error_code": "code_expired", "expires_at": "2026-04-01T00:00:00Z" } }
  ```

### Candidate: 6 — Review the pre-filled profile

```
GET /registration/me/profile     (student)
```

`res 200` — composite read joining users + profiles + the NIN verification
+ registration + subject combination + university + session. When the
NIN row is `pending`, NIN-derived fields fall back to the cached
`intake_payload` so the candidate sees their typed-in values immediately.

```json
{
  "data": {
    "candidate": { "id": "uuid", "full_name": "Adebayo Salami",
                   "provisional_candidate_code": "270010001", "photo_url": null, "status": "claimed" },
    "basic_information": { "date_of_birth": "1999-01-01", "gender": "male",
                           "residential_address": "...", "state_of_origin": "Ondo State",
                           "lga": "Ondo West", "place_of_birth": "Lagos State" },
    "contact_information": { "email": "adesalam@example.com", "phone": "+2348000000000" },
    "next_of_kin": { "name": "Jane Johnson", "relationship": "Mother", "contact": "+2348023456789" },
    "subject_combination": { "id": "uuid", "code": "SC-001", "title": "..." },
    "university": { "id": "uuid", "name": "...", "jupeb_prefix": "001" },
    "session": { "id": "uuid", "academic_year": "2026/2027", "year_short": "27" },
    "nin_verification": { "id": "uuid", "status": "verified" }
  }
}
```

### Candidate: 7 — Capture sittings + result types

```
PATCH /registration/me/academic-intake     (student)
```

`req`
```json
{ "sittings_count": 2, "result_types": ["waec", "neco"] }
```

`res 200` — updated registration row.

### Candidate: 8 — Confirm the subject combination

```
POST /registration/me/confirm-subjects     (student)
```

`req` (no body to confirm-as-is, or override):
```json
{ "subject_combination_id": "uuid" }
```

`res 200` — registration transitions `claimed` → `pending_documents`.
The figma copy says the student can't change the combination at this
stage; if so, omit the body.

### Candidate: 9 — Upload documents

```
POST /submission/me/documents     (student)
```

`req`
```json
{ "requirement_id": "uuid", "file_id": "uuid", "registration_id": "uuid" }
```

(Files first uploaded via `POST /files`.) `res 201` — document row.

Repeat for each requirement (e.g. WAEC, NECO).

### Candidate: 10 — Biometrics (or skip)

```
POST /identity/biometrics     (student)
```

`req`
```json
{
  "registration_id": "uuid",
  "capture_type": "face",
  "external_reference": "vault-face-1",
  "quality_score": 0.92
}
```

`res 201`. Below the `JUPEB_FACE_MIN_QUALITY` threshold, returns 422.

To skip:

```
POST /identity/registrations/{registrationId}/biometrics/skip     (student)
```

`req`
```json
{ "capture_type": "fingerprint" }
```

`res 200` — sets `fingerprint_skipped_at`. Subsequent self-service
captures of that type return 403; institution roles can still capture
on the candidate's behalf.

To replace later:

```
PUT /identity/biometrics/{captureId}     (student or inst)
```

Soft-archives the old row and inserts a new active capture.

### Candidate: 11 — Submit for review

```
POST /registration/me/submit     (student)
```

`res 200` — registration transitions to `pending_institution_review`.
Optional aggregated preview:

```
GET /registration/me/submission-preview     (student)
```

returns the figma "Submit Details" payload with documents (download
URLs) and biometric coverage status.

### Institution: 12 — Approve (or reject)

```
POST /registration/institution/registrations/{registrationId}/approve     (inst)
```

`res 200` — registration transitions to `approved`,
`dashboard_unlocked_at` is set.

**NIN gate**: if the linked NIN verification is still `pending` or
`failed`, this returns 422 with a message naming the current NIN status.
Clear the gate via `POST /identity/nin/verifications/{id}/retry`.

Reject path:

```
POST /registration/institution/registrations/{registrationId}/reject     (inst)
```

`req`
```json
{ "reason": "Incomplete WAEC scan" }
```

`res 200` — status `rejected`, `status_reason` set.

### Candidate: 13 — Dashboard unlocked

```
GET /registration/me/dashboard-access     (student)
```

`res 200`
```json
{ "data": { "registration_id": "uuid", "locked": false,
            "unlocked_at": "2026-05-03T12:00:00Z", "status": "approved" } }
```

The candidate is now in the academic dashboard (Home / Profile /
Courses / Result tabs in the figma). After session close + finalize,
their `jupeb_candidate_number` is set as well (see Flow 1).
