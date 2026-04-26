# Setup Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 13+
- npm

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (use long random strings, e.g. `openssl rand -base64 48`)
- `CORS_ORIGIN` (comma-separated list of allowed frontend origins)

Leave `AWS_*`, `SMTP_*`, and OAuth client credentials blank if you don't use them — the corresponding features degrade gracefully.

### 3. Create the database

```bash
createdb your_app   # must match DB_NAME in .env
```

### 4. Run migrations and seed

```bash
npm run migrate
npm run seed
```

Seeding creates:

- A super admin user: **`admin@example.com`** with password **`Admin@12`** (change after first login; matches `src/db/seeds/001_seed_users.sql`).

`npm run seed` is idempotent: if `admin@example.com` already exists, the INSERT is skipped and the **password is not updated**. Older copies of this repo seeded a bcrypt hash for the plaintext **`password`** instead of **`Admin@12`**; if **`Admin@12`** does not work, try **`password`** once, then change password, or run the `UPDATE` suggested in comments at the top of `001_seed_users.sql`.

To set any user’s password from the shell (requires `DB_*` in `.env`): **`npm run rbac:set-user-password -- <email> <new_password>`** (see `scripts/README.md`).
- System roles: `super_admin`, `admin`, `agent`, `user`
- Base permissions on `system.*` and `users.*`
- A list of ~30 countries with ISO codes and phone codes

### 5. Start the server

```bash
npm run dev    # nodemon, auto-reload
# or
npm start      # production
```

Default port is `5000`. The API is available at:

- `GET /` — version info + endpoint list
- `GET /health` — liveness check
- `GET /docs` — Swagger UI index

### 6. Run tests

```bash
npm test                  # all tests with coverage
npm run test:auth         # auth only
npm run test:rbac         # RBAC only
npm run test:watch        # watch mode
npm run test:cleanup      # clear test data
```

## RBAC Management

Built-in CLI scripts manage roles and permissions without touching SQL:

```bash
npm run rbac:setup                    # seed common roles/permissions
npm run rbac:create-role              # new role
npm run rbac:create-permission        # new permission
npm run rbac:add-permission-to-role   # grant a permission to a role
npm run rbac:add-role-to-user         # assign a role to a user
npm run rbac:list-user-roles          # list a user's roles
npm run rbac:list-role-permissions    # list permissions under a role
```

Run `npm run rbac` with no args for full usage.

## Troubleshooting

### Database connection error

```bash
pg_isready                          # is Postgres running?
psql -U postgres -l | grep your_app # does the DB exist?

# Reset (destroys data)
dropdb your_app && createdb your_app
npm run migrate && npm run seed
```

### Port already in use

```bash
lsof -ti:5000 | xargs kill -9
```

### Migrations out of order

Migrations run in filename order (`src/db/migrations/*.sql`). The runner records applied files in **`schema_migrations`**. To replay during development, remove the matching row(s) from that table (or reset the database). The baseline schema ships as **`001_initial_schema.sql`** (one file); older clones that already ran the former `001`–`007` set must not expect a second `001_*` migration to apply automatically—use a fresh DB or reconcile `schema_migrations` if you hit conflicts.

## Next Steps

- Add a business module: copy the shape of `src/modules/users/` (routes + controllers + services + models) and mount it in `src/routes/index.js`.
- Add a Swagger spec for it: create `docs/{your-module}-swagger.yaml` and register it in the `swaggerDocs` map.
- Add permissions: append to `src/db/seeds/002_seed_rbac.sql` or use the RBAC CLI.

See `CONTRIBUTING.md` for conventions.
