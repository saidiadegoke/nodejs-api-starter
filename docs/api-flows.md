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

The auth module supports email-or-phone identifiers, JWT access +
refresh tokens, OTP phone verification, and password reset.

**Where signup happens:**
- **Admin-created users** → `POST /auth/register` (gated, below) or
  `POST /admin/users` (creates the user *and* binds them to a
  university — see §0b).
- **Public student signup** → the institution-code flow:
  `GET /auth/code-status` → `POST /auth/register-with-code` /
  `POST /auth/complete-registration`. These stay public.
- **Social login** → `/auth/{provider}` OAuth routes.

### Create user (admin)

```
POST /auth/register     (authenticated — requires the `users.create` permission)
```

> **Access change.** `/auth/register` is no longer public. It now
> requires a logged-in caller holding the `users.create` permission
> (granted to `admin` / `super_admin` via roles; can also be granted
> to any other user directly through `user_permissions`). Public
> student onboarding moved to the institution-code flow listed above.

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
- `401` if unauthenticated; `403` if the caller lacks `users.create`.
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

**Re-entry exception.** The lockdown is automatically released as
soon as the candidate has an *in-progress* registration without a
matric yet (status one of `code_issued`, `claimed`,
`pending_student_confirm`, `pending_documents`, or
`pending_institution_review`). This lets a returning student claim
a new session's code via email/phone after a prior session
finalized — the prior matric still works too, so both identifiers
resolve while a fresh registration is in flight.

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
    "university": {
      "id": "uuid",
      "name": "Ahmadu Bello University",
      "short_name": "ABU",
      "jupeb_prefix": "108"
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

The `university` block is the institution the user belongs to —
resolved from their institution-scope binding
(`profiles.jupeb_university_id`), or, failing that, the university of
their latest registration. `null` for users tied to no institution.
It's also returned by `GET /users/me` and embedded in the
`/registration/me/current` + `/registration/me/profile` composites.

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

A reset can be delivered two ways — pick per request:

- **`token`** (default) — a long random token emailed as a clickable
  reset link. The original/desktop flow.
- **`otp`** — a 6-digit numeric code delivered by email and/or SMS.
  Better for mobile, where typing a code beats round-tripping a link.

Both are backed by the same `password_resets` table (discriminated by
the `kind` column) and either can be used at any time.

```
POST /auth/forgot-password     (public)
```

`req`
```json
{ "identifier": "candidate@example.com", "delivery": "otp", "channel": "sms" }
```

- `identifier` — email or phone (required).
- `delivery` — `token` (default) or `otp`.
- `channel` — only used when `delivery: "otp"`: `email` | `sms` |
  `both`. Defaults to env `OTP_CHANNEL`, else `email` when the user has
  one, else `sms`.

`res 200` — always success-shaped (does not leak account existence):
```json
{
  "data": {
    "reset_initiated": true,
    "delivery": "otp",
    "method": "otp",
    "channels": ["sms"],
    "expires_at": "2026-05-16T10:15:00.000Z",
    "masked_recipient": "+234803***5678"
  }
}
```
`method` is a legacy alias for `delivery`. Token TTL is 15 min; OTP TTL
is `OTP_TTL_MINUTES` (default 10).

```
POST /auth/reset-password     (public)
```

Accepts **either** redemption shape:

`req` — token (link) flow
```json
{ "token": "<reset-token>", "new_password": "Newpass123!" }
```

`req` — OTP flow
```json
{ "identifier": "candidate@example.com", "code": "374921", "new_password": "Newpass123!" }
```

`res 200` — password is rotated; a `password-reset-success.html` email
fires for both flows.

Error shapes (carry `details.error_code`):
- `400 invalid_or_expired_token` — token flow, bad/expired/used token
- `400 invalid_or_expired_otp` — OTP flow, wrong code (`attempt_count` increments)
- `410 otp_expired` / `otp_expired_or_missing` — no active code / past TTL
- `429 too_many_attempts` — 5 wrong OTP attempts; the row is burned, request a fresh code
- `422 weak_password` / `otp_invalid_format` — body validation

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
show next.

**Claimable code** — `valid: true`. The response now carries the full
candidate preview (same shape as `POST /auth/register-with-code`), so
the verify-info screen renders without a second round-trip:

```json
{
  "data": {
    "valid": true,
    "expires_at": "2026-09-30T23:59:59Z",
    "university": { "id": "uuid", "name": "University of Lagos", "short_name": "UNILAG" },
    "candidate": {
      "registration_id": "uuid",
      "full_name": "Adebayo Salami",
      "jupeb_reg_no": "270010001",
      "provisional_candidate_code": "270010001",
      "photo_url": null,
      "status": "code_issued"
    },
    "basic_information": {
      "date_of_birth": "1999-01-01",
      "gender": "male",
      "residential_address": "12 Marina Road, Lagos",
      "country": { "id": 1, "name": "Nigeria" },
      "state_of_origin": { "id": 27, "name": "Ondo", "code": "OND" },
      "lga": { "id": 412, "name": "Ondo West" },
      "place_of_birth": "Lagos State"
    },
    "contact_information": { "email": "adesalam@example.com", "phone": "+2348000000000" },
    "next_of_kin": {
      "name": "Jane Johnson", "relationship": "Mother",
      "contact_no": "+2348023456789", "phone": "+2348023456789",
      "email": null, "address": null, "source": "nin"
    },
    "subject_combination": { "id": "uuid", "code": "SC-001", "title": "...",
      "status": "active", "is_global": true,
      "subject_items": [ { "id": "uuid", "position": 0, "subject_id": "uuid", "code": "MTH", "name": "Mathematics" }, "…" ] },
    "session": { "id": "uuid", "academic_year": "2026/2027", "year_short": "27" }
  }
}
```

- `country` / `state_of_origin` / `lga` are resolved to `{ id, name }`
  references against the `countries` / `states` / `lgas` tables. When a
  NIN-supplied name can't be matched, the field falls back to
  `{ id: null, name: "<raw string>" }`.
- `jupeb_reg_no` is the final `jupeb_candidate_number` once assigned,
  otherwise the `provisional_candidate_code`.
- `next_of_kin` prefers the `jupeb_next_of_kin` record when one exists
  (`source: student | institution`), falling back to the NIN payload
  (`source: nin`). `null` when neither is present.

**Not-claimable code** — `valid: false` with an `error_code`. The
candidate preview is omitted; for an already-claimed code an `account`
block with masked identifiers is returned instead so the client can
route to the log-in screen:

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

| State | `valid` | `error_code` | Extra block | Client behaviour |
|---|---|---|---|---|
| Unknown code | `false` | `code_not_found` | — | "Invalid code" error |
| Expired code | `false` | `code_expired` | — | "Expired — contact institution" |
| Claimable | `true` | — | `candidate` + full preview | Route to **Create account** screen (`/auth/register-with-code`) |
| Used, account active | `false` | `code_already_claimed` | `account` populated | Route to **Log in** screen; prefill identifier with `email_masked` |
| Used, account suspended | `false` | `code_already_claimed` | `account.active: false` | "Account disabled — contact support" |

Raw email / phone never leak — only masked values.

### Register with an institution code (preview)

```
POST /auth/register-with-code     (public)
GET  /auth/register-with-code?code=…   (public — same handler)
```

The companion to `GET /auth/code-status`. This is a **read-only
preview** — it powers the figma `log in 11` → `log in 12` verify-info
screen. It does **not** create an account, does **not** claim the
code, and does **not** return tokens — the code stays `code_issued`.
The actual account + tokens come from `POST /auth/complete-registration`
(next).

`req`
```json
{ "code": "F7K2P9" }
```

Only `code` is read. The honeypot bot-trap applies (`website` / `url` /
`homepage` → silent rejection).

`res 200`
```json
{
  "success": true,
  "message": "Code preview",
  "data": {
    "candidate": { "registration_id": "uuid", "full_name": "Adebayo Salami",
                   "provisional_candidate_code": "270010001", "photo_url": null, "status": "code_issued" },
    "basic_information": { "date_of_birth": "1999-01-01", "gender": "male",
                           "residential_address": "…", "state_of_origin": "Ondo",
                           "lga": "Ondo West", "place_of_birth": "Lagos" },
    "contact_information": { "email": "candidate@example.com", "phone": "+2348000000000" },
    "next_of_kin": { "name": "…", "relationship": "…", "...": "..." },
    "subject_combination": { "id": "uuid", "code": "SC-001", "title": "…",
      "status": "active", "is_global": true,
      "subject_items": [ { "id": "uuid", "position": 0, "subject_id": "uuid", "code": "MTH", "name": "Mathematics" }, "…" ] },
    "university": { "id": "uuid", "name": "…", "short_name": "…", "jupeb_prefix": "001" },
    "session": { "id": "uuid", "academic_year": "2026/2027", "year_short": "27" },
    "code": { "expires_at": "2026-09-30T23:59:59Z" },
    "editable_fields": ["password", "residential_address", "phone", "email"],
    "nin_verification": { "id": "uuid", "status": "verified" }
  }
}
```

`editable_fields` lists what the client may send to
`complete-registration`. Errors carry `details.error_code`:
`422 code_required`, `404 code_not_found`, `410 code_expired`,
`409 code_already_claimed` / `code_unavailable`.

### Complete registration (claim the code, mint the account)

```
POST /auth/complete-registration     (public)
```

The token-issuing step. After the verify-info screen, the student sets
a password on the Bio Data step; this call mints the user account,
**atomically claims** the registration (`code_issued` → `claimed`), and
returns the same auth envelope as `/auth/login`.

`req`
```json
{
  "code": "F7K2P9",
  "password": "S3curePass!",
  "email": "candidate@example.com",
  "phone": "+2348000000000",
  "first_name": "Adebayo",
  "last_name": "Salami",
  "residential_address": "12 Marina Road, Lagos"
}
```

`code` + `password` (≥ 8 chars) are required; contact / name /
address fields are optional overlays on whatever the institution
pre-seeded (defaults pulled from the NIN intake). Same honeypot trap.

`res 201`
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "access_token": "eyJhbGc...",
    "refresh_token": "eyJhbGc...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "user": { "user_id": "uuid", "email": "candidate@example.com", "phone": "+2348000000000",
              "first_name": "Adebayo", "last_name": "Salami", "role": "student", "roles": ["student"] },
    "registration": { "id": "uuid", "status": "claimed",
                      "provisional_candidate_code": "270010001", "claimed_at": "2026-05-19T10:00:00.000Z" }
  }
}
```

Errors carry `details.error_code`:
- `422 code_required` / `422 weak_password` / `422 identifier_required`
- `404 code_not_found`
- `410 code_expired`
- `409 code_already_claimed` / `code_unavailable` — switch to the **Log in** UI
- `409 email_in_use` / `409 phone_in_use`

On success a `jupeb-welcome-student.html` email fires
(fire-and-forget). The candidate is now authenticated (use the
returned `access_token`) and can fetch their profile via
`GET /registration/me/profile` (Flow 5, step 6).

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
GET   /admin/users                     (users.view) — paginated user list; alias `GET /users`
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

### Create a user + associate to a university

```
POST /admin/users     (authenticated — requires the `users.create` permission)
```

Creates a user **and** binds them to a JUPEB university in one atomic
call. Use this instead of `POST /auth/register` when the new user
belongs to an institution (registrar, program director, institution
admin, student, …).

`req`
```json
{
  "email": "registrar@unilag.edu.ng",
  "phone": "+2348000000000",
  "password": "S3curePass!",
  "first_name": "Adebayo",
  "last_name": "Salami",
  "role": "registrar",
  "university_id": "uuid",
  "is_primary": true,
  "country_id": 566
}
```

- At least one of `email` / `phone`; `password` ≥ 8; `first_name`,
  `last_name`, `role`, `university_id` all required.
- `role` — any of the system roles (`super_admin`, `admin`, `agent`,
  `user`, `registrar`, `program_director`, `institution_admin`,
  `financial_admin`, `student`).
- `is_primary` — default `true`. The primary binding is mirrored onto
  `profiles.jupeb_university_id` so existing institution-scope code
  keeps working.

`res 201`
```json
{
  "success": true,
  "message": "User created and associated with university",
  "data": {
    "user": { "user_id": "uuid", "email": "...", "phone": "...",
              "first_name": "Adebayo", "last_name": "Salami",
              "role": "registrar", "status": "active", "created_at": "..." },
    "university": { "id": "uuid", "name": "University of Lagos", "short_name": "UNILAG" },
    "binding": { "id": "uuid", "is_primary": true, "role": "registrar" }
  }
}
```

- `401` / `403` — unauthenticated / missing `users.create`.
- `404` — `university_id` not found or inactive.
- `409` — duplicate email/phone.
- `422` — validation failures.

**Association model.** Bindings live in the `user_universities` join
table (many-to-many). A partial unique index enforces **one active
primary university per user**; `profiles.jupeb_university_id` is kept
as the denormalized primary pointer. To bind/clear a university for an
*existing* user, use `PATCH /admin/users/{userId}/jupeb-university`
(next).

### Assign an institution to an existing user

```
PATCH /admin/users/{userId}/jupeb-university     (admin / super_admin / registrar)
```

Sets (or clears) a user's **primary** JUPEB institution. Use this when
the user already exists but has no institution yet — e.g. created via
`POST /auth/register`, or re-assigned to a different institution.

`req`
```json
{ "jupeb_university_id": "uuid" }
```
- `jupeb_university_id` — the university to assign, or `null` to clear
  the scope. The field must be present (omitting it → `422`).

`res 200`
```json
{
  "success": true,
  "message": "JUPEB institution scope updated",
  "data": { "user_id": "uuid", "jupeb_university_id": "uuid" }
}
```

- `404` — user not found, or `jupeb_university_id` not found / inactive.
- `422` — `userId` or `jupeb_university_id` is a malformed UUID, or the
  body omits `jupeb_university_id`.

**Stays in sync.** The write is transactional and updates **both**
representations together:
- `profiles.jupeb_university_id` — the denormalized primary pointer.
- `user_universities` — the join-table source of truth. Assigning
  upserts a primary binding (demoting any prior primary); passing
  `null` soft-deletes the current primary binding.

So `POST /admin/users` and this endpoint produce identical state — the
join table never drifts from the denormalized pointer.

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
  `findByIdentifier` (see §0 Log in for the lockdown rule, and for
  the re-entry exception that re-opens email/phone login as soon as
  the student picks up a fresh code in a new session).

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
| `GET` | `/catalog/subject-combinations/public` | **public** — supports `?university_id`; each row includes `subject_items[]` |
| `GET` | `/catalog/subject-combinations` | Paginated; each row includes `subject_items[]` + `enrolled_count` |
| `GET` | `/catalog/subject-combinations/{id}` | Includes `subject_items[]` |
| `PATCH` | `/catalog/subject-combinations/{id}` | Sending `subjects` re-resolves and replaces the join rows in lockstep |
| `POST` | `/catalog/subject-combinations/{id}/activate` | |
| `POST` | `/catalog/subject-combinations/{id}/deactivate` | |

Every read above resolves the combination's subjects via the
`jupeb_subject_combination_items` join table into a `subject_items[]`
array — `[{ id, position, subject_id, code, name }, …]` ordered by
`position`. The paginated admin list additionally carries
`enrolled_count`: the number of non-withdrawn registrations on that
combination (the "Number of Candidates Enrolled" column). Both are
batch-loaded — one query for all items, one for all counts — so the
list stays a fixed 3 queries regardless of page size.

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
    "candidate": { "id": "uuid", "title": "Mr", "full_name": "Adebayo Salami",
                   "provisional_candidate_code": "270010001", "photo_url": null, "status": "claimed" },
    "basic_information": { "date_of_birth": "1999-01-01", "gender": "male",
                           "residential_address": "...", "state_of_origin": "Ondo State",
                           "lga": "Ondo West", "place_of_birth": "Lagos State" },
    "contact_information": { "email": "adesalam@example.com", "phone": "+2348000000000" },
    "next_of_kin": { "name": "Jane Johnson", "relationship": "Mother", "contact": "+2348023456789" },
    "subject_combination": {
      "id": "uuid", "code": "SC-001", "title": "Maths, Physics, Chemistry",
      "status": "active", "is_global": true, "university_id": null,
      "subject_items": [
        { "id": "uuid", "position": 0, "subject_id": "uuid", "code": "MATHEMATICS", "name": "Mathematics" },
        { "id": "uuid", "position": 1, "subject_id": "uuid", "code": "PHYSICS", "name": "Physics" },
        { "id": "uuid", "position": 2, "subject_id": "uuid", "code": "CHEMISTRY", "name": "Chemistry" }
      ]
    },
    "university": { "id": "uuid", "name": "...", "short_name": "...", "jupeb_prefix": "001" },
    "session": { "id": "uuid", "academic_year": "2026/2027", "year_short": "27" },
    "nin_verification": { "id": "uuid", "status": "verified" }
  }
}
```

