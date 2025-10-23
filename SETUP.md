# RunCityGo Backend Setup Guide

## Prerequisites
- Node.js v16+
- PostgreSQL v13+
- npm or pnpm

## Quick Start

### 1. Install Dependencies
```bash
cd runcitygo-backend
npm install
```

### 2. Setup Environment Variables
Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=runcitygo_db

# JWT Configuration
JWT_SECRET=dev-secret-key-change-in-production-12345678
JWT_EXPIRES_IN=1h
JWT_REFRESH_SECRET=dev-refresh-secret-key-change-in-production-12345678
JWT_REFRESH_EXPIRES_IN=30d

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# API Base URL
API_BASE_URL=http://localhost:3000/api

# Rate Limiting
RATE_LIMIT_ENABLED=false

# Logging
LOG_LEVEL=info
```

### 3. Create Database
```bash
# Using psql
psql -U postgres -c "CREATE DATABASE runcitygo_db;"

# Or using createdb
createdb -U postgres runcitygo_db
```

### 4. Run Migrations
```bash
npm run migrate
```

This will create all tables:
- ✅ users, profiles
- ✅ roles, permissions
- ✅ user_roles, role_permissions, user_permissions
- ✅ social_accounts, user_sessions
- ✅ password_resets, verification_tokens

### 5. Seed Database
```bash
npm run seed
```

This will create:
- ✅ 5 System Roles: customer, shopper, dispatcher, admin, support
- ✅ 20+ Base Permissions
- ✅ Role-Permission assignments
- ✅ 1 Super Admin user

**Super Admin Credentials:**
- Email: `admin@runcitygo.com`
- Phone: `+2348100000000`
- Password: `Admin@123456`

### 6. Start Server
```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

Server will run on: `http://localhost:3000`

### 7. Run Tests

**In a separate terminal** (make sure server is running):

```bash
# Run all tests
npm test

# Run authentication tests only
npm run test:auth

# Run RBAC tests only
npm run test:rbac

# Watch mode for development
npm run test:watch

# Verbose output
npm run test:verbose
```

## Seeded Data

### Roles Created
1. **customer** - Regular customers who create orders
2. **shopper** - Service providers who fulfill shopping orders
3. **dispatcher** - Delivery personnel
4. **admin** - Platform administrators (all permissions)
5. **support** - Customer support agents

### Permissions Created

**Orders:**
- orders.create, orders.read, orders.update, orders.delete
- orders.list, orders.accept, orders.complete

**Users:**
- users.read, users.update, users.manage, users.delete

**Payments:**
- payments.read, payments.create, payments.refund

**Wallet:**
- wallet.read, wallet.withdraw, wallet.topup

**Support:**
- support.tickets, support.respond

**Admin:**
- admin.dashboard, admin.reports, admin.settings

### Role-Permission Mapping

| Permission | Customer | Shopper | Dispatcher | Support | Admin |
|------------|----------|---------|------------|---------|-------|
| orders.create | ✓ | | | | ✓ |
| orders.accept | | ✓ | ✓ | | ✓ |
| orders.complete | | ✓ | ✓ | | ✓ |
| users.manage | | | | ✓ | ✓ |
| wallet.withdraw | | ✓ | ✓ | | ✓ |
| admin.* | | | | | ✓ |

## Test Users

**Only Super Admin is seeded.** All other test users are created dynamically during tests and automatically cleaned up after tests complete.

## Database Cleanup

If tests fail or you need to clean up test data:

```bash
# Clean test data from database
npm run test:cleanup
```

This will remove all test users (emails like `test%@example.com`).

## Troubleshooting

### Database Connection Error
```bash
# Check if PostgreSQL is running
pg_isready

# Check if database exists
psql -U postgres -l | grep runcitygo_db

# Recreate database if needed
dropdb -U postgres runcitygo_db
createdb -U postgres runcitygo_db
npm run migrate
npm run seed
```

### Port Already in Use
```bash
# Find process using port 3000
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)
```

### Migration Errors
```bash
# Reset database (⚠️ This will delete all data)
dropdb -U postgres runcitygo_db
createdb -U postgres runcitygo_db
npm run migrate
npm run seed
```

### Test Failures
```bash
# Ensure server is running
npm run dev

# In another terminal, run tests
npm test

# If tests leave data behind
npm run test:cleanup
```

## API Endpoints

Once server is running, access:
- API Info: `http://localhost:3000/api`
- Health Check: `http://localhost:3000/api/health`
- User Profile: `http://localhost:3000/api/users/me` (requires auth)

## Next Steps

1. ✅ Setup completed
2. ✅ Database migrated and seeded
3. ✅ Super admin created
4. 🔄 Run tests to verify everything works
5. 🚀 Start building features!

## Need Help?

Check the test files for API usage examples:
- `src/tests/auth.test.js` - Authentication examples
- `src/tests/rbac.test.js` - RBAC examples
- `src/tests/README.md` - Complete test documentation

