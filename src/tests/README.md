# RunCityGo Backend Tests

This directory contains comprehensive test suites for the RunCityGo backend API.

## Test Structure

### Test Files

- `auth.test.js` - Authentication and authorization tests
- `rbac.test.js` - Role-Based Access Control tests
- `setup.js` - Global test configuration and setup
- `cleanup-helper.js` - Test data cleanup utilities
- `test-db-cleanup.js` - Direct database cleanup script

## Running Tests

### All Tests
```bash
npm test
```

### Authentication Tests Only
```bash
npm run test:auth
```

### RBAC Tests Only
```bash
npm run test:rbac
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Verbose Output
```bash
npm run test:verbose
```

### Cleanup Test Database
```bash
npm run test:cleanup
```

This directly cleans the test database, useful when API cleanup fails.

## Test Coverage

The test suite covers:

### 1. Authentication & Authorization
- ✅ User registration (customer, shopper, dispatcher)
- ✅ Phone/email validation
- ✅ Duplicate user prevention
- ✅ Password validation
- ✅ Phone verification with OTP
- ✅ OTP resend with rate limiting
- ✅ Login with phone/email
- ✅ Token generation (access + refresh)
- ✅ Token refresh flow
- ✅ Logout
- ✅ Forgot password
- ✅ Password reset
- ✅ Change password

### 2. User Profile Management
- ✅ Get current user profile
- ✅ Update user profile
- ✅ Get user statistics
- ✅ Update notification settings
- ✅ Get public user profiles
- ✅ Email uniqueness validation

### 3. Delivery Address Management
- ✅ Add delivery address
- ✅ List delivery addresses
- ✅ Update delivery address
- ✅ Delete delivery address
- ✅ Default address handling

### 4. KYC Management
- ✅ Get KYC status
- ✅ Submit KYC documents
- ✅ Document validation

### 5. RBAC (Role-Based Access Control)
- ✅ Multiple roles per user
- ✅ Role-based endpoint access (requireRole middleware)
- ✅ Permission-based access (requirePermission middleware)
- ✅ requireAllPermissions middleware
- ✅ requireOwnerOrAdmin middleware
- ✅ Permission inheritance from roles
- ✅ Direct permission overrides
- ✅ Time-limited roles and permissions
- ✅ Combined permissions from multiple roles
- ✅ Customer, Shopper, Dispatcher, Admin role testing

## Test Data

Tests use randomly generated data to avoid conflicts:
- Phone numbers: `+234` + 10 random digits
- Emails: `test{timestamp}{random}@example.com`
- Passwords: `Test@123456` (meets validation requirements)

### Test Data Cleanup

**All test data is automatically cleaned up after tests complete**, whether they pass or fail:

1. **API Cleanup**: Tests use the `cleanup-helper.js` module to delete data via API
2. **Automatic Tracking**: All created resources (users, addresses) are tracked for cleanup
3. **Parallel Cleanup**: Cleanup runs in parallel for efficiency
4. **Failure Handling**: Cleanup runs even if tests fail
5. **Database Cleanup**: Use `npm run test:cleanup` for direct database cleanup if needed

**Cleanup Order**:
1. Addresses → deleted first
2. Sessions → logged out
3. Users → deleted last (cascades to related data)

**Tracked Resources**:
- Users (with auth tokens)
- Delivery addresses
- Sessions/tokens

## Environment

Tests run against a separate test database configured in `.env.test`:
- Database: `runcitygo_test_db`
- Port: `3001`
- JWT secrets: Test-specific secrets

## Important Notes

### OTP Verification
Real OTP verification requires SMS integration. Tests use mock OTPs when `USE_MOCK_OTP=true`:
- Mock OTP: `123456`

### File Uploads
File upload tests (profile photos, KYC documents) require actual file buffers in production. Current tests validate the endpoint structure.

### Rate Limiting
Rate limiting is disabled during tests (`RATE_LIMIT_ENABLED=false`) for faster execution.

### Database
Tests should run against a **separate test database** to avoid affecting development data.

## Writing New Tests

### Test Structure
```javascript
describe('Feature Name', () => {
  test('should do something', async () => {
    const client = createAuthClient(authTokens.customer);
    const response = await client.post('/endpoint', data);
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
  });
});
```

### Helper Functions
- `createAuthClient(token)` - Creates axios instance with auth
- `generatePhone()` - Generates random phone number
- `generateEmail()` - Generates random email

### Test Data Storage
Global `testUsers` and `authTokens` objects store created users and their tokens for use across tests.

## CI/CD Integration

Tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run tests
  run: |
    npm run migrate
    npm test
```

## Troubleshooting

### Test Timeouts
Increase timeout in `jest.config.js` or individual tests:
```javascript
jest.setTimeout(60000); // 60 seconds
```

### Connection Errors
Ensure PostgreSQL is running and test database exists:
```bash
createdb runcitygo_test_db
```

### Token Expiration
Tokens are refreshed within tests. If tests fail due to expired tokens, check token refresh logic.

## Future Enhancements

- [ ] Integration with CI/CD
- [ ] E2E testing with Cypress/Playwright
- [ ] Performance/load testing
- [ ] API contract testing
- [ ] Snapshot testing for responses
- [ ] Database seeding/cleanup automation
- [ ] Mock external services (SMS, email, payment)

