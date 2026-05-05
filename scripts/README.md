# Scripts

CLI helpers for managing the Role-Based Access Control (RBAC) system.

## Quick Start

### 1. Seed common roles and permissions

```bash
npm run rbac:setup
# or
node scripts/rbac.js setup-common
```

Creates standard roles (`super_admin`, `admin`, `agent`, `user`) and common permissions. The exact set is defined in `scripts/rbac.js` — edit there to match your app.

### 2. Assign a role to a user

```bash
npm run rbac add-role-to-user user@example.com admin
# or
node scripts/rbac.js add-role-to-user user@example.com admin
```

## Available Scripts

Master CLI: `npm run rbac`

Individual scripts:

- `npm run rbac:create-role` — create a new role
- `npm run rbac:create-permission` — create a new permission
- `npm run rbac:add-permission-to-role` — grant a permission to a role
- `npm run rbac:add-role-to-user` — assign a role to a user (optionally with expiry)
- `npm run rbac:set-user-password` — set a user's password by email (recovery / ops; bcrypt, min 8 chars)
- `npm run rbac:list-user-roles` — list a user's roles
- `npm run rbac:list-role-permissions` — list permissions for a role

## Command Reference

### Create a role

```bash
node scripts/rbac.js create-role <name> <display_name> [description]

# Example
node scripts/rbac.js create-role analyst "Analyst" "Read-only reporting access"
```

### Create a permission

```bash
node scripts/rbac.js create-permission <resource> <action> [description]

# Examples
node scripts/rbac.js create-permission users moderate "Moderate user accounts"
node scripts/rbac.js create-permission reports export "Export reports"
```

Permissions follow `resource.action` naming, e.g. `users.view`, `system.admin`.

### Add a permission to a role

```bash
node scripts/rbac.js add-permission-to-role <role_name> <permission_name>

# Example
node scripts/rbac.js add-permission-to-role admin system.admin
```

### Set a user's password (by email)

```bash
npm run rbac:set-user-password -- <email> <new_password>
# or
node scripts/rbac.js set-user-password <email> <new_password>
```

Requires `.env` with `DB_*`. Password must be at least **8** characters (same rule as `POST /auth/change-password`). Use `--` before arguments so npm does not swallow flags. Does not revoke existing sessions.

### Add a role to a user

```bash
node scripts/rbac.js add-role-to-user <user_email> <role_name> [expires_in_days]

# Examples
node scripts/rbac.js add-role-to-user user@example.com admin
node scripts/rbac.js add-role-to-user user@example.com agent 30   # expires in 30 days
```

### List / inspect

```bash
node scripts/rbac.js list-roles                            # all roles
node scripts/rbac.js list-permissions                      # all permissions
node scripts/rbac.js list-users                            # recent users
node scripts/rbac.js show-user-roles user@example.com      # user's roles
node scripts/rbac.js list-role-permissions admin           # role's permissions
node scripts/rbac.js compare-roles admin agent             # diff two roles
```

## Example Setup Flow

```bash
# 1. Seed base structure
npm run rbac:setup

# 2. Promote your first admin
npm run rbac add-role-to-user admin@yourcompany.com admin

# 3. Create custom roles as needed
npm run rbac create-role editor "Editor" "Edits content"
npm run rbac add-permission-to-role editor users.view

# 4. Give someone temporary elevated access
npm run rbac add-role-to-user temp@example.com admin 7   # 7-day admin
```

## Environment

Uses the same `.env` as the main app:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_db_password
DB_NAME=your_app
```

## Troubleshooting

- **Role not found** — `npm run rbac list-roles`
- **Permission not found** — `npm run rbac list-permissions`
- **User not found** — the user must already exist (register via `/auth/register` or seed one)
- **DB connection errors** — check `.env` and verify Postgres is reachable (`pg_isready`)

Run `node scripts/rbac.js --help` for full CLI usage.
