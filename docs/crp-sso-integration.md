# Cross-System SSO Integration Specification
## CRP ↔ CRMS ↔ Attendance App

**Version:** 1.1  
**Status:** Phase 1 (CRP issuer) implemented; Phase 1 (relying parties) ready to build  
**Audience:** Backend engineers on CRP (Express/JS), CRMS (Express/TypeScript), and Attendance (Express/JS)

> **How-to guide:** For endpoint usage, frontend wiring, and relying-party checklists, see [crp-sso-integration-guide.md](./crp-sso-integration-guide.md).

---

## Quick path — read this first

| Phase | Goal | Effort (rough) | Ship when |
|---|---|---|---|
| **Phase 1 — MVP** | Registrar clicks "Open CRMS" → lands logged in | ~1 day CRP (done) + ~1–2 days per relying party | Pilot with one institution |
| **Phase 2 — Hardening** | Replay protection, safer transport, key rotation, shared lib | Add incrementally after pilot | Before full production rollout |

**Phase 1 is intentionally small.** You need only:

1. CRP signs a 60s RS256 token and redirects to the target app
2. Target app verifies signature + `iss` + `aud` + `exp`, JIT-links a local user by `sub`, sets a local session
3. Dashboard calls `GET /sso/targets` and redirects to `GET /sso/launch/:targetApp`

**Defer to Phase 2:** Redis `jti` replay tracking, fragment/POST transport, shared `@yourorg/sso-verify` package, formal key-rotation runbook.

---

## 1. Problem Statement

Three independently deployed systems with separate codebases and databases:

| System | Stack | Users | Purpose |
|---|---|---|---|
| **CRP** (Central Result Portal) | Node.js / Express (JS) | Institution registrars | Student registration per institution |
| **CRMS** (Central Result Management System) | Node.js / Express / TypeScript | Result recorders, registrar | Stores exam results per student |
| **Attendance App** | Node.js / Express | Students, admin | Attendance tracking, registrar-facing views |

**Requirement:** A registrar authenticated on CRP can open CRMS and Attendance **without a separate login**.

**Constraints:**
- No shared database or session store
- CRMS/Attendance must not call CRP on every request (availability)
- Extensible to more apps later

---

## 2. Architecture (unchanged core)

CRP is the **token issuer**. CRMS and Attendance are **relying parties** that verify tokens locally via CRP's public JWKS — no runtime dependency on CRP after the handoff.

```mermaid
sequenceDiagram
  participant Registrar
  participant CRP
  participant TargetApp as CRMS_or_Attendance

  Registrar->>CRP: Login (normal)
  Registrar->>CRP: GET /sso/launch/crms
  CRP->>CRP: Sign 60s RS256 JWT
  CRP->>TargetApp: Redirect with token
  TargetApp->>CRP: Fetch JWKS (cached)
  TargetApp->>TargetApp: Verify token, JIT user, local session
  TargetApp->>Registrar: Redirect /dashboard
```

### Why not simpler alternatives?

| Alternative | Why not |
|---|---|
| Shared DB / session | Couples three codebases |
| Validate every request against CRP | CRP downtime blocks logins; extra latency |
| Shared HS256 secret | One leak forges tokens everywhere; rotation needs sync deploys |
| Auth0 / Keycloak | Valid later; bigger infra lift than needed now |

RS256 + JWKS is the right minimum for **three independent Node apps** where only CRP holds identity.

---

## 3. Token contract

Same in both phases — relying parties should implement against this shape from day one.

### Payload

```json
{
  "sub": "b7e6c1e2-91b0-4e2a-9f3d-2f6a7d9c1234",
  "email": "registrar@institution.edu",
  "roles": ["institution_admin"],
  "institution_id": "82b3c1f8-e650-4e3b-8e3e-ca98b1d5a5b6",
  "institution_code": "UNILAG",
  "institution_short_code": "UNILAG",
  "short_code": "UNILAG",
  "aud": "crms",
  "iss": "https://crp.yourorg.com",
  "iat": 1753600000,
  "exp": 1753600060,
  "jti": "9c1e2b7a-...-uuid"
}
```

| Claim | Meaning | Phase 1 verify? |
|---|---|---|
| `sub` | Stable registrar ID (CRP `users.id`) | Yes — JIT join key |
| `email` | Registrar email | Optional display; don't re-match on this alone |
| `roles` | Role name strings | Map locally; don't blindly authorize from token alone |
| `institution_id` | `profiles.jupeb_university_id` (CRP UUID) | Yes — local reference |
| `institution_code` | `jupeb_universities.code` (e.g. `"UNILAG"`) — consistent across apps | **Yes** — cross-app institution mapping |
| `institution_short_code` / `short_code` | `jupeb_universities.short_name` (e.g. `"UNILAG"`) | Optional display / cross-app mapping |
| `aud` | `"crms"` or `"attendance"` | **Yes** |
| `iss` | CRP public URL | **Yes** |
| `exp` / `iat` | ≤ 60s lifetime | **Yes** |
| `jti` | Unique token ID | Phase 2 only (replay check) |

