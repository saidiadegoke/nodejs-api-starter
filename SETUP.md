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
PORT=3010
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
API_BASE_URL=http://localhost:3010/api

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

**Migration 001 - Users & Auth:**
- ✅ users, profiles
- ✅ roles, permissions
- ✅ user_roles, role_permissions, user_permissions
- ✅ social_accounts, user_sessions
- ✅ password_resets, verification_tokens

**Migration 002 - Files, Locations, Orders:**
- ✅ countries (with ISO codes and phone codes)
- ✅ files (centralized file storage)
- ✅ locations (centralized GPS & address storage)
- ✅ user_addresses (multiple addresses per user)
- ✅ orders, order_items
- ✅ order_reference_photos, order_progress_photos
- ✅ order_timeline, order_location_tracking

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

Server will run on: `http://localhost:3010`

### 7. Run Tests

**In a separate terminal** (make sure server is running):

```bash
# Run all tests
npm test

# Run authentication tests only
npm run test:auth

# Run RBAC tests only
npm run test:rbac

# Run Order tests only
npm run test:orders

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
# Find process using port 3010
lsof -ti:3010

# Kill process
kill -9 $(lsof -ti:3010)
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
- API Info: `http://localhost:3010/api`
- Health Check: `http://localhost:3010/api/health`

### Authentication Endpoints
- Register: `POST http://localhost:3010/api/auth/register`
- Login: `POST http://localhost:3010/api/auth/login`
- Verify Phone: `POST http://localhost:3010/api/auth/verify-phone`

### User Endpoints (requires auth)
- Profile: `GET http://localhost:3010/api/users/me`
- Addresses: `GET http://localhost:3010/api/users/me/addresses`

### Order Endpoints (requires auth)
- Create Order: `POST http://localhost:3010/api/orders`
- List Orders: `GET http://localhost:3010/api/orders`
- Order Details: `GET http://localhost:3010/api/orders/:id`

### Public Endpoints
- Countries: `GET http://localhost:3010/api/shared/countries`

## Next Steps

1. ✅ Setup completed
2. ✅ Database migrated and seeded
3. ✅ Super admin created
4. ✅ Countries populated (Nigeria, US, UK, Ghana, Kenya, etc.)
5. 🔄 Run tests to verify everything works
6. 🚀 Start building features!

## Testing the API

### Quick API Test
```bash
# Test health endpoint
curl http://localhost:3010/api/health

# Register a new customer
curl -X POST http://localhost:3010/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "phone": "08012345678",
    "password": "Test@123456",
    "first_name": "Test",
    "last_name": "User",
    "role": "customer"
  }'

# Login
curl -X POST http://localhost:3010/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "test@example.com",
    "password": "Test@123456"
  }'

# Get countries
curl http://localhost:3010/api/shared/countries
```

## Need Help?

Check the test files for API usage examples:
- `src/tests/auth.test.js` - Authentication examples (30+ tests)
- `src/tests/rbac.test.js` - RBAC examples (40+ tests)
- `src/tests/orders.test.js` - Order management examples (30+ tests)
- `src/tests/README.md` - Complete test documentation

**Want to add a new module?** See `CONTRIBUTING.md` for step-by-step guide!

## 📧 Support

For questions or support, contact: info@runcitygo.com

