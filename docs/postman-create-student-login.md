# Quick Guide — Create a Student Login via Postman

Step-by-step guide for creating student login credentials using Postman, given a registrar / super_admin login.

Base URL: `http://localhost:9999` (default API port — change to your deployed host if different). Routes are mounted at root, not `/api`.

---

## Step 1 — Log in as registrar / super_admin

**Request**
- Method: `POST`
- URL: `{{base_url}}/auth/login`
- Headers: `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "identifier": "registrar@school.edu",
  "password": "YourRegistrarPassword"
}
```

**Response** — copy `data.access_token` from the response body.

In Postman, automate this in the **Tests** tab so it gets reused:
```js
const json = pm.response.json();
pm.collectionVariables.set("access_token", json.data.access_token);
```

Create a collection variable `base_url = http://localhost:9999` and reference `{{access_token}}` in later requests.

---

## Step 2 — Create the student's login credentials

`POST /auth/register` is the canonical way to mint a student account. (It's a public endpoint, so the registrar token isn't strictly required, but you can still send it.)

**Request**
- Method: `POST`
- URL: `{{base_url}}/auth/register`
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer {{access_token}}` *(optional)*
- Body (raw JSON):
```json
{
  "email": "student@example.com",
  "phone": "+2348012345678",
  "password": "Student@123",
  "first_name": "Adebayo",
  "last_name": "Salami",
  "role": "user"
}
```

Validation rules (from `src/modules/auth/routes.js:14-44`):
- `password` — min 8 chars
- `first_name`, `last_name` — required
- `role` — must be one of `super_admin`, `admin`, `agent`, `user`, `registrar`, `program_director`, `institution_admin` (use `user` for a student)
- At least one of `email` or `phone` is required
- `phone` format: 8–20 digits, optional `+` prefix

**Response 201** — student account created; the student can now log in via `POST /auth/login` with the same `identifier` + `password`.

---

## Step 3 (optional) — Bind the student to an institution registration

If you also need to issue a JUPEB candidate code to that student, use the registrar token for these two calls (from `docs/api-flows.md` §5):

**3a. Verify NIN**
- `POST {{base_url}}/identity/nin/verify` with `Authorization: Bearer {{access_token}}`
```json
{
  "nin": "12345678901",
  "idempotency_key": "register-2026-05-07-1",
  "intake_payload": {
    "name": "Adebayo Salami",
    "email": "student@example.com",
    "phone": "+2348012345678",
    "subject_combination_id": "<uuid>"
  }
}
```
Save `data.verification_id` from the response.

**3b. Generate the institution-issued code**
- `POST {{base_url}}/registration/institution/registrations`
```json
{
  "session_id": "<uuid>",
  "university_id": "<uuid>",
  "subject_combination_id": "<uuid>",
  "nin_verification_id": "<verification_id from 3a>"
}
```
Returns `institution_issued_code` (e.g. `F7K2P9`) — hand this to the student. They log in with the credentials from Step 2 and call `POST /registration/me/claim-code` to bind their account to the registration.

---

## Quick troubleshooting

- **401 Unauthorized** on Step 3 → token expired; re-run Step 1.
- **403 Forbidden** on Step 3 → the logged-in user isn't a `registrar` / `admin` / `super_admin` (see `identity.routes.js:5-8`).
- **400 "Either email or phone is required"** → include at least one in the register body.
- **Wrong port** → check `PORT` in your `.env`; default is `9999` (`src/server.js:9`).

---

## Step 4 — Student registration (self-service)

If the student is creating their own account (instead of having the registrar pre-provision it in Step 2), they hit the same `/auth/register` endpoint themselves — no token required.

**Request**
- Method: `POST`
- URL: `{{base_url}}/auth/register`
- Headers: `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "email": "student@example.com",
  "phone": "+2348012345678",
  "password": "Student@123",
  "first_name": "Adebayo",
  "last_name": "Salami",
  "role": "user"
}
```

Same validation rules as Step 2. On success (`201`), they immediately proceed to Step 5 to obtain tokens.

---

## Step 5 — Student login

Once the account exists (created in Step 2 or Step 4), the student logs in via the same endpoint — just their own credentials.

**Request**
- Method: `POST`
- URL: `{{base_url}}/auth/login`
- Headers: `Content-Type: application/json`
- Body (raw JSON) — `identifier` is either the email or phone they registered with:
```json
{
  "identifier": "student@example.com",
  "password": "Student@123"
}
```

**Response 200** — shape:
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "user": { "id": "uuid", "email": "...", "role": "user", "...": "..." }
  }
}
```

### Using the token

For every authenticated student endpoint (e.g. `GET /registration/me/profile`, `POST /registration/me/claim-code`), set:

```
Authorization: Bearer <access_token>
```

In Postman, save it automatically in the login request's **Tests** tab:
```js
const json = pm.response.json();
pm.collectionVariables.set("student_access_token", json.data.access_token);
pm.collectionVariables.set("student_refresh_token", json.data.refresh_token);
```

Then on subsequent requests use header `Authorization: Bearer {{student_access_token}}`.

### When the access token expires

Don't make the student re-enter their password — refresh it:

- `POST {{base_url}}/auth/refresh-token`
```json
{ "refresh_token": "{{student_refresh_token}}" }
```
Returns a new `access_token` (and usually a new `refresh_token`).

### Logout

- `POST {{base_url}}/auth/logout` with `Authorization: Bearer {{student_access_token}}` (no body needed).
