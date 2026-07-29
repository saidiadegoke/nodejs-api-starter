# CRP SSO — Integration Guide

**Audience:** Engineers building the CRP dashboard, CRMS, or Attendance App  
**Prerequisite:** Read [crp-sso-integration.md](./crp-sso-integration.md) for architecture and security context  
**CRP issuer status:** Implemented in this API  
**Postman:** Import [`sso-swagger.yaml`](./sso-swagger.yaml) — see [postman-import.md](./postman-import.md)

This guide explains **how to call CRP's SSO endpoints** and **what each other app must build** (backend + frontend).

---

## 1. End-to-end flow

```mermaid
sequenceDiagram
  participant CRP_FE as CRP_Frontend
  participant CRP_API as CRP_API
  participant Target_FE as CRMS_or_Attendance_Frontend
  participant Target_API as CRMS_or_Attendance_API

  Note over CRP_FE,CRP_API: User already logged into CRP
  CRP_FE->>CRP_API: GET /sso/targets (Bearer token)
  CRP_API-->>CRP_FE: List of apps (crms, attendance)
  CRP_FE->>CRP_API: GET /sso/launch/crms?redirect_uri=... (Bearer token)
  CRP_API->>CRP_API: Sign 60s JWT
  CRP_API-->>Target_API: 302 redirect to /sso/callback?token=...
  Target_API->>CRP_API: GET /.well-known/jwks.json (cached)
  Target_API->>Target_API: Verify JWT, JIT user, create session
  Target_API-->>Target_FE: 302 redirect /dashboard
```

**Roles**

| App | Responsibility |
|---|---|
| **CRP API** | Issue token, publish JWKS (done) |
| **CRP frontend** | Show launch buttons, call `/sso/targets` + `/sso/launch` |
| **Target API** (CRMS / Attendance) | Verify token at `/sso/callback`, JIT user, set local session |
| **Target frontend** | Usually nothing special — user lands on dashboard after callback |

---

## 2. CRP API endpoints

Base URL examples: `https://crp.yourorg.com` (production), `http://localhost:5269` (local).

### 2.1 `GET /.well-known/jwks.json`

**Auth:** None (public)

**Purpose:** Public keys for CRMS/Attendance to verify handoff tokens.

**Response `200`**

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "crp-key-2026-07",
      "use": "sig",
      "alg": "RS256",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

**Response `503`** — SSO not configured on CRP (`CRP_SSO_*` env vars missing).

**Who calls this:** CRMS and Attendance backends only (not the browser). Cache for ~1 hour.

---

### 2.2 `GET /sso/targets`

**Auth:** `Authorization: Bearer <CRP access_token>`

**Purpose:** Tell the CRP dashboard which apps the user can open.

**Response `200` (SSO enabled)**

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "enabled": true,
    "issuer": "https://crp.yourorg.com",
    "targets": [
      {
        "app": "crms",
        "label": "CRMS",
        "launch_path": "/sso/launch/crms",
        "default_callback_url": null
      },
      {
        "app": "attendance",
        "label": "Attendance",
        "launch_path": "/sso/launch/attendance",
        "default_callback_url": null
      }
    ]
  }
}
```

**Response `200` (SSO disabled)** — returns `enabled: false` and empty `targets` (not an error).

**Response `401`** — missing or invalid Bearer token.

**Who calls this:** CRP frontend after login.

---

### 2.3 `GET /sso/launch/:targetApp`

**Auth:** `Authorization: Bearer <CRP access_token>`

**Path params**

| Param | Values |
|---|---|
| `targetApp` | `crms` or `attendance` |

**Query params**

| Param | Required | Description |
|---|---|---|
| `redirect_uri` | Yes* | Where CRP sends the user after signing the token. Must be `http` or `https`. |
| `callback_url` | Yes* | Alias for `redirect_uri` |

\*Required unless CRP has a default for that app in env (`CRMS_SSO_CALLBACK_URL` / `ATTENDANCE_SSO_CALLBACK_URL`).

**Example**

```http
GET /sso/launch/crms?redirect_uri=https://crms.yourorg.com/sso/callback
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Success `302`** — redirects to:

```
https://crms.yourorg.com/sso/callback?token=<signed-jwt>
```

**Errors**

| Status | When |
|---|---|
| `400` | Invalid `targetApp`, missing/invalid `redirect_uri`, user missing email or institution |
| `401` | Not authenticated |
| `503` | SSO issuer not configured on CRP |

**Who calls this:** CRP frontend (browser navigation or `window.location`). The relying party's callback URL must be passed as `redirect_uri`.

**Registrar requirements on CRP**

The logged-in user must have:

- `users.email` set
- `profiles.jupeb_university_id` set (institution scope)

Otherwise launch returns `400`.

---

### 2.4 Handoff token (what the target app receives)

JWT signed with RS256. Lifetime: **60 seconds**.

**Header**

```json
{ "alg": "RS256", "kid": "crp-key-2026-07" }
```

**Payload**