`subject_combination` is the **full** combination object — the
combination row plus `subject_items[]` (each `{ id, position,
subject_id, code, name }`) — so the client gets the constituent
subjects without a follow-up `GET /catalog/subject-combinations/{id}`.
The same full object is returned wherever a registration is serialized
(`/registration/me/current`, the institution candidate detail, etc.).

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

The raw file is uploaded first via **`POST /files/upload`** (see below)
to obtain a `file_id`. `res 201` — document row.

Repeat for each requirement (e.g. WAEC, NECO).

**Uploading the file** — `POST /files/upload` (authenticated):
- `Content-Type: multipart/form-data`, field name **`file`** (optional
  `context` field). There is **no `POST /files`** — the route is
  `/files/upload`.
- `res 201` → `data: { id, file_id, url, file_url, file_type,
  file_size, provider, uploaded_at }`. Use `data.file_id` as the
  `file_id` in the document-attach call above.
- Base64 alternative: `POST /files/upload-base64` with
  `{ file_data, context? }`.

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
| 5 | `complete-registration` returns 201 | `jupeb-welcome-student.html` |
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
    "id": "uuid", "status": "approved", "bucket": "approved",
    "institution_issued_code": "F7K2P9",
    "provisional_candidate_code": "261010001",
    "jupeb_candidate_number": "26101000001",
    "claimed_at": "...", "submitted_at": "...", "approved_at": "...",
    "approved_by": "uuid",

    "university":          { "id": "...", "name": "University of Lagos", "short_name": "UNILAG", "jupeb_prefix": "101" },
    "subject_combination": { "id": "...", "code": "JUPEB SC-001", "title": "...", "subject_items": ["…"] },
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
| KPI · Active / Inactive Institutions | `GET /dashboard/stat-cards` | `data.active_institutions`, `data.inactive_institutions` |
| KPI · Total Candidates Registered | `GET /dashboard/stat-cards` | `data.total_registered` |
| KPI · Candidates with Biometrics | `GET /dashboard/stat-cards` | `data.with_biometrics` |
| KPI · Candidates without Biometrics | `GET /dashboard/stat-cards` | `data.without_biometrics` |
| KPI · Total Subjects / Combinations / Inactive Subjects | `GET /dashboard/stat-cards` | `data.total_subjects`, `data.total_subject_combinations`, `data.inactive_subjects` |
| KPI · Approved/Pending/Rejected counts | `GET /dashboard/students-status` | `approved`, `pending`, `rejected` |
| Line · Registration Trends (current vs prior year) | `GET /dashboard/registration-trends?year=YYYY&session_id=…` | `series[].points[].count` |
| Line · Institution Onboarding Trends | `GET /dashboard/institution-trends?year=YYYY` | `series[].points[].count` |
| Bar · Subject Combination Enrollment (top N) | `GET /dashboard/subject-enrollment?session_id=…&limit=6` | `[{code, label, count, subjects[]}]` |
| Donut · Subject Combination Enrollment distribution | `GET /dashboard/subject-combination-distribution?session_id=…` | `session_id`, `total`, `slices[].{code, title, count, pct, subjects[]}` |
| Bar · Enrollment by individual subject | `GET /dashboard/enrollment-by-subject?session_id=…&limit=…` | `[{subject_id, code, name, count}]` |
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
  "institutions_onboarded":     { "value": 121,  "delta_pct": null },
  "active_institutions":        { "value": 117,  "delta_pct": null },
  "inactive_institutions":      { "value": 4,    "delta_pct": null },
  "total_registered":           { "value": 3671, "delta_pct": -0.03 },
  "approved":                   { "value": 2800, "delta_pct": 6.08 },
  "pending":                    { "value": 800,  "delta_pct": 1.50 },
  "with_biometrics":            { "value": 3600, "delta_pct": 11.01 },
  "without_biometrics":         { "value": 71,   "delta_pct": 11.01 },
  "total_subjects":             { "value": 142,  "delta_pct": null },
  "total_subject_combinations": { "value": 36,   "delta_pct": null },
  "inactive_subjects":          { "value": 4,    "delta_pct": null },
  "compared_to": { "session_id": "uuid", "label": "2024/2025" }
}
```

`delta_pct` compares against the chronologically prior session by
`opens_at`. The catalog-derived cards — the three `*_institutions`
cards, `total_subjects`, `total_subject_combinations`,
`inactive_subjects` — always have `delta_pct: null`: universities and
subjects aren't session-scoped, so there's no prior to compare against.

Card definitions (all exclude soft-deleted rows):
- `institutions_onboarded` — **every** institution (active + inactive).
- `active_institutions` / `inactive_institutions` — split by `status`.
- `total_subjects` — every subject (active + inactive);
  `inactive_subjects` is the inactive subset.
- `total_subject_combinations` — every combination.

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
# 2b) Line: institution onboarding trends (Institution Mgmt screen)
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/institution-trends?year=2026" | jq '.data'
```

