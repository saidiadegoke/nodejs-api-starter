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

### OTP — request a code

```
POST /auth/resend-otp     (public)
```

`req` (any of `identifier` / `email` / `phone` works; `channel` is optional)
```json
{ "identifier": "candidate@example.com", "channel": "email" }
```

Channel resolves from `body.channel` → env `OTP_CHANNEL` → default
`email`. Allowed values: `email`, `sms`, `both`.

`res 200`
```json
{
  "data": {
    "sent": true,
    "channels": ["email"],
    "expires_at": "2026-05-12T10:00:00.000Z",
    "masked_recipient": "ca***@example.com"
  }
}
```

The 6-digit code is hashed (sha256) and stored on `otp_codes`; raw
code only lives in the recipient's inbox / SMS. Dispatch is
fire-and-forget — the response returns immediately, SMTP / SMS RTT
happens in the background.

**Account-enumeration safe** — unknown identifiers return the same
shape with `masked_recipient` synthesized from the supplied value.

### Verify the OTP

```
POST /auth/verify-phone     (public — name is legacy; works for email OTP too)
```

`req` (legacy `phone` field still accepted; `identifier` preferred)
```json
{ "identifier": "candidate@example.com", "otp": "374921" }
```

`res 200`
```json
{ "data": { "verified": true, "user_id": "uuid", "channel": "email" } }
```

The channel the OTP was issued on determines which flag flips on the
user row: `email` → `email_verified=true`; `sms` → `phone_verified=true`;
`both` → both.

Error shapes (all carry `details.error_code`):
- `400 invalid_otp` — wrong code; `attempt_count` increments
- `410 otp_expired_or_missing` — no active OTP for the user
- `410 otp_expired` — code is past its TTL
- `422 otp_required` / `otp_invalid_format` — body validation
- `429 too_many_attempts` — 5 wrong attempts; user must request a new code

### Log in

```
POST /auth/login     (public)
```

`req` (the `identifier` field accepts four shapes)
```json
{ "identifier": "UI/2024/12345", "password": "S3curePass!" }
```

Identifier shapes accepted:
- Email (case-insensitive)
- Phone (E.164)
- `jupeb_registrations.provisional_candidate_code` — the interim
  9-digit reg number issued at code-issued time
- `jupeb_registrations.jupeb_candidate_number` — the final matric
  number (alphanumeric + `/`, `-`, `_`)

**Matric lockdown.** Once a candidate has a `jupeb_candidate_number`
assigned to any of their registrations, **email / phone / reg-code
stop resolving** to them — only matric works. Admins, registrars,
program-directors and institution-admins bypass the lockdown.