```json
{
  "sub": "b7e6c1e2-91b0-4e2a-9f3d-2f6a7d9c1234",
  "email": "registrar@institution.edu",
  "roles": ["institution_admin"],
  "institution_id": "82b3c1f8-e650-4e3b-8e3e-ca98b1d5a5b6",
  "aud": "crms",
  "iss": "https://crp.yourorg.com",
  "iat": 1753600000,
  "exp": 1753600060,
  "jti": "9c1e2b7a-...-uuid"
}
```

| Claim | Use on target app |
|---|---|
| `sub` | **Primary key** — store as `crp_global_id` (or similar); use for JIT find/create |
| `email` | Display, notifications; do not use alone to match users |
| `roles` | Map to local roles if needed |
| `institution_id` | Scope data access to this institution |
| `aud` | Must equal your app: `crms` or `attendance` |
| `iss` | Must equal `CRP_ISSUER` env on your app |
| `exp` | Reject expired tokens |
| `jti` | Optional replay check (Phase 2) |

---

## 3. CRP frontend — what to build

### 3.1 After login

1. Call `GET /sso/targets` with the user's access token.
2. If `data.enabled === false`, hide SSO buttons.
3. For each item in `data.targets`, render e.g. "Open CRMS" / "Open Attendance".

### 3.2 On button click

Build the launch URL and navigate the browser (full page redirect):

```js
const CRP_API = 'https://crp.yourorg.com';
const accessToken = getAccessToken(); // from login state

// Your app's callback — must match what the target backend exposes
const redirectUri = encodeURIComponent('https://crms.yourorg.com/sso/callback');

// Option A: if CRP launch accepts Bearer in header, use fetch then follow redirect
// Option B (simpler): open via a link that includes token — NOT recommended for security

// Recommended: same-origin proxy or window navigation with Authorization
// Most SPAs store the token and use:
window.location.href = `${CRP_API}/sso/launch/crms?redirect_uri=${redirectUri}`;
// with the access token sent via a short-lived cookie or a one-click API route on CRP FE that adds Authorization server-side
```

**Important:** `/sso/launch` requires the `Authorization: Bearer` header. A plain `<a href>` cannot send that header.

**Practical patterns**

| Pattern | How |
|---|---|
| **A. CRP frontend API route** | Next.js/React server action or BFF calls CRP `/sso/launch` with Bearer, returns `302` Location to browser |
| **B. Open in same tab via fetch** | `fetch(url, { headers: { Authorization }, redirect: 'manual' })` then `window.location = response.headers.get('Location')` (if CORS allows) |
| **C. Hidden form / server redirect** | Backend-for-frontend endpoint on CRP FE proxies the launch |

Simplest for many setups: **a small CRP frontend route** that reads the session token server-side and redirects to the final URL.

### 3.3 Callback URLs to pass

| Target | Typical `redirect_uri` |
|---|---|
| CRMS | `https://crms.yourorg.com/sso/callback` |
| Attendance | `https://attendance.yourorg.com/sso/callback` |

Use staging URLs in staging. Coordinate with each app's team — this must hit their **backend** callback route.

---

## 4. Target app backend (CRMS & Attendance)

Same steps for both apps. Only differences: `audience` env value and local user model.

### 4.1 Install dependencies

```bash
npm install express-jwt jwks-rsa
```

### 4.2 Environment variables

```env
CRP_JWKS_URI=https://reg-portal-api.morgengreen.cloud/.well-known/jwks.json
CRP_ISSUER=https://reg-portal-api.morgengreen.cloud
```

For CRMS, expected audience is `crms`. For Attendance, `attendance`.

### 4.3 Database — link CRP users

Add a stable foreign key on your local user/registrar table:

```sql
ALTER TABLE users ADD COLUMN crp_global_id UUID UNIQUE;
-- or VARCHAR if you prefer string storage
```

**JIT rule:** `findOne({ crp_global_id: claims.sub })` → if missing, `create` with claims from token. Never match only by email.

### 4.4 Verification middleware

**CRMS example** (`audience: 'crms'`):

```ts
import { expressjwt as jwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';

export const ssoGuard = jwt({
  secret: jwksRsa.expressJwtSecret({
    jwksUri: process.env.CRP_JWKS_URI!,
    cache: true,
    cacheMaxAge: 60 * 60 * 1000,
    rateLimit: true,
  }),
  audience: 'crms', // 'attendance' for Attendance app
  issuer: process.env.CRP_ISSUER!,
  algorithms: ['RS256'],
  getToken: (req) => {
    if (typeof req.query.token === 'string') return req.query.token;
    return undefined;
  },
});
```

### 4.5 Callback route

```ts
router.get('/sso/callback', ssoGuard, async (req, res) => {
  const claims = req.auth as {
    sub: string;
    email: string;
    roles: string[];
    institution_id: string;
  };

  let user = await User.findOne({ where: { crp_global_id: claims.sub } });

  if (!user) {
    user = await User.create({
      crp_global_id: claims.sub,
      email: claims.email,
      institution_id: claims.institution_id,
      // map roles locally as needed
    });
  }

  // Your session mechanism — examples:
  req.session.userId = user.id;
  // or issue your own JWT and set cookie

  res.redirect('/dashboard');
});
```

