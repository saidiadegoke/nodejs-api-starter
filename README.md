# Node.js API Template

A generic Node.js + Express + PostgreSQL starter template with JWT auth, RBAC, file/asset storage, notifications, real-time WebSocket, and Swagger docs.

Use this as a foundation for custom APIs — the modules included are intentionally domain-agnostic. Add your own business modules alongside the built-in ones.

## Maintainer & repository

- **Maintainer:** Saidi Adegoke — [rasheedsaidi@gmail.com](mailto:rasheedsaidi@gmail.com)  
- **Source:** [github.com/saidiadegoke/nodejs-api-starter](https://github.com/saidiadegoke/nodejs-api-starter)  
- **Security:** see [SECURITY.md](./SECURITY.md)

## What this project is (and is not)

**It is:** a batteries-included Express + PostgreSQL API starter with auth, RBAC, uploads, notifications, WebSockets, admin observability, API keys, webhooks, and OpenAPI docs—intended to be forked and extended for real products.

**It is not:** a managed SaaS, a compliance-certified stack, or a fully hardened production deployment. You are responsible for hosting, TLS, secrets rotation, dependency updates, abuse prevention, backups, and legal requirements for your jurisdiction.

## Before you ship to production

- Set strong, unique **`JWT_SECRET`** and **`JWT_REFRESH_SECRET`** (never use the dev defaults from `env.config.js`).
- Set **`NODE_ENV=production`**, tighten **`CORS_ORIGIN`** to your real front-end origins only.
- Protect **`/docs`** with **`API_DOCS_PASSWORD`** (or disable Swagger in production in your fork if you prefer).
- Lock down **`/admin/*`** (super-admin only in seeds—change default passwords, restrict by network or VPN if needed).
- Replace development-only auth flows: phone OTP (`123456` in dev), `SKIP_*` flags, and any mock providers are not acceptable for real users unless you redesign them.
- Configure **`SMTP_*`** / **`FROM_EMAIL`** for real email, or disable features that send mail.
- For S3-backed storage, set **`AWS_*`** and **`DEFAULT_FILE_PROVIDER=s3`** (see `.env.example`). For local-only dev, **`DEFAULT_FILE_PROVIDER=mock`** (default) avoids S3.
- Leave OAuth client env vars **empty** for providers you do not use—Passport only registers strategies when both ID and secret are set.
- Run **`npm audit`**, enable HTTPS at the edge (reverse proxy / load balancer), and add your own rate limiting and monitoring as needed (see note on `RATE_LIMIT_*` in `.env.example`).

## Optional features (leave unset to skip)

| Area | Env / behavior |
|------|----------------|
| OAuth (Google, Facebook, GitHub, Twitter) | Set both `*_CLIENT_ID` / secret (or `FACEBOOK_APP_*`, etc.). Empty = strategy not registered. |
| S3 uploads | `AWS_*`, `AWS_S3_BUCKET_NAME` or `AWS_S3_BUCKET`, `DEFAULT_FILE_PROVIDER=s3` |
| Transactional email | `SMTP_*`, `FROM_EMAIL` |
| Swagger basic auth | `API_DOCS_PASSWORD` |
| Storage quota | `STORAGE_LIMIT_MB` |

## Generated & local files (do not commit)

Keep secrets and machine-local output out of git. This repo’s `.gitignore` already excludes **`.env`**, **`coverage/`**, **`uploads/`**, **`logs/`**, and common IDE/OS junk. Run `git status` before every commit; never commit real API keys or database passwords.

## Features

- **Authentication** — JWT access + refresh tokens, phone OTP verification, password reset, OAuth (Google, Facebook, GitHub, Twitter)
- **RBAC** — Multiple roles per user, role/user-level permissions, direct permission overrides
- **Users** — Profiles, activity logs, addresses, KYC, notification settings
- **Files** — Multi-provider uploads (local / S3), base64, batch, profile photos
- **Assets** — Organized library with groups, tags, alt-text, storage-usage tracking
- **Notifications** — User-scoped in-app notifications (unread counts, read/delete)
- **WebSocket** — Socket.IO with JWT auth; per-user rooms for real-time events
- **Admin observability** — `/admin/error-logs` (errors + slow requests with full bodies), `/admin/settings` (runtime key/value platform config + feature flags), `/admin/audit` (audit log)
- **Request logging middleware** — hourly traffic counters on every request; full log entries persisted only for errors (4xx/5xx) and slow requests (>= 3s)
- **API Keys** — user-scoped, SHA-256-hashed at rest; raw key only shown once; `apiKeyAuth` middleware supports `Bearer sk_...` alongside JWT
- **Webhooks** — user-scoped subscriptions with HMAC-SHA256 signed payloads; fire-and-forget delivery via `WebhookService.fire(userId, event, payload)`
- **Swagger docs** — OpenAPI 3.0 specs served at `/docs`, auto-discoverable index
- **Countries** — Seeded reference lookup

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 13+
- npm

### Setup

```bash
# 1. Install deps
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum, set DB_*, JWT_SECRET, JWT_REFRESH_SECRET

# 3. Create the database (match DB_NAME in .env)
createdb your_app

# 4. Run migrations and seed
npm run migrate
npm run seed

# 5. Start the dev server
npm run dev
```

The API will be available at `http://localhost:5000` (configurable via `PORT`).

- API root: `GET /`
- Health check: `GET /health`
- Swagger docs: `GET /docs`

## Project Structure

```
api-template/
├── src/
│   ├── app.js                    # Express app setup
│   ├── server.js                 # HTTP server + WebSocket bootstrap
│   ├── config/                   # env / db config
│   ├── db/
│   │   ├── migrations/           # SQL migrations
│   │   ├── seeds/                # SQL seeds (admin user, RBAC)
│   │   ├── migrate.js
│   │   ├── seed.js
│   │   └── pool.js               # pg Pool
│   ├── modules/                  # Feature modules
│   │   ├── auth/                 # JWT + OAuth
│   │   ├── users/                # Profile, activity, addresses, KYC
│   │   ├── files/                # File uploads
│   │   ├── assets/               # Asset library + groups
│   │   ├── notifications/        # In-app notifications
│   │   ├── websocket/            # Socket.IO admin endpoints
│   │   ├── admin/                # Error logs, platform settings, audit log
│   │   ├── api-keys/             # User API key generation & auth
│   │   ├── webhooks/             # User-scoped webhook subscriptions
│   │   └── shared/               # Countries
│   ├── shared/                   # Cross-cutting: middleware, emails, utils
│   ├── routes/                   # Route aggregator + Swagger mount
│   └── tests/                    # Jest integration tests
├── docs/                         # OpenAPI YAML specs per module
├── scripts/                      # RBAC management CLI scripts
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── jest.config.js
└── package.json
```

## Database Schema

PostgreSQL with UUID primary keys. Core tables:

**Auth & users**: `users`, `profiles`, `social_accounts`, `user_sessions`, `password_resets`, `verification_tokens`

**RBAC**: `roles`, `permissions`, `user_roles`, `role_permissions`, `user_permissions`

**Files**: `files`, `asset_groups` (plus module-level `user_activities`, `notifications`, etc.)

**Reference**: `countries`

Migrations live in `src/db/migrations/` and run in filename order.

## Scripts

```bash
npm run dev              # nodemon
npm start                # node src/server.js
npm run migrate          # run all pending migrations
npm run seed             # seed admin user + RBAC
npm test                 # jest with coverage
npm run test:auth        # auth suite only
npm run test:rbac        # RBAC suite only

# RBAC CLI
npm run rbac:setup
npm run rbac:create-role
npm run rbac:create-permission
npm run rbac:add-permission-to-role
npm run rbac:add-role-to-user
npm run rbac:list-user-roles
npm run rbac:list-role-permissions
```

## API Documentation

Swagger UI is mounted at `/docs`. Each module has its own spec:

- `/docs/auth` — Authentication & OAuth
- `/docs/users` — User profile, activity, addresses, KYC
- `/docs/files` — File uploads
- `/docs/assets` — Asset library + groups
- `/docs/notifications` — In-app notifications
- `/docs/shared` — Countries reference
- `/docs/websocket` — Socket.IO admin stats
- `/docs/admin` — Error logs, platform settings, audit log
- `/docs/api-keys` — API key CRUD
- `/docs/webhooks` — Webhook subscriptions

Raw JSON: `/docs/{module}.json`. To password-protect `/docs`, set `API_DOCS_PASSWORD` in env (basic auth).

## Environment variables

Copy **`.env.example`** → **`.env`** and edit. It is kept in sync with variables read by the app (see comments inside the file for optional vs required).

**Always required for a running API:** `DB_*`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `API_BASE_URL` (used in links and OAuth callbacks), `CORS_ORIGIN` for browser clients.

**Production:** see [Before you ship to production](#before-you-ship-to-production) above.

## Docker

```bash
# Build + run
docker compose up -d --build

# Run migrations inside the container
docker compose exec api npm run migrate
docker compose exec api npm run seed
```

## Extending

Add a new module under `src/modules/{your_module}/` with the same shape as the existing ones (`routes.js` + `controllers/` + `services/` + `models/`), then:

1. Import and mount the router in `src/routes/index.js`
2. Add an OpenAPI spec in `docs/{your_module}-swagger.yaml` and register it in the `swaggerDocs` map in `src/routes/index.js`
3. Add a SQL migration in `src/db/migrations/` and any permissions to `src/db/seeds/002_seed_rbac.sql`

See `CONTRIBUTING.md` for conventions.

## License

MIT — see [LICENSE](./LICENSE).