`res 200`
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGc...",
    "refresh_token": "eyJhbGc...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "user": {
      "user_id": "uuid",
      "email": "...",
      "first_name": "Adunni",
      "last_name": "Yusuf",
      "roles": ["student"],
      "verified": false
    },
    "registration": {
      "id": "uuid",
      "status": "pending_documents",
      "provisional_candidate_code": "261010001",
      "jupeb_candidate_number": null,
      "claimed_at": "2026-03-01T...",
      "submitted_at": null,
      "approved_at": null,
      "dashboard_unlocked": false,
      "next_step": "upload_documents"
    }
  }
}
```

The `registration` block embeds the user's latest JUPEB registration
so mobile clients don't need a follow-up `/registration/me/current`
call to route on app boot. `next_step` maps status → route hint:

| Status | `next_step` |
|---|---|
| `code_issued` | `claim_code` |
| `claimed` / `pending_student_confirm` | `confirm_subjects` |
| `pending_documents` | `upload_documents` |
| `pending_institution_review` | `await_review` |
| `approved` | `view_dashboard` |
| `rejected` | `view_rejection` |
| `withdrawn` | `restart` |

Users without a registration (admins, etc.) get `"registration": null`
— the field is always present.

- `401` on bad credentials. Wrong identifier and wrong password
  return the same shape so account existence isn't leaked.

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

### Email verification link

Separate from OTP — this is a clickable link delivered to the user's
inbox, used to mark `users.email_verified = true`.

```
POST /auth/send-verification        (authenticated)
POST /auth/resend-verification      (authenticated; alt template)
```

Issues a random verification token, stores only its sha256 hash on
`users.email_verification_token_hash`, sets
`email_verification_expires_at` (TTL controlled by
`EMAIL_VERIFICATION_TTL_HOURS`, default 24h), and fires the
verification email. Resend invalidates the prior token.

`res 200`
```json
{ "data": { "sent": true, "expires_at": "2026-05-13T11:00:00.000Z" } }
```

The user clicks the link in their inbox, which hits:

```
GET  /auth/verify-email?token=<...>     (public)
POST /auth/verify-email                 (public — SPA variant; body: { token })
```

`res 200`
```json
{ "data": { "id": "uuid", "email": "...", "email_verified": true } }
```

Error shapes:
- `400 invalid_token` — token doesn't match any user
- `410 token_expired` — past the TTL
- `422 token_required` — no token supplied

Clicking the same link twice is idempotent (returns 200).

### Code status (pre-validate a JUPEB code)

```
GET /auth/code-status?code=ABC123     (public)
```

The mobile / web client calls this when the student types their
institution-issued code. The response tells the client which UI to
show next:

```json
{
  "data": {
    "valid": false,
    "error_code": "code_already_claimed",
    "expires_at": "2026-05-30T...",
    "university": { "id": "uuid", "name": "University of Lagos", "short_name": "UNILAG" },
    "account": {
      "exists": true,
      "active": true,
      "email_masked": "ad***@example.com",
      "phone_masked": "+234803***5678",
      "email_verified": false,
      "phone_verified": false,
      "can_login": true
    }
  }
}
```

| State | `valid` | `error_code` | `account` | Client behaviour |
|---|---|---|---|---|
| Unknown code | `false` | `code_not_found` | — | "Invalid code" error |
| Expired code | `false` | `code_expired` | — | "Expired — contact institution" |
| Claimable | `true` | — | — | Route to **Create account** screen (`/auth/register-with-code`) |
| Used, account active | `false` | `code_already_claimed` | populated | Route to **Log in** screen; prefill identifier with `email_masked` |
| Used, account suspended | `false` | `code_already_claimed` | `active: false` | "Account disabled — contact support" |

Raw email / phone never leak — only masked values.

### Register with an institution code (single-shot signup)

```
POST /auth/register-with-code     (public)
```

The companion to `GET /auth/code-status`. After the pre-validation
call confirms the code is claimable, the client posts the code +
chosen password to mint the account and bind it to the
pre-loaded `jupeb_registrations` row in a single round-trip.

`req`
```json
{
  "code": "F7K2P9",
  "password": "S3curePass!",
  "email": "candidate@example.com",
  "phone": "+2348000000000",
  "first_name": "Adebayo",
  "last_name": "Salami"
}
```

`code` + `password` are required; the contact / name fields are
optional overlays on whatever the institution pre-seeded. The
endpoint also implements the same honeypot bot-trap as
`/auth/register` — bodies carrying `website`, `url`, or `homepage`
are silently rejected.

`res 201`
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGc...",
    "refresh_token": "eyJhbGc...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "user": {
      "user_id": "uuid",
      "email": "candidate@example.com",
      "phone": "+2348000000000",
      "first_name": "Adebayo",
      "last_name": "Salami",
      "role": "user",
      "roles": ["user"]
    },
    "registration": {
      "id": "uuid",
      "status": "claimed",
      "provisional_candidate_code": "270010001",
      "claimed_at": "2026-05-13T10:00:00.000Z"
    }
  }
}
```

Errors carry `details.error_code` so the client can branch:
- `400 code_required` / `400 code_invalid`
- `409 code_already_claimed` — same shape as the matching
  `code-status` error; client should switch to the **Log in** UI.
- `410 code_expired`
- `422 password_too_short`

On success a `jupeb-welcome-student.html` email fires
(fire-and-forget). The candidate is then authenticated and can
fetch their pre-loaded profile via `GET /jupeb/me/profile`
(Flow 5, step 6).

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

**Side effects on assignment:**

- Every assigned candidate gets a `jupeb-matric-assigned.html` email
  (fire-and-forget). Subject embeds the matric; body restates the
  matric-lockdown rule.
- From now on the student's **only valid login identifier** is the
  matric. Email / phone / provisional reg-code stop resolving via
  `findByIdentifier` (see §0 Log in for the lockdown rule).