### Header

```json
{ "alg": "RS256", "kid": "crp-key-2026-07" }
```

---

## 4. Phase 1 — MVP (ship the pilot)

### 4.1 CRP — issuer ✅ implemented in this repo

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /.well-known/jwks.json` | Public | Public keys for verification |
| `GET /sso/targets` | Bearer token | List launchable apps for dashboard |
| `GET /sso/launch/:targetApp` | Bearer token | Mint token + redirect (`crms` \| `attendance`). Pass `redirect_uri` (or `callback_url`) query param. |

**Setup**

```bash
npm run sso:generate-keys
# Paste output into .env, then set issuer:
```

```env
CRP_SSO_ISSUER=https://crp.yourorg.com
CRP_SSO_CURRENT_KID=crp-key-2026-07
CRP_SSO_PRIVATE_KEY_PEM=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
CRP_SSO_JWKS_JSON={"keys":[...]}
# Optional defaults when launch omits redirect_uri:
# CRMS_SSO_CALLBACK_URL=https://crms.yourorg.com/sso/callback
# ATTENDANCE_SSO_CALLBACK_URL=https://attendance.yourorg.com/sso/callback
```

**Launch with callback at request time (preferred for now):**

```
GET /sso/launch/crms?redirect_uri=https://crms.yourorg.com/sso/callback
Authorization: Bearer <access_token>
```

`redirect_uri` must be `http` or `https`. If omitted, CRP falls back to the env default for that target (if set).

**Dashboard flow**

1. `GET /sso/targets` with the user's access token
2. Render a button per target; build launch URL with `redirect_uri` from the relying app
3. On click: `GET /sso/launch/{app}?redirect_uri=...` with the same Bearer token

**Code layout (this repo)**

| Concern | Path |
|---|---|
| Config | `src/shared/config/sso-keys.config.js` |
| Signing | `src/modules/auth/services/sso-token.service.js` |
| Handlers | `src/modules/auth/controllers/sso.controller.js` |
| Routes | `src/modules/auth/routes/sso.routes.js`, `well-known.routes.js` |

### 4.2 CRMS / Attendance — relying party (build next)

**One middleware + one callback route per app.** Copy the same pattern; only `audience` and local user model differ.

```bash
npm install express-jwt jwks-rsa
```

```ts
// middleware/ssoGuard.ts — CRMS example (audience: 'crms')
import { expressjwt as jwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';

export const ssoGuard = jwt({
  secret: jwksRsa.expressJwtSecret({
    jwksUri: process.env.CRP_JWKS_URI!,
    cache: true,
    cacheMaxAge: 60 * 60 * 1000,
    rateLimit: true,
  }),
  audience: 'crms', // 'attendance' in Attendance app
  issuer: process.env.CRP_ISSUER!,
  algorithms: ['RS256'],
  getToken: (req) => req.query.token as string | undefined,
});
```

```ts
// routes/ssoCallback.ts — Phase 1 (no Redis)
router.get('/sso/callback', ssoGuard, async (req, res) => {
  const claims = req.auth;

  let localUser = await RegistrarModel.findOne({ crpGlobalId: claims.sub });
  if (!localUser) {
    localUser = await RegistrarModel.create({
      crpGlobalId: claims.sub,
      email: claims.email,
      institutionId: claims.institution_id,
      role: 'registrar',
    });
  }

  req.session.userId = localUser.id;
  res.redirect('/dashboard');
});
```

**Phase 1 env (relying party)**

```env
CRP_JWKS_URI=https://crp.yourorg.com/.well-known/jwks.json
CRP_ISSUER=https://crp.yourorg.com
```

**Phase 1 transport:** redirect with `?token=...` is fine. Token expires in 60s.

### 4.3 Phase 1 testing checklist

- [ ] `GET /.well-known/jwks.json` returns `{ keys: [...] }`
- [ ] `GET /sso/targets` lists configured apps when SSO env is set
- [ ] Token for `aud: crms` accepted by CRMS, **rejected** by Attendance
- [ ] Token for `aud: attendance` accepted by Attendance, **rejected** by CRMS
- [ ] Expired token (> 60s) rejected
- [ ] Tampered payload fails signature verification
- [ ] First SSO login JIT-creates local user; second login reuses same record (no duplicate)
- [ ] HTTPS only in staging/production

### 4.4 Phase 1 rollout

1. ~~CRP issuer~~ ✅
2. CRMS: `/sso/callback` + JIT user + session → test against staging JWKS
3. Attendance: same pattern
4. Enable dashboard buttons for one pilot institution
5. Monitor verification failures and JIT provisioning for one cycle

---

## 5. Phase 2 — Hardening (after pilot)

Add these before wide production rollout. None block the pilot.

### 5.1 Redis replay protection (`jti`)

Prevents the same handoff token being used twice (e.g. back button).

```bash
npm install ioredis
```

```ts
const replayKey = `jti:${claims.jti}`;
if (await redis.get(replayKey)) return res.status(401).send('Token already used');
await redis.set(replayKey, '1', 'EX', 90);
```

Requires `REDIS_URL` on each relying party.

### 5.2 Safer token transport

Query strings can appear in server logs. Options (pick one):

- **Fragment redirect:** CRP redirects to `#token=...`; frontend reads fragment and POSTs to backend
- **Auto-submit POST form:** CRP renders HTML form that POSTs token to target `/sso/callback`

### 5.3 Shared verify package (optional)

Extract JWKS guard + replay check into `@yourorg/sso-verify` when CRMS and Attendance both exist and you want one place to patch verification logic. Not required for MVP — copy-paste is fine for two apps.

### 5.4 Key rotation

1. Generate new keypair with new `kid`
2. Add new public key to JWKS **alongside** old key
3. Switch CRP signer to new private key
4. Wait ≥ 1 JWKS cache TTL (1 hour) + margin
5. Remove old public key from JWKS

No relying-party redeploy needed if JWKS caching is enabled.

### 5.5 Phase 2 testing (add to Phase 1 list)

- [ ] Same token used twice — second attempt rejected (Redis)
- [ ] Key rotation: token signed with new `kid` verifies while old key still in JWKS
- [ ] JWKS cached — not refetched on every callback

### 5.6 Phase 2 rollout

1. Enable Redis replay on CRMS + Attendance
2. Switch transport to fragment or POST if log exposure is a concern
3. Document key rotation runbook for ops
4. Roll out to all institutions

---

## 6. Security reference

Full threat model — useful for review, not all required for Phase 1.

| Threat | Phase 1 mitigation | Phase 2 add-on |
|---|---|---|
| Token intercepted | 60s expiry | Fragment/POST transport |
| Token replayed (back button) | Short expiry only | Redis `jti` tracking |
| Forged token | RS256 — only CRP has private key | — |
| Wrong-app replay | `aud` check | — |
| MITM | HTTPS only | — |
| CRP key compromise | — | JWKS rotation procedure |
| Forged claims | Verify signature; trust claims only from verified token | — |
| Stale/wrong local user | Link by `sub`, not email/name | — |
| JWKS DoS | Cache 1 hour, refetch on `kid` miss | — |

---

## 7. Environment variables (complete)

**CRP** (this repo — implemented)

```env
CRP_SSO_ISSUER=https://crp.yourorg.com
CRP_SSO_CURRENT_KID=crp-key-2026-07
CRP_SSO_PRIVATE_KEY_PEM=<PEM>
CRP_SSO_JWKS_JSON={"keys":[...]}
# Optional launch defaults when redirect_uri is omitted (targetApp: crms | attendance)
# CRMS_SSO_CALLBACK_URL=https://crms.yourorg.com/sso/callback
# ATTENDANCE_SSO_CALLBACK_URL=https://attendance.yourorg.com/sso/callback
```

**CRMS / Attendance — Phase 1**

```env
CRP_JWKS_URI=https://crp.yourorg.com/.well-known/jwks.json
CRP_ISSUER=https://crp.yourorg.com
```

**CRMS / Attendance — Phase 2 add-on**

```env
REDIS_URL=redis://...
```

---

## 8. Appendix — reference implementation snippets

These match the original spec; use §4.2 for the lean MVP version.

<details>
<summary>CRP key generation (manual alternative to npm run sso:generate-keys)</summary>

```js
const { generateKeyPair, exportPKCS8, exportJWK } = require('jose');

async function generateKeys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  const privatePem = await exportPKCS8(privateKey);
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'crp-key-2026-07';
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';
  console.log({ privatePem, publicJwk });
}
generateKeys();
```

</details>

<details>
<summary>Shared @yourorg/sso-verify package (Phase 2)</summary>

```ts
import { expressjwt as jwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import Redis from 'ioredis';

export function createSsoGuard(audience: 'crms' | 'attendance') {
  return jwt({
    secret: jwksRsa.expressJwtSecret({
      jwksUri: process.env.CRP_JWKS_URI!,
      cache: true,
      cacheMaxAge: 60 * 60 * 1000,
      rateLimit: true,
    }),
    audience,
    issuer: process.env.CRP_ISSUER!,
    algorithms: ['RS256'],
    getToken: (req) => req.query.token as string | undefined,
  });
}

export async function checkReplay(redis: Redis, jti: string): Promise<boolean> {
  const key = `jti:${jti}`;
  if (await redis.get(key)) return false;
  await redis.set(key, '1', 'EX', 90);
  return true;
}
```

</details>