### 4.6 Error handling

Return `401` for invalid/expired/wrong-audience tokens (middleware does this automatically). Log verification failures for monitoring.

### 4.7 Checklist (backend)

- [ ] `GET /sso/callback` route exists and is reachable at the URL passed as `redirect_uri`
- [ ] JWKS fetched from CRP and cached
- [ ] `iss`, `aud`, `exp`, signature verified
- [ ] JIT user by `sub` (`crp_global_id`)
- [ ] Local session/cookie issued after success
- [ ] HTTPS in staging/production
- [ ] Wrong `aud` rejected (CRMS token cannot be used on Attendance)

---

## 5. Target app frontend (CRMS & Attendance)

Usually **minimal** — the callback is a backend route.

### 5.1 What happens in the browser

1. User clicks "Open CRMS" on CRP
2. Browser lands on `https://crms.yourorg.com/sso/callback?token=...`
3. Backend verifies, sets session cookie, redirects to `/dashboard`
4. Frontend loads dashboard as a normal logged-in user

### 5.2 Frontend tasks

| Task | Required? |
|---|---|
| Dedicated `/sso/callback` React page | No — backend handles GET |
| Handle `?token=` in SPA router | No — avoid exposing token to client JS if possible |
| Dashboard route after redirect | Yes — normal auth guard reads session cookie |
| Login page fallback | Yes — show login if SSO fails (`401` from callback) |

### 5.3 Optional: error page

If verification fails, redirect to `/login?error=sso_failed` instead of a raw `401` body.

### 5.4 SPA note

If your frontend is a SPA and `/sso/callback` is accidentally routed to the client, **fix server/nginx routing** so the request hits the API first. The token should be verified server-side, not in the browser.

---

## 6. Environment cheat sheet

### CRP (this API)

```env
CRP_SSO_ISSUER=https://crp.yourorg.com
CRP_SSO_CURRENT_KID=crp-key-2026-07
CRP_SSO_PRIVATE_KEY_PEM=...
CRP_SSO_JWKS_JSON={"keys":[...]}
# Optional defaults if launch omits redirect_uri:
# CRMS_SSO_CALLBACK_URL=https://crms.yourorg.com/sso/callback
# ATTENDANCE_SSO_CALLBACK_URL=https://attendance.yourorg.com/sso/callback
```

Generate keys: `npm run sso:generate-keys`

### CRMS

```env
CRP_JWKS_URI=https://crp.yourorg.com/.well-known/jwks.json
CRP_ISSUER=https://crp.yourorg.com
```

Audience at verify time: `crms`

### Attendance

```env
CRP_JWKS_URI=https://crp.yourorg.com/.well-known/jwks.json
CRP_ISSUER=https://crp.yourorg.com
```

Audience at verify time: `attendance`

---

## 7. Testing

### CRP

```bash
# JWKS public
curl https://crp.yourorg.com/.well-known/jwks.json

# Targets (replace TOKEN)
curl -H "Authorization: Bearer TOKEN" https://crp.yourorg.com/sso/targets

# Launch (browser or curl -L with Bearer)
curl -i -H "Authorization: Bearer TOKEN" \
  "https://crp.yourorg.com/sso/launch/crms?redirect_uri=https://crms.yourorg.com/sso/callback"
```

### Target app

- [ ] Valid token → logged in, redirected to dashboard
- [ ] Expired token (> 60s) → rejected
- [ ] Token with `aud: crms` rejected by Attendance
- [ ] Second login reuses same local user (no duplicate rows)
- [ ] Tampered token → signature failure

---

## 8. Common errors

| Symptom | Likely cause |
|---|---|
| `503 SSO issuer is not configured` | CRP missing `CRP_SSO_*` env vars |
| `400 redirect_uri required` | Launch called without `redirect_uri` and no env default |
| `400 User institution is required` | Registrar has no `profiles.jupeb_university_id` on CRP |
| `401` on launch | CRP access token missing/expired |
| `401` on target callback | Wrong `iss`/`aud`, expired token, or JWKS mismatch |
| User lands on target but not logged in | Callback hits frontend instead of API; session cookie not set |
| Duplicate users on target | JIT matching on email instead of `sub` |

---

## 9. What's next (Phase 2 — optional)

Not required for pilot:

- Redis `jti` replay protection
- Redirect URI allowlist on CRP
- Token in URL fragment instead of query string
- Shared `@yourorg/sso-verify` npm package

See [crp-sso-integration.md](./crp-sso-integration.md) §5.

---

## 10. Quick ownership matrix

| Work item | Owner repo |
|---|---|
| JWKS + token issuance | CRP API ✅ |
| "Open CRMS / Attendance" buttons | CRP frontend |
| `/sso/callback` + verify + JIT + session | CRMS API, Attendance API |
| Post-login dashboard | CRMS frontend, Attendance frontend |