```jsonc
{
  "year": 2026,
  "series": [
    { "key": "current",  "year": 2026,
      "points": [ { "month": 1, "count": 8 }, ..., { "month": 12, "count": 0 } ] },
    { "key": "previous", "year": 2025,
      "points": [ ... ] }
  ]
}
```

Counts universities by the calendar month of `created_at` —
"institutions onboarded over time". `year` defaults to the current
calendar year; both series are monthly Jan–Dec, `previous` is
`year − 1`. Soft-deleted institutions are excluded; status (active /
inactive) is **not** filtered — an institution counts as onboarded
even after it's deactivated.

```bash
# 3) Line: registration trends, current + previous year
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/registration-trends?year=2026" | jq '.data'
```

```jsonc
{
  "year": 2026,
  "session": null,
  "series": [
    { "key": "current",  "year": 2026,
      "points": [ { "month": 1, "count": 200 }, ..., { "month": 12, "count": 0 } ] },
    { "key": "previous", "year": 2025,
      "points": [ ... ] }
  ]
}
```

**Query params.** `year` is a plain calendar year (4 digits) — it
filters `jupeb_registrations` by `EXTRACT(YEAR FROM created_at)`, *not*
by a session's `academic_year`. Both series are monthly Jan–Dec; the
`previous` series is `year − 1`.