**Format note.** The DB `CHECK` on `jupeb_candidate_number` was
relaxed in migration `012_jupeb_candidate_number_format.sql` from
all-numeric (`^[0-9]{9,}$`) to alphanumeric + `/`, `-`, `_`
(`^[A-Za-z0-9/_-]{4,}$`). Real Nigerian matric shapes (`UI/2024/12345`,
`PG21-3-CHM-0123`) now validate. The auto-generator
(`formatCandidateNumber(yearShort, jupeb_prefix, provisional_serial)`)
still produces the 9-digit numeric form; the broader regex only
matters when an admin sets a custom matric.

### Step 6 (optional) — Bulk-finalize across every closed session

```
POST /sessions/finalize-all-closed     (registrar)
```

No body. Walks every session with `status='closed'` that still has
approved rows awaiting matric, runs Step 5 against each. Per-session
failures are captured in the result rather than aborting the run.

`res 200`
```json
{
  "data": {
    "sessions": [
      { "session_id": "uuid", "academic_year": "2025/2026", "year_short": "26",
        "assigned": 12, "skipped": 0 },
      { "session_id": "uuid", "academic_year": "2024/2025", "year_short": "25",
        "assigned": 0,  "skipped": 47 }
    ],
    "totals": {
      "sessions_processed": 2,
      "sessions_touched": 1,
      "assigned": 12,
      "skipped": 47
    }
  }
}
```

Pre-flight optimization: the endpoint only walks closed sessions
that have eligible rows, so re-running on a clean DB returns in
milliseconds. Idempotent: a second call reports `totals.assigned: 0`.

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
```

**Three payload shapes accepted** — pick whichever is convenient for
the client. All three are normalized onto the same CSV parser. CSV
header columns: `code,name,jupeb_prefix,short_name,university_type,
email,address,phone,expected_candidate_count,description`. Max 1000 rows.

```bash
# 1) Multipart — what the frontend file picker sends. Field name is
# `file` by default; `csv` is also accepted.
curl -X POST $BASE/catalog/universities/bulk \
  -H "Authorization: Bearer $ADMIN" \
  -F "file=@/path/to/unis.csv;type=text/csv"

# 2) Raw text/csv body
curl -X POST $BASE/catalog/universities/bulk \
  -H "Authorization: Bearer $ADMIN" \
  -H "Content-Type: text/csv" \
  --data-binary @/path/to/unis.csv

# 3) JSON wrapper
curl -X POST $BASE/catalog/universities/bulk \
  -H "Authorization: Bearer $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"csv": "code,name,jupeb_prefix\nUNILAG,University of Lagos,001\n..."}'
```

Sample CSV body:

```
code,name,jupeb_prefix,university_type,email,phone,expected_candidate_count,description
UNILAG,University of Lagos,001,federal,registry@unilag.edu.ng,+2348139780233,2000,...
UNN,University of Nigeria,002,federal,registry@unn.edu.ng,+2348011112222,1500,...
```

`res 200` — per-row outcomes (failures are **isolated** to the row,
not aborting the batch):
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

When a row fails (e.g. duplicate code), its `outcomes[]` entry carries
`{ ok: false, error_code, error_message }` and the run continues.

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
```

Accepts the **same three payload shapes** as
`/catalog/universities/bulk` — multipart file (`file` or `csv` field),
raw `text/csv` body, or JSON `{ csv: "..." }`. CSV columns:
`code,name,description`.

