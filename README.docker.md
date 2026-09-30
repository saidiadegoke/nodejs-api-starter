# Docker Deployment

This service can be deployed independently using Docker.

## Quick Start

1. **Set environment variables** in `.env` — every runtime value
   (including `PORT`) is sourced from this file via `env_file`. Copy
   `.env.example` and edit:
   ```bash
   APP_NAME=Your App
   NODE_ENV=production
   PORT=5269 # deploy port
   API_BASE_URL=https://api.your-domain.com
   FRONTEND_URL=https://your-domain.com
   CORS_ORIGIN=https://your-domain.com
   DB_HOST=your-postgres-host
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your-secure-password
   DB_NAME=your_app
   JWT_SECRET=your-strong-secret-key
   JWT_REFRESH_SECRET=your-strong-refresh-secret
   # Production providers — both default to mock when unset:
   JUPEB_NIN_PROVIDER=speedysms
   OTP_SMS_PROVIDER=speedysms   # when OTP_CHANNEL is sms or both
   SPEEDYSMS_API_KEY=sk_live_...
   # …plus the other sections in .env.example: file storage (S3 / DO Spaces),
   # SMTP, Attendance, CRMS, SSO (CRP_SSO_*), OCR, Remita, logging
   ```
   Compose does **not** hard-code any secrets or URLs in
   `docker-compose.yml`; if a value is missing from `.env`, it's missing
   in the container.

2. **Build and start**:
   ```bash
   docker compose up -d --build
   ```

3. **Run migrations and seed**:
   ```bash
   docker compose exec api npm run migrate
   docker compose exec api npm run seed
   ```

4. **Default admin** (after a successful seed): `admin@example.com` / `Admin@12`.
   This password is public (it is in the seed). Change it before the API is
   reachable from outside:
   ```bash
   docker compose exec api npm run rbac:set-user-password -- admin@example.com '<new password>'
   ```
   If login fails on an old volume, see **SETUP.md** (legacy `password` hash).

5. **SSO keys** (only if users launch CRMS / Attendance from this portal):
   ```bash
   docker compose exec api npm run sso:generate-keys
   ```
   Paste the printed `CRP_SSO_CURRENT_KID`, `CRP_SSO_PRIVATE_KEY_PEM` and
   `CRP_SSO_JWKS_JSON` into `.env`, set `CRP_SSO_ISSUER` to the public API URL and
   the `*_SSO_CALLBACK_URL`s, then `docker compose up -d` to reload. SSO stays off
   until all four `CRP_SSO_*` values are set.

## Production Checklist

- [ ] `NODE_ENV=production`, strong unique `JWT_SECRET` and `JWT_REFRESH_SECRET`.
- [ ] `JUPEB_NIN_PROVIDER=speedysms` — unset (or misspelled) means the mock
      provider, which accepts any 11-digit NIN without checking NIMC.
- [ ] `OTP_SMS_PROVIDER=speedysms` if `OTP_CHANNEL` is `sms` or `both` — otherwise
      SMS codes are only logged, never sent.
- [ ] `SPEEDYSMS_API_KEY` set (and `SPEEDYSMS_SIGNING_SECRET` if the account uses
      signed requests).
- [ ] `JUPEB_NIN_FORCE_UNAVAILABLE` unset (a test switch that fails every NIN check).
- [ ] `ATTENDANCE_PROVIDER` / `CRMS_PROVIDER` are `http` (the default), with
      their base URLs and secrets set; not `mock`.
- [ ] File storage: `DEFAULT_FILE_PROVIDER=s3` with the S3 / DO Spaces keys (the
      code default is `mock`).
- [ ] `SMTP_*` and `FROM_EMAIL` set, so verification and reset emails go out.
- [ ] `INSTITUTION_FRONTEND_URL` set (the login link in institution emails).
- [ ] `REMITA_SERVICE_TYPE_ID` set if Remita is enabled.
- [ ] `CORS_ORIGIN` lists only the real frontends; `API_DOCS_PASSWORD` set to
      protect `/docs`.
- [ ] Seeded admin password changed (step 4).
- [ ] One API replica. The NIN resolver job runs inside every API process, so
      several replicas would all run it.

## Environment Variables

See `.env.example` for the complete list, grouped by area. Lines marked
**PRODUCTION** there are values that must change from their defaults.

## Common Commands

```bash
docker compose build                   # build image
docker compose build --no-cache        # clean rebuild
docker compose up -d                   # start
docker compose logs -f                 # tail logs
docker compose stop                    # stop
docker compose down                    # stop and remove containers
docker compose exec api sh             # shell into the container
```

## Health Check

The container exposes a health check:

- URL: `http://localhost:${PORT}/health` (default `5269`)
- Status: `docker compose ps`

## Volumes

- `api_uploads` — persistent storage for file uploads (mounted at `/app/uploads`)

## Ports

- Default: `5269` (set via `PORT` in `.env`).
- `docker-compose.yml` binds `${PORT}:${PORT}` — same value inside and
  outside the container. Put a reverse proxy (Nginx / Traefik / Caddy)
  in front in production.