`session_id` (optional) switches to **per-session mode** — a single
series spanning only the months inside that session's window
(`opens_at → closes_at`):

```bash
# trends for one session — only the session's own months
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/registration-trends?session_id=$SESSION_ID" | jq '.data'
```

```jsonc
{
  "session": {
    "id": "uuid",
    "academic_year": "2026/2027",
    "opens_at": "2026-09-01T00:00:00.000Z",
    "closes_at": "2027-08-31T23:59:59.000Z"
  },
  "series": [
    { "key": "current", "points": [
      { "year": 2026, "month": 9,  "count": 120 },
      { "year": 2026, "month": 10, "count": 340 },
      { "...": "..." },
      { "year": 2027, "month": 8,  "count": 12 }
    ] }
  ]
}
```

Per-session mode differs from calendar-year mode:
- **Points span only the session window.** Buckets run from the
  `opens_at` month to the `closes_at` month, inclusive — a window that
  crosses New Year just keeps going, so each point carries `year` *and*
  `month` (not just `month`).
- **One series, no `previous`.** The calendar-year comparison doesn't
  apply to a session window.
- **No top-level `year`.** The `year` query param is ignored when
  `session_id` is supplied; the window is defined entirely by the
  session.
- `404` if `session_id` doesn't match a session; `422` if it's a
  malformed UUID.