`req` (raw csv body example)
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
```

Accepts multipart file / `text/csv` / JSON — same as `/catalog/universities/bulk`.
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

Powers the figma **"Student Information — Kindly verify your
information below"** screen and the **"Confirm Subject Combinations"**
bottom-sheet that follows it. The screen renders `candidate.full_name`,
`candidate.provisional_candidate_code` (e.g. `001/0001`), the
`subject_combination.title` + `subject_combination.code` (rendered as
`"CRS/ISS, Government, Literature - JUPEB SC-001"`), gender, DOB,
residential address, etc.

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

**Emails fired by this flow** (all fire-and-forget; recipient is the
candidate's intake / users.email):

| Step | Trigger | Template |
|---|---|---|
| 2 | `institutionCreate` returns 201 | `jupeb-code-issued.html` |
| 5 | `register-with-code` returns 201 | `jupeb-welcome-student.html` |
| 12 (approve) | `emitRegistrationApproved` | `jupeb-registration-approved.html` |
| 12 (reject) | `transitionStatus → rejected` | `jupeb-registration-rejected.html` |
| 12 (withdraw) | `transitionStatus → withdrawn` | `jupeb-registration-withdrawn.html` |
| Flow 1, Step 5 (matric assigned) | per-row `setCandidateNumberIfNull` | `jupeb-matric-assigned.html` |

---

## 6. Institution candidate detail (`GET /institution/registrations/:id`)

Single-call composite that powers the institution dashboard's
candidate-detail page. Instead of N round-trips for the registration
row + user + documents + biometrics + history, the institution UI
makes one request:

```
GET /registration/institution/registrations/{registrationId}     (inst)
```

`res 200`
```jsonc
{
  "data": {
    "id": "uuid", "status": "approved",
    "institution_issued_code": "F7K2P9",
    "provisional_candidate_code": "261010001",
    "jupeb_candidate_number": "26101000001",
    "claimed_at": "...", "submitted_at": "...", "approved_at": "...",
    "approved_by": "uuid",

    "university":          { "id": "...", "name": "University of Lagos", "jupeb_prefix": "101" },
    "subject_combination": { "id": "...", "code": "JUPEB SC-001", "title": "..." },
    "session":             { "id": "...", "academic_year": "2025/2026", "year_short": "26" },
    "nin_verification":    { "id": "...", "status": "verified" },

    "candidate": {
      "id": "uuid", "email": "...", "phone": "...",
      "email_verified": true, "phone_verified": false,
      "first_name": "Adunni", "last_name": "Yusuf",
      "display_name": "Adunni Yusuf",
      "date_of_birth": "...", "gender": "female",
      "profile_photo_url": "...",
      "residential_address": "...", "state_of_origin": "Lagos",
      "lga": "Ikeja", "place_of_birth": "Lagos"
    },

    "next_of_kin": {
      "name": "...", "relationship": "mother", "phone": "...",
      "email": null, "address": "...", "source": "nin"
    },

    "documents":      [ /* registration_documents */ ],
    "result_entries": [ /* grouped by source+sitting */ ],
    "biometrics": [
      { "id": "...", "capture_type": "face", "quality_score": 0.85,
        "captured_at": "..." }
    ],
    "biometric_status": "yes",
    "biometric_skips": { "face": false, "fingerprint": false },

    "status_history": [
      { "from_status": null, "to_status": "code_issued", "reason": null,
        "changed_by": "uuid", "created_at": "..." },
      { "from_status": "code_issued", "to_status": "claimed", ... }
    ]
  }
}
```

Errors:
- `404 Registration not found`
- `422 Invalid registration id` (malformed UUID)

**Auth scope**: same `instReg` role set used by the rest of the
institution dashboard (admin / super_admin / registrar /
program_director / institution_admin) and scoped to the registration's
`university_id` via `assertInstitutionUniversityAccess`.

---

## 7. Dashboard analytics — graph data

Every chart on the Registrar Dashboard + Registration Management
screens is backed by one of the `/dashboard/*` endpoints (plus one
endpoint under `/registration/...` for the by-university chart). All
share the `dashboardRead` role set (admin / super_admin / registrar /
program_director / institution_admin) and accept optional
`?university_id` and `?session_id` for scoping.

### Endpoint map

| Widget | Endpoint | Field(s) |
|---|---|---|
| KPI · Institutions Onboarded | `GET /dashboard/stat-cards` | `data.institutions_onboarded` |
| KPI · Total Candidates Registered | `GET /dashboard/stat-cards` | `data.total_registered` |
| KPI · Candidates with Biometrics | `GET /dashboard/stat-cards` | `data.with_biometrics` |
| KPI · Candidates without Biometrics | `GET /dashboard/stat-cards` | `data.without_biometrics` |
| KPI · Approved/Pending/Rejected counts | `GET /dashboard/students-status` | `approved`, `pending`, `rejected` |
| Line · Registration Trends (current vs prior year) | `GET /dashboard/registration-trends?year=YYYY` | `series[].points[].count` |
| Bar · Subject Combination Enrollment (top N) | `GET /dashboard/subject-enrollment?session_id=…&limit=6` | `[{code, label, count}]` |
| Bar · Top Institutions (Registration Mgmt page) | `GET /registration/institution/overview/by-university?session_id=…&limit=12` | `[{university_id, university_name, registered_count}]` |
| Donut · Institution Distribution by type | `GET /dashboard/institution-distribution` | `total`, `slices[].{type, count, pct}` |
| Card · Registration Timeline (opens/now/closes) | `GET /dashboard/session-timeline?session_id=…` | `opens_at`, `closes_at`, `now`, `within_window`, cutoffs |
| Table · Recent Registrations | `GET /dashboard/recent-registrations?session_id=…&limit=5` | full per-row enrichment |
| Sidebar · Quick Statistics | `GET /dashboard/quick-stats` | `total_students`, `institutions_count`, `active_session` |
| Header chip · Active session | `GET /dashboard/scope` | `session.{id, label, status}` |

### Sample requests

```bash
# 1) KPI cards across the top row
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/stat-cards?session_id=$SESSION_ID" | jq '.data'
```

```jsonc
{
  "institutions_onboarded": { "value": 117, "delta_pct": null },
  "total_registered":       { "value": 3671, "delta_pct": -0.03 },
  "approved":               { "value": 2800, "delta_pct": 6.08 },
  "pending":                { "value": 800,  "delta_pct": 1.50 },
  "with_biometrics":        { "value": 3600, "delta_pct": 11.01 },
  "without_biometrics":     { "value": 71,   "delta_pct": 11.01 },
  "compared_to": { "session_id": "uuid", "label": "2024/2025" }
}
```

`delta_pct` compares against the chronologically prior session by
`opens_at`. `institutions_onboarded.delta_pct` is always `null` —
universities aren't session-scoped, so there's no notion of prior.

```bash
# 2) Donut: institution distribution by type
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/institution-distribution" | jq '.data'
```

```jsonc
{
  "total": 117,
  "slices": [
    { "type": "federal",     "count": 61, "pct": 52.1 },
    { "type": "state",       "count": 27, "pct": 23.1 },
    { "type": "private",     "count": 16, "pct": 13.7 },
    { "type": "unspecified", "count": 13, "pct": 11.1 }
  ]
}
```

Slice `pct` values sum to ~100 (one-decimal rounding may leave a
tenth off). `unspecified` rolls up universities without
`university_type` set.

```bash
# 3) Line: registration trends, current + previous year
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/registration-trends?year=2026" | jq '.data'
```

```jsonc
{
  "year": 2026,
  "series": [
    { "key": "current",  "year": 2026,
      "points": [ { "month": 1, "count": 200 }, ..., { "month": 12, "count": 0 } ] },
    { "key": "previous", "year": 2025,
      "points": [ ... ] }
  ]
}
```

```bash
# 4) Bar: subject combinations
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/subject-enrollment?session_id=$SESSION_ID&limit=6" | jq '.data'
```

```jsonc
[
  { "subject_combination_id": "uuid", "code": "JUPEB SC-009", "label": "...", "count": 28500 },
  { "subject_combination_id": "uuid", "code": "JUPEB SC-003", "label": "...", "count": 27000 },
  ...
]
```

```bash
# 5) Bar: top 12 institutions (Registration page)
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/registration/institution/overview/by-university?session_id=$SESSION_ID&limit=12" | jq '.data'
```

```jsonc
[
  { "university_id": "uuid", "university_name": "ABU",     "registered_count": 31000 },
  { "university_id": "uuid", "university_name": "UNILAG",  "registered_count": 28000 },
  ...
]
```

```bash
# 6) Registration timeline card
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/session-timeline?session_id=$SESSION_ID" | jq '.data'
```

```jsonc
{
  "session_id": "uuid",
  "academic_year": "2025/2026",
  "year_short": "26",
  "status": "open",
  "opens_at": "2026-01-01T00:00:00.000Z",
  "closes_at": "2026-06-30T00:00:00.000Z",
  "candidate_info_cutoff_at": null,
  "profile_update_cutoff_at": null,
  "ca_cutoff_at": null,
  "now": "2026-03-24T11:02:00.000Z",
  "within_window": true
}
```

`within_window: true` iff `opens_at <= now <= closes_at`. Without a
`session_id` the endpoint resolves to the currently-open session, or
the most recent one if none is open.

```bash
# 7) Sidebar quick stats
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/quick-stats" | jq '.data'
```

```jsonc
{
  "total_students": 12456,
  "institutions_count": 117,
  "active_session": { "id": "uuid", "label": "2026/2027", "status": "open" }
}
```

`institutions_count` and `institution-distribution.total` come from
the same helper — they're guaranteed equal.

```bash
# 8) Recent registrations table (5 rows)
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/recent-registrations?session_id=$SESSION_ID&limit=5" | jq '.data[0]'
```

```jsonc
{
  "registration_id": "uuid",
  "candidate_id":    "261010001",
  "name":            "Natali Craig",
  "email":           "ada@example.com",
  "avatar_url":      "https://...",
  "subject_combination": { "id": "uuid", "code": "JUPEB SC-001" },
  "biometric_captured": true,
  "status":         "approved",      // bucketized: approved | pending | rejected | withdrawn
  "raw_status":     "approved",
  "submitted_at":   "...",
  "created_at":     "..."
}
```

### Auth + scoping

All `/dashboard/*` endpoints require auth and the `dashboardRead`
role. `?university_id` and `?session_id` query params let the
registrar filter to a specific institution + session; without them
the service resolves the active session and (for institution-admins)
auto-scopes to their `profiles.jupeb_university_id`.

Anonymous calls → `401`. Wrong role → `403`. Bad UUID → `422`.

---

## 8. Search & filter on dashboard list endpoints

Every list page on the registrar / institution dashboards is backed
by a paginated endpoint with the **same query-param vocabulary**.
`q` is a case-insensitive `ILIKE '%…%'` substring match — what
columns it searches depends on the entity. All endpoints also accept
`page` (default 1) and `limit` (default 20, max 100) for pagination
and return a `pagination: { page, limit, total, totalPages }`
envelope alongside `data`.

### Quick reference

| Endpoint | Tab on the portal | `q` matches against | Other filters |
|---|---|---|---|
| `GET /registration/institution/registrations` | Candidates / Recent Registrations table | `display_name`, `first_name`, `last_name`, `email`, `provisional_candidate_code`, `jupeb_candidate_number`, `institution_issued_code` | `bucket` (`approved`/`pending`/`rejected`), `status`, `university_id`, `session_id` |
| `GET /catalog/universities` | Institutions | `code`, `name`, `short_name` | `status` |
| `GET /catalog/subjects` | Subjects | `code`, `name`, `description` | `status` |
| `GET /catalog/subject-combinations` | Subject Combinations | `code`, `title` | `status`, `university_id` |
| `GET /sessions` | Session History / Manage Session | `academic_year`, `year_short` | `status` |

### Sample requests

```bash
# Candidates — name + bucket + university scope
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/registration/institution/registrations?q=ada&bucket=pending&university_id=$UNI_ID&limit=20" \
  | jq '.data[].name, .pagination.total'

# Universities — search by partial code/name
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/catalog/universities?q=UNILAG&status=active&limit=20" \
  | jq '.pagination.total, .data[].code'

# Subjects
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/catalog/subjects?q=Mathematics&status=active" | jq '.pagination.total'

# Subject combinations — institution-scoped (returns global + this uni's combos)
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/catalog/subject-combinations?q=JUPEB SC-001&university_id=$UNI_ID" \
  | jq '.data[] | {code, title, is_global}'

# Sessions — partial year fragment
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/sessions?q=2025/&status=closed" | jq '.data[].academic_year'
```

### Notes

- **Search is always combinable with the other filters.** `q=ada&bucket=pending` returns
  pending candidates named Ada; `q=UNILAG&status=active` returns only the active rows
  matching UNILAG.
- **Pagination `total` reflects the filtered count**, not the table total — the frontend
  pager should use it directly. `totalPages = ceil(total / limit)`.
- **Trim and ignore empty `q`.** The server treats `q=""` / `q="   "` as "no filter"
  so a client can keep the param in the URL when the search box is empty.
- **All endpoints share the same auth gating** as their unfiltered counterparts
  (`/registration/institution/*` → instReg role set; `/catalog/*` and `/sessions` →
  admin / super_admin / registrar). Public read endpoints (`/catalog/*/public`)
  don't currently support `q`; they're meant for fast preload of small active sets
  on the unauthenticated student signup screen.

### Source of truth in code

- `_buildInstitutionWhere` on `registration.model.js` — the richest version; documents
  the full ILIKE expression across 7 columns.
- `_whereAdmin` on `university.model.js` / `subject.model.js` /
  `subject-combination.model.js` and `_where` on `session.model.js` — shared
  WHERE-builder used by `findAll*` and `count*` so the paginated `data` and the
  `pagination.total` never drift out of sync.
