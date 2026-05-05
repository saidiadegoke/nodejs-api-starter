# Tests

Integration test suites for the API template.

## Test Files

- `auth.api.test.js` — Authentication and authorization flows
- `rbac.test.js` — Role-Based Access Control
- `assets.test.js` — Asset library (groups, upload, usage)
- `modules.api.test.js` — Smoke tests across mounted modules
- `setup.js` — Global test configuration
- `cleanup-helper.js` — Reusable test-data cleanup utilities
- `test-db-cleanup.js` — Standalone DB cleanup script

## Running Tests

```bash
npm test                # all tests with coverage
npm run test:auth       # auth only
npm run test:rbac       # RBAC only
npm run test:assets     # assets only
npm run test:watch      # watch mode
npm run test:verbose    # detailed output
npm run test:cleanup    # force-clean the test DB
```

## Test Database

Tests run against a separate database specified by `DB_NAME` in the test environment. Create it before the first run:

```bash
createdb your_app_test
```

The test runner uses `NODE_ENV=test`. Set `DB_NAME=your_app_test` (and other `DB_*` overrides) in `.env.test` or export them inline.

## Coverage

The bundled suites cover:

- **Auth** — register / verify phone OTP / login / refresh / logout / forgot-reset-change password
- **Profile** — get/update, stats, notification settings
- **RBAC** — role CRUD, permission CRUD, grant/revoke, user role assignment, direct permission overrides
- **Assets** — group CRUD, upload with validation, usage calculation

## Writing New Tests

Follow the patterns in `auth.api.test.js`:

- Use `supertest` against the exported `app` (avoid spinning a real server)
- Use the cleanup helpers in `cleanup-helper.js` to delete test-created rows after each suite
- Prefix test data with `test` in emails/usernames so `npm run test:cleanup` can find orphans

## Cleanup

If tests leave behind data (e.g. crashed mid-run):

```bash
npm run test:cleanup
```

This removes rows where `email LIKE 'test%@example.com'` across the tables the test suites create.