```bash
# 4) Bar: subject combinations
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/subject-enrollment?session_id=$SESSION_ID&limit=6" | jq '.data'
```

```jsonc
[
  { "subject_combination_id": "uuid", "code": "JUPEB SC-002", "label": "Mathematics, Physics, Chemistry",
    "count": 7, "subjects": [ { "code": "MATHEMATICS", "name": "Mathematics" },
                              { "code": "PHYSICS", "name": "Physics" },
                              { "code": "CHEMISTRY", "name": "Chemistry" } ] },
  { "...": "..." }
]
```

`label` is the combination `title`; `subjects[]` lists the constituent
subjects. `limit` caps the bar count (default 6, max 20).
**Session scope:** `session_id` is optional — when omitted the endpoint
resolves to the open / latest session (same as the other `/dashboard/*`
endpoints), so the chart shows the *current* intake rather than a sum
across every session.

```bash
# 4b) Donut: subject combination enrollment distribution
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/subject-combination-distribution?session_id=$SESSION_ID" | jq '.data'
```

```jsonc
{
  "session_id": "uuid",
  "total": 28,
  "slices": [
    { "subject_combination_id": "uuid", "code": "JUPEB SC-002", "title": "Mathematics, Physics, Chemistry",
      "subjects": [ { "code": "MATHEMATICS", "name": "Mathematics" }, { "...": "..." } ],
      "count": 7, "pct": 25.0 },
    { "...": "..." }
  ]
}
```

Same counting as `subject-enrollment`, but returns **every** combination
with enrollments (no `limit`) plus percent shares — so `pct` sums to
~100 for a true distribution. Each slice carries `subjects[]` (the
combination's constituent subjects). `session_id` defaults to the
open / latest session; `university_id` further scopes the counts.

```bash
# 4c) Bar: enrollment by individual subject
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/dashboard/enrollment-by-subject?session_id=$SESSION_ID" | jq '.data'
```

```jsonc
[
  { "subject_id": "uuid", "code": "CHEMISTRY", "name": "Chemistry", "count": 16 },
  { "subject_id": "uuid", "code": "PHYSICS",   "name": "Physics",   "count": 16 },
  { "subject_id": "uuid", "code": "MATHEMATICS","name": "Mathematics","count": 15 },
  { "...": "..." }
]
```

Unlike `subject-enrollment` (which counts by *combination*), this
counts by **individual subject** — a subject's `count` is the number of
non-withdrawn registrations whose combination includes that subject, so
a subject in two combinations sums both. Ordered by `count` desc.
`session_id` defaults to the open / latest session; `limit` (optional,
max 50) caps to a top-N; `university_id` further scopes the counts.

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

**The search parameter is `q`.** A case-insensitive `ILIKE '%…%'`
substring match — what columns it searches depends on the entity.
`search` and `query` are accepted as **aliases**: if you pass either
(and not `q`), the server maps it onto `q`. So `?q=ada`,
`?search=ada`, and `?query=ada` all behave identically. An explicit
`q` takes precedence if more than one is supplied.

All endpoints also accept `page` (default 1) and `limit` (default 20,
max 100) for pagination and return a
`pagination: { page, limit, total, totalPages }` envelope alongside
`data`.

### Quick reference

| Endpoint | Tab on the portal | `q` matches against | Other filters |
|---|---|---|---|
| `GET /registration/institution/registrations` | Candidates / Recent Registrations table | `display_name`, `first_name`, `last_name`, `email`, `provisional_candidate_code`, `jupeb_candidate_number`, `institution_issued_code` | `bucket` / `status`, `university_id`, `session_id` |

**Status vs bucket.** Each row carries both the raw `status` (e.g.
`code_issued`, `pending_documents`, `approved`) **and** a coarse
`bucket` — `pending` \| `approved` \| `rejected` \| `withdrawn` —
translated from it (`pending` = any non-terminal status). Filter by
either: `?bucket=pending` or `?status=pending` apply the bucket
grouping; `?status=code_issued` (a raw status) does an exact match.
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

#### Search param aliases — `q`, `search`, `query`

The canonical param is `q`, but `search` and `query` are accepted as
aliases. These three requests are **identical** — pick whichever your
client already uses:

```bash
# all three return the same result set
curl -s -H "Authorization: Bearer $ADMIN" "$BASE/catalog/universities?q=UNILAG"
curl -s -H "Authorization: Bearer $ADMIN" "$BASE/catalog/universities?search=UNILAG"
curl -s -H "Authorization: Bearer $ADMIN" "$BASE/catalog/universities?query=UNILAG"
```

The alias resolves the same way on every list endpoint, combined with
any other filters:

```bash
# `search` alias + other filters — works exactly like `q`
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/registration/institution/registrations?search=ada&bucket=pending&limit=20" \
  | jq '.data[].name'

# `query` alias on the sessions list
curl -s -H "Authorization: Bearer $ADMIN" \
  "$BASE/sessions?query=2025/&status=closed" | jq '.data[].academic_year'
```

Resolution rule: an explicit `q` always wins; otherwise the server
copies `search` (or, failing that, `query`) into `q` before the
request reaches the handler. Passing `?q=ada&search=bob` searches for
`ada`.

### Notes

- **Search is always combinable with the other filters.** `q=ada&bucket=pending` returns
  pending candidates named Ada; `q=UNILAG&status=active` returns only the active rows
  matching UNILAG.
- **Pagination `total` reflects the filtered count**, not the table total — the frontend
  pager should use it directly. `totalPages = ceil(total / limit)`.
- **Trim and ignore empty `q`.** The server treats `q=""` / `q="   "` as "no filter"
  so a client can keep the param in the URL when the search box is empty. The same
  applies to the `search` / `query` aliases — an empty alias is ignored, not copied.
- **`search` / `query` are aliases for `q`** on every list endpoint (resolved by a
  global middleware before routing). Use whichever your client prefers; an explicit
  `q` takes precedence when more than one is supplied.
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

---

## 9. Post-claim student endpoint reference

After `POST /auth/complete-registration` returns the access token, every
endpoint below is gated by the `jupebStudent` auth middleware — pass
`Authorization: Bearer <access_token>` from the claim response.

### Status / current registration

- `GET /registration/me/current` — current registration state.
- `GET /registration/me/dashboard-access` — whether the student can enter
  the post-submit dashboard.

### Profile / bio data edit (figma `log in 13` and any later changes)

- `GET /registration/me/profile` — full bio + contact + NoK composite
  (same shape as the `register-with-code` preview).
- `PATCH /registration/me/profile` — bio-data edit (M.2). Edits go to the
  `profiles` table. Editable: `title` (honorific — Mr/Mrs/Dr/…),
  `residential_address`, `state_of_origin`, `lga`, `place_of_birth`,
  `phone`, `email`. NIN-derived fields (name, DOB, gender) are immutable
  when a verified NIN payload is present.
- `PATCH /registration/me/academic-intake` — academic intake fields.
- `POST /registration/me/confirm-subjects` — confirm subject combination
  (the "Confirm Subject Combinations" modal).

### Next of kin

- `GET /registration/me/next-of-kin` — current NoK.
- `POST /registration/me/next-of-kin` — create.
- `PUT /registration/me/next-of-kin` — replace.
- `GET /registration/me/next-of-kin/history` — prior versions.

### Document upload (figma `log in 14`)

Document attachment is a two-step flow: upload raw bytes via
**`POST /files/upload`** (multipart/form-data, field `file`) to get a
`file_id`, then link that `file_id` to a requirement on the student's
registration. Note the upload route is `/files/upload` — there is no
`POST /files`.

- `POST /files/upload` — upload the raw file → returns `data.file_id`.
- `GET /submission/me/requirements` — which docs are required for this
  session / institution.
- `GET /submission/me/documents` — list student's uploaded docs.
- `POST /submission/me/documents` — attach a doc (links a previously
  uploaded `file_id` to a requirement).
- `PATCH /submission/me/documents/:documentId` — replace / update metadata.
- `GET /submission/me/documents/:documentId/download-url` — signed URL
  to download / preview.
- `POST /submission/me/validate-completeness` — server-side pre-submit
  completeness check.

### Result entries (WAEC / NECO grades selector at the bottom of `log in 14`)

- `GET /submission/me/result-entries`
- `POST /submission/me/result-entries` (upsert)

### Identity / biometrics / photo

- `POST /identity/biometrics` — capture.
- `PUT /identity/biometrics/:captureId` — replace.
- `DELETE /identity/biometrics/:captureId`
- `GET /identity/registrations/:registrationId/biometrics`
- `POST /identity/registrations/:registrationId/biometrics/skip`
- `GET /identity/registrations/:registrationId/photo`

### Submit + PDF

- `GET /registration/me/submission-preview` — preview composite payload
  before final submit.
- `POST /registration/me/submit` — submit for institution review
  (status → `pending_institution_review`).
- `GET /registration/me/registration-form.pdf` — render the registration
  PDF (only after submit).

### Payment / checkout

The "Make Payment" flow has three catalogs the UI reads, then a
checkout call, then a receipt:

- `GET /finance/payment-methods` — *how money moves* (Paystack, Remita, …).
- `GET /finance/payment-items` — *what is being paid for* (Affiliation Fee, Examination).
- `GET /finance/payment-structures` — *full vs partial*.
- `GET /finance/me/fee-preview` — outstanding balance before checkout.
- `POST /finance/me/checkout` — start a payment.
- `GET /finance/me/payments` — the student's payment history.
- `GET /finance/me/payments/{id}/receipt` — one transaction's receipt.

#### Catalogs

```
GET /finance/payment-methods       (any authenticated user)
GET /finance/payment-items         (any authenticated user)
GET /finance/payment-structures    (any authenticated user)
```

`payment-methods` returns only methods an admin has **configured and
activated** — a `gateway` method with no API secret key is treated as
not configured and omitted. No secrets are ever returned. Each method
carries a `group` so the UI can render the three "Make Payment" cards
without hard-coding a code→card mapping:

| `group` | Card | Methods |
|---|---|---|
| `bank_transfer` | Bank Transfer | `direct_transfer` |
| `online` | Online Payment (card / USSD) | `paystack`, `flutterwave` |
| `pay_at_bank` | Pay at Bank (generate teller) | `remita` |

```json
{ "data": [
  { "code": "direct_transfer", "group": "bank_transfer", "type": "manual", "...": "..." },
  { "code": "paystack", "group": "online", "type": "gateway", "...": "..." },
  { "code": "remita", "group": "pay_at_bank", "type": "gateway", "...": "..." }
] }
```

`payment-items` / `payment-structures` return the active rows of the
admin-managed catalog (migration 017). The checkout dropdowns render
exactly these lists.

`res 200` (payment-items)
```json
{
  "data": [
    { "id": "uuid", "code": "affiliation_fee", "name": "Affiliation Fee",
      "fee_source": "affiliation", "fixed_amount": null, "sort_order": 1 },
    { "id": "uuid", "code": "examination_fee", "name": "Examination",
      "fee_source": "examination", "fixed_amount": null, "sort_order": 2 }
  ]
}
```

`res 200` (payment-structures)
```json
{
  "data": [
    { "id": "uuid", "code": "full",    "name": "Full Payment",    "allows_partial": false },
    { "id": "uuid", "code": "partial", "name": "Partial Payment",  "allows_partial": true }
  ]
}
```

`fee_source` tells the server how to price the item: `affiliation` →
the session affiliation fee (new-affiliate rate for the institution's
first session, existing rate after); `examination` → the session exam
fee per candidate; `fixed` → the item's own `fixed_amount`.

#### Fee preview

```
GET /finance/me/fee-preview?payment_item=…&registration_id=…     (student)
```

Pre-checkout quote — what the student owes *before* committing. Powers
the "Amount to pay" figure on the "Make Payment" screens and lets the
client validate a partial-payment entry. Both query params are
optional: omit `payment_item` to preview **every** active item; omit
`registration_id` to use the caller's latest claimed registration.

`res 200`
```json
{
  "data": {
    "registration_id": "uuid",
    "session_id": "uuid",
    "currency": "NGN",
    "items": [
      { "payment_item": { "id": "uuid", "code": "examination_fee", "name": "Examination" },
        "full_fee": 250000, "already_paid": 100000, "outstanding": 150000, "fully_paid": false }
    ]
  }
}
```

`outstanding` is what a **full** payment would charge, and the ceiling
for a **partial** one. `fully_paid: true` ⇒ the item needs no further
payment.

#### Start a checkout

`POST /finance/me/checkout` body:
```json
{
  "payment_method": "remita",
  "payment_item": "examination_fee",
  "payment_structure": "partial",
  "amount": 50000,
  "currency": "NGN",
  "description": "Q2 2026 Payment",
  "registration_id": "uuid",
  "redirect_url": "https://app.example.com/payments/callback"
}
```

- `payment_method` — `paystack` | `flutterwave` | `remita` |
  `direct_transfer`; must be active per `GET /finance/payment-methods`.
- `payment_item` / `payment_structure` — a catalog **id or code**
  (required). Online methods need an email on the account.
- `amount` — for a **partial** structure, any amount `> 0` up to the
  outstanding balance. For a **full** structure it's optional and, if
  sent, must equal the outstanding balance (the server uses the balance
  either way).
- `description` — free text shown on the receipt; defaults to the
  item name.
- `registration_id` defaults to the caller's latest claimed registration.

The server computes the item's full fee, subtracts completed payments
for that item, and validates `amount` against the **outstanding
balance**. Multiple partial payments are allowed until the item is
cleared.

`res 201`
```json
{
  "data": {
    "payment": { "payment_id": "PAY_…", "amount": 50000, "currency": "NGN", "status": "pending" },
    "payment_method": "remita",
    "payment_item": { "id": "uuid", "code": "examination_fee", "name": "Examination" },
    "payment_structure": { "id": "uuid", "code": "partial", "name": "Partial Payment" },
    "amount": 50000,
    "full_fee": 250000,
    "outstanding_before": 200000,
    "outstanding_after": 150000,
    "payment_link": "https://login.remita.net/remita/ecomm/finalize.reg?merchantId=…&rrr=…",
    "bank_account": null
  }
}
```

- `payment_link` — gateway checkout URL for `paystack` / `flutterwave` /
  `remita`; `null` for `direct_transfer`.
- `bank_account` — populated for `direct_transfer` (transfer
  instructions are also emailed); `null` otherwise.
- `404` for an unknown/inactive item, structure, or method.
- `409` if the item is already fully paid, or an unpaid payment already
  exists for the registration.
- `422` for a closed/archived session, or an `amount` over the
  outstanding balance (partial) / not equal to it (full).

**Remita (RRR).** `payment_method: "remita"` generates a Remita
Retrieval Reference — the `payment_link` carries it, and the same RRR
can be paid online (card/USSD) **or** at any bank branch ("pay at
bank"). Credentials live on the `remita` `payment_methods` row
(`api_public_key` = merchantId, `api_secret_key` = apiKey, `base_url` =
Remita base); the `serviceTypeId` comes from the
`REMITA_SERVICE_TYPE_ID` env var. Remita seeds **inactive** — an admin
configures the credentials and activates it before it appears at
checkout.

#### Transaction receipt

```
GET /finance/me/payments/{paymentId}/receipt     (payment owner)
```

`paymentId` accepts the payment UUID or the `PAY_…` reference.

`res 200`
```json
{
  "data": {
    "transaction_id": "PAY_…",
    "amount": 50000,
    "currency": "NGN",
    "status": "completed",
    "jupeb_projection": "paid",
    "payment_method": "remita",
    "payment_item": { "code": "affiliation_fee", "name": "Affiliation Fee" },
    "payment_structure": { "code": "partial", "name": "Partial Payment" },
    "description": "Q1 2026 Payment",
    "institution": {
      "id": "uuid", "name": "University Of Lagos",
      "address": "123, Aboderin Street, Ikeja Lagos State",
      "phone": "+2348176345276", "email": "registry@unilag.edu.ng"
    },
    "registration_id": "uuid",
    "date": "2026-03-01T10:00:00.000Z"
  }
}
```

#### Admin: payment catalog CRUD

Manage the catalogs (registrar / financial_admin / admin / super_admin):

```
GET    /finance/admin/payment-items            POST   /finance/admin/payment-items
PATCH  /finance/admin/payment-items/{id}        DELETE /finance/admin/payment-items/{id}
GET    /finance/admin/payment-structures        POST   /finance/admin/payment-structures
PATCH  /finance/admin/payment-structures/{id}   DELETE /finance/admin/payment-structures/{id}
```

`POST /finance/admin/payment-items` body:
`{ code, name, description?, fee_source, fixed_amount?, sort_order? }` —
`fee_source` is `affiliation` | `examination` | `fixed`; `fixed_amount`
is required when `fee_source` is `fixed`. `DELETE` is a soft-delete.
Structure bodies take `{ code, name, description?, allows_partial?,
sort_order? }`.

---

## 10. Finance analytics — fees, trends, per-institution records

Three reporting endpoints under `/finance/analytics/*`, all gated by the
`financeAdmin` role set (`financial_admin` / `registrar` / `admin` /
`super_admin`).

**Projected vs collected.** "Projected" is computed from the session's
fee config (`affiliation_fee_existing` / `affiliation_fee_new` /
`exam_fee_per_candidate`) × candidate counts — what an institution
*owes*. "Collected" sums real `payments` rows with `status='completed'`
— what's actually *been paid*. The `payments` table doesn't tag a
payment as affiliation-vs-exam, so `collected` is a single total, not
split by fee type.

**Affiliation rate.** An institution pays `affiliation_fee_new` for the
**first** session it ever has registrations in (earliest `opens_at`),
and `affiliation_fee_existing` for every later session. The
`is_new_affiliate` flag on each record captures which rate was applied.

### Exam fee by institution

```
GET /finance/analytics/exam-fee-by-institution?session_id=…     (financeAdmin)
```

Projected exam fee per institution — for plotting fee against
institutions. `session_id` is required.

`res 200`
```json
{
  "data": {
    "session_id": "uuid",
    "academic_year": "2026/2027",
    "exam_fee_per_candidate": 50000,
    "total_projected_exam_fee": 18350000,
    "institutions": [
      { "institution_id": "uuid", "institution_name": "University of Lagos",
        "institution_code": "UNILAG", "number_of_candidates": 120,
        "exam_fee": 6000000, "collected": 4200000 }
    ]
  }
}
```
`institutions` is ordered by `exam_fee` descending. `exam_fee` is
projected (`exam_fee_per_candidate × number_of_candidates`); `collected`
is the institution's total completed payments.

### Payment trends

```
GET /finance/analytics/payment-trends?year=YYYY&session_id=…     (financeAdmin)
```

Monthly collected-payment totals — completed JUPEB payments bucketed by
`paid_at` (falling back to `created_at`). Current + previous calendar
year, Jan–Dec. `year` defaults to the current year; `session_id`
optionally scopes to one session's registrations.

`res 200`
```json
{
  "data": {
    "year": 2026,
    "session_id": null,
    "series": [
      { "key": "current", "year": 2026,
        "points": [ { "month": 1, "amount": 1500000, "count": 30 }, ..., { "month": 12, "amount": 0, "count": 0 } ] },
      { "key": "previous", "year": 2025, "points": [ ... ] }
    ]
  }
}
```

### Institution fee records

```
GET /finance/analytics/institution-fee-records?session_id=…&page=1&limit=20&q=     (financeAdmin)
```

Paginated table — one row per institution in the session, projected and
collected side by side. `session_id` required; `q` filters by
institution name or code.

`res 200` (paginated envelope)
```json
{
  "data": [
    {
      "institution_id": "uuid",
      "institution_name": "University of Lagos",
      "institution_code": "UNILAG",
      "number_of_candidates": 120,
      "is_new_affiliate": false,
      "projected": { "affiliation_fee": 250000, "exam_fee": 6000000, "total": 6250000 },
      "collected": { "total": 4200000, "payment_count": 84 },
      "pending": { "total": 900000 },
      "outstanding": 2050000
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 117, "totalPages": 6 }
}
```
`outstanding` = `projected.total − collected.total` (may be negative if
an institution has overpaid).

All three return `404` for an unknown `session_id`, `422` for a
malformed one.
