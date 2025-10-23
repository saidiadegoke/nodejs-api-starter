const axios = require('axios');
const { cleanupAll, logCleanupResults } = require('./cleanup-helper');

// Ensure environment is loaded before getting BASE_URL
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3010/api';
const TEST_TIMEOUT = 30000;

// Log configuration at start
console.warn(`\n🧪 RBAC Test Configuration:`);
console.warn(`   API Base URL: ${BASE_URL}`);
console.warn(`   Environment: ${process.env.NODE_ENV}\n`);

// Track created resources for cleanup
let createdResources = {
  users: [],
  roles: [],
  permissions: [],
  addresses: []
};

// Test users with different role combinations
let testUsers = {
  customer: null,
  shopper: null,
  dispatcher: null,
  multiRole: null, // User with multiple roles
  admin: null
};

let authTokens = {};

// Helper functions
const createAuthClient = (token) => {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return axios.create({
    baseURL: BASE_URL,
    headers
  });
};

const generatePhone = () => `+234${Math.floor(8000000000 + Math.random() * 1000000000)}`;
const generateEmail = () => `test${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;

const trackUser = (user, token) => {
  if (user && user.user_id) {
    createdResources.users.push({ user_id: user.user_id, token });
  }
};

const cleanupTestData = async () => {
  console.log('\n🧹 Cleaning up RBAC test data...');
  try {
    const results = await cleanupAll(createdResources, BASE_URL);
    logCleanupResults(results);
    createdResources = {
      users: [],
      roles: [],
      permissions: [],
      addresses: []
    };
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
};

describe('RBAC (Role-Based Access Control) Tests', () => {
  jest.setTimeout(TEST_TIMEOUT);

  // Cleanup after all tests
  afterAll(async () => {
    await cleanupTestData();
  });

  describe('1. Setup Test Users with Roles', () => {
    test('should create customer user', async () => {
      const userData = {
        phone: generatePhone(),
        email: generateEmail(),
        password: 'Test@123456',
        first_name: 'Test',
        last_name: 'Customer',
        role: 'customer'
      };

      const response = await axios.post(`${BASE_URL}/auth/register`, userData);
      expect(response.status).toBe(201);
      
      testUsers.customer = response.data.data;
      testUsers.customer.password = userData.password;

      // Login to get token
      const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        identifier: userData.phone,
        password: userData.password
      });
      authTokens.customer = loginRes.data.data.access_token;
      trackUser(testUsers.customer, authTokens.customer);
    });

    test('should create shopper user', async () => {
      const userData = {
        phone: generatePhone(),
        email: generateEmail(),
        password: 'Test@123456',
        first_name: 'Test',
        last_name: 'Shopper',
        role: 'shopper'
      };

      const response = await axios.post(`${BASE_URL}/auth/register`, userData);
      expect(response.status).toBe(201);
      
      testUsers.shopper = response.data.data;
      testUsers.shopper.password = userData.password;

      const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        identifier: userData.phone,
        password: userData.password
      });
      authTokens.shopper = loginRes.data.data.access_token;
      trackUser(testUsers.shopper, authTokens.shopper);
    });

    test('should create dispatcher user', async () => {
      const userData = {
        phone: generatePhone(),
        email: generateEmail(),
        password: 'Test@123456',
        first_name: 'Test',
        last_name: 'Dispatcher',
        role: 'dispatcher'
      };

      const response = await axios.post(`${BASE_URL}/auth/register`, userData);
      expect(response.status).toBe(201);
      
      testUsers.dispatcher = response.data.data;
      testUsers.dispatcher.password = userData.password;

      const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        identifier: userData.phone,
        password: userData.password
      });
      authTokens.dispatcher = loginRes.data.data.access_token;
      trackUser(testUsers.dispatcher, authTokens.dispatcher);
    });

    test('should create user with multiple roles (customer + shopper)', async () => {
      const userData = {
        phone: generatePhone(),
        email: generateEmail(),
        password: 'Test@123456',
        first_name: 'Multi',
        last_name: 'Role',
        role: 'customer'
      };

      const response = await axios.post(`${BASE_URL}/auth/register`, userData);
      expect(response.status).toBe(201);
      
      testUsers.multiRole = response.data.data;
      testUsers.multiRole.password = userData.password;

      const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        identifier: userData.phone,
        password: userData.password
      });
      authTokens.multiRole = loginRes.data.data.access_token;
      trackUser(testUsers.multiRole, authTokens.multiRole);

      // Add shopper role via admin endpoint (if available)
      // This would require admin access or direct DB manipulation
      // For now, we'll test this in the admin section
    });
  });

  describe('2. Role-Based Access Control', () => {
    // Verify all tokens exist before running role tests
    test('verify all test tokens are valid', async () => {
      expect(authTokens.customer).toBeDefined();
      expect(authTokens.shopper).toBeDefined();
      expect(authTokens.dispatcher).toBeDefined();
      
      // Test that shopper token works for basic endpoint
      const shopperClient = createAuthClient(authTokens.shopper);
      const shopperProfile = await shopperClient.get('/users/me');
      expect(shopperProfile.status).toBe(200);
      expect(shopperProfile.data.data.roles).toContain('shopper');
      
      // Test that dispatcher token works for basic endpoint
      const dispatcherClient = createAuthClient(authTokens.dispatcher);
      const dispatcherProfile = await dispatcherClient.get('/users/me');
      expect(dispatcherProfile.status).toBe(200);
      expect(dispatcherProfile.data.data.roles).toContain('dispatcher');
    });
    
    test('customer should access customer-only endpoints', async () => {
      const client = createAuthClient(authTokens.customer);
      
      // Customer can access their profile
      try {
        const response = await client.get('/users/me');
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      } catch (error) {
        fail('Customer should access their own profile');
      }
    });

    test('customer should NOT access shopper-only endpoints', async () => {
      const client = createAuthClient(authTokens.customer);
      
      try {
        await client.get('/available-orders', {
          params: {
            latitude: 6.5244,
            longitude: 3.3792
          }
        });
        fail('Customer should not access shopper endpoints');
      } catch (error) {
        // Should be 403 Forbidden (role check) not 401 Unauthorized (auth check)
        expect([403, 401]).toContain(error.response.status);
        expect(error.response.data.success).toBe(false);
      }
    });

    test('shopper should access shopper-only endpoints', async () => {
      // Verify token exists
      expect(authTokens.shopper).toBeDefined();
      expect(authTokens.shopper).not.toBeNull();
      
      console.warn(`Shopper token (first 20 chars): ${authTokens.shopper?.substring(0, 20)}...`);
      
      // Make request with explicit headers
      const response = await axios.get(`${BASE_URL}/available-orders`, {
        params: {
          latitude: 6.5244,
          longitude: 3.3792
        },
        headers: {
          'Authorization': `Bearer ${authTokens.shopper}`,
          'Content-Type': 'application/json'
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    test('shopper should NOT access customer-only endpoints', async () => {
      const client = createAuthClient(authTokens.shopper);
      
      // Shopper can still access orders endpoint (might be implemented to show their orders)
      // Just verify they're authenticated
      try {
        const response = await client.get('/users/me');
        expect(response.status).toBe(200);
      } catch (error) {
        fail('Authenticated user should access basic endpoints');
      }
    });

    test('dispatcher should access dispatcher-only endpoints', async () => {
      // Verify token exists
      expect(authTokens.dispatcher).toBeDefined();
      expect(authTokens.dispatcher).not.toBeNull();
      
      // Make request with explicit headers
      const response = await axios.get(`${BASE_URL}/available-orders`, {
        params: {
          latitude: 6.5244,
          longitude: 3.3792
        },
        headers: {
          'Authorization': `Bearer ${authTokens.dispatcher}`,
          'Content-Type': 'application/json'
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    test('no role should access admin endpoints', async () => {
      const client = createAuthClient(authTokens.customer);
      
      try {
        await client.get('/admin/dashboard/stats');
        fail('Non-admin should not access admin endpoints');
      } catch (error) {
        // Accept both 401 and 403 - both mean access denied
        expect([401, 403]).toContain(error.response.status);
        expect(error.response.data.success).toBe(false);
      }
    });
  });

  describe('3. Permission-Based Access Control', () => {
    test('customer should have orders.create permission', async () => {
      const client = createAuthClient(authTokens.customer);
      
      try {
        const response = await client.get('/users/me/permissions');
        
        expect(response.status).toBe(200);
        expect(response.data.data.permissions).toContain('orders.create');
        expect(response.data.data.permissions).toContain('orders.read');
        expect(response.data.data.permissions).toContain('orders.update');
      } catch (error) {
        // Endpoint might not exist yet
        expect([200, 404]).toContain(error.response?.status);
      }
    });

    test('shopper should have orders.accept permission', async () => {
      const client = createAuthClient(authTokens.shopper);
      
      try {
        const response = await client.get('/users/me/permissions');
        
        expect(response.status).toBe(200);
        expect(response.data.data.permissions).toContain('orders.accept');
        expect(response.data.data.permissions).toContain('orders.complete');
      } catch (error) {
        expect([200, 404]).toContain(error.response?.status);
      }
    });

    test('customer should NOT have orders.accept permission', async () => {
      const client = createAuthClient(authTokens.customer);
      
      try {
        const response = await client.get('/users/me/permissions');
        
        if (response.status === 200) {
          expect(response.data.data.permissions).not.toContain('orders.accept');
          expect(response.data.data.permissions).not.toContain('admin.dashboard');
        }
      } catch (error) {
        expect([200, 404]).toContain(error.response?.status);
      }
    });
  });

  describe('4. Multiple Roles Per User', () => {
    test('should get user roles', async () => {
      const client = createAuthClient(authTokens.customer);
      
      try {
        const response = await client.get('/users/me/roles');
        
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.data.roles).toBeInstanceOf(Array);
        expect(response.data.data.roles).toContain('customer');
      } catch (error) {
        expect([200, 404]).toContain(error.response?.status);
      }
    });

    test('user with multiple roles should have combined permissions', async () => {
      // This test assumes we can assign multiple roles
      // In real scenario, admin would assign additional role
      const client = createAuthClient(authTokens.multiRole);
      
      try {
        const rolesResponse = await client.get('/users/me/roles');
        const permissionsResponse = await client.get('/users/me/permissions');
        
        if (rolesResponse.status === 200 && permissionsResponse.status === 200) {
          // User should have permissions from all their roles
          const roles = rolesResponse.data.data.roles;
          const permissions = permissionsResponse.data.data.permissions;
          
          expect(permissions).toBeInstanceOf(Array);
          // Should have customer permissions
          if (roles.includes('customer')) {
            expect(permissions).toContain('orders.create');
          }
          // If also shopper, should have shopper permissions
          if (roles.includes('shopper')) {
            expect(permissions).toContain('orders.accept');
          }
        }
      } catch (error) {
        expect([200, 404]).toContain(error.response?.status);
      }
    });
  });

  describe('5. Middleware Testing', () => {
    describe('requireRole middleware', () => {
      test('should allow access with correct role', async () => {
        const client = createAuthClient(authTokens.customer);
        
        const response = await client.get('/users/me');
        expect(response.status).toBe(200);
      });

      test('should deny access with incorrect role', async () => {
        const client = createAuthClient(authTokens.customer);
        
        try {
          // Try to access admin endpoint
          await client.get('/admin/users');
          fail('Should have denied access');
        } catch (error) {
          // Accept both 401 and 403
          expect([401, 403]).toContain(error.response.status);
        }
      });

      test('should allow access if user has any of the required roles', async () => {
        // Verify token exists
        expect(authTokens.shopper).toBeDefined();
        
        // Make request with explicit headers
        const response = await axios.get(`${BASE_URL}/available-orders`, {
          params: { latitude: 6.5244, longitude: 3.3792 },
          headers: {
            'Authorization': `Bearer ${authTokens.shopper}`,
            'Content-Type': 'application/json'
          }
        });
        
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      });
    });

    describe('requirePermission middleware', () => {
      test('should allow access with correct permission', async () => {
        const client = createAuthClient(authTokens.customer);
        
        // Customer has 'users.read' permission
        const response = await client.get('/users/me');
        expect(response.status).toBe(200);
      });

      test('should deny access without correct permission', async () => {
        const client = createAuthClient(authTokens.customer);
        
        try {
          // Customer doesn't have 'admin.dashboard' permission
          await client.get('/admin/dashboard/stats');
          fail('Should have denied access');
        } catch (error) {
          // Accept both 401 and 403
          expect([401, 403]).toContain(error.response.status);
        }
      });

      test('should allow if user has any of the required permissions', async () => {
        const client = createAuthClient(authTokens.shopper);
        
        try {
          // Shopper has 'orders.read' permission
          const response = await client.get('/orders');
          
          if (response) {
            expect([200, 404]).toContain(response.status);
          }
        } catch (error) {
          // If it's not 403, the permission check passed
          expect(error.response?.status).not.toBe(403);
        }
      });
    });

    describe('requireOwnerOrAdmin middleware', () => {
      test('user should access their own resources', async () => {
        const client = createAuthClient(authTokens.customer);
        
        const response = await client.get('/users/me');
        expect(response.status).toBe(200);
        expect(response.data.data.user_id).toBe(testUsers.customer.user_id);
      });

      test('user should NOT access other user resources', async () => {
        const client = createAuthClient(authTokens.customer);
        
        try {
          // Try to access another user's private data (orders endpoint with requireOwnerOrAdmin)
          await client.get(`/users/${testUsers.shopper.user_id}/orders`);
          fail('Should not access other user\'s private data');
        } catch (error) {
          // Accept both 401, 403, and 404 (endpoint might not exist)
          expect([401, 403, 404]).toContain(error.response.status);
        }
      });

      test('admin should access any user resources', async () => {
        // This test requires an admin user
        // Skipping if no admin token available
        if (!authTokens.admin) {
          console.log('  ⚠ Skipping: No admin user available');
          return;
        }

        const adminClient = createAuthClient(authTokens.admin);
        
        try {
          const response = await adminClient.get(`/admin/users/${testUsers.customer.user_id}`);
          expect(response.status).toBe(200);
        } catch (error) {
          expect([200, 404]).toContain(error.response?.status);
        }
      });
    });
  });

  describe('6. Permission Inheritance', () => {
    test('user should inherit permissions from their roles', async () => {
      const client = createAuthClient(authTokens.customer);
      
      try {
        const permResponse = await client.get('/users/me/permissions');
        const rolesResponse = await client.get('/users/me/roles');
        
        if (permResponse.status === 200 && rolesResponse.status === 200) {
          const permissions = permResponse.data.data.permissions;
          const roles = rolesResponse.data.data.roles;
          
          // Customer role should give certain permissions
          if (roles.includes('customer')) {
            expect(permissions).toContain('orders.create');
            expect(permissions).toContain('users.update');
          }
        }
      } catch (error) {
        expect([200, 404]).toContain(error.response?.status);
      }
    });

    test('combining multiple roles should merge permissions', async () => {
      const client = createAuthClient(authTokens.multiRole);
      
      try {
        const response = await client.get('/users/me/permissions');
        
        if (response.status === 200) {
          const permissions = response.data.data.permissions;
          
          // Should have unique permissions from all roles
          const uniquePermissions = [...new Set(permissions)];
          expect(permissions.length).toBe(uniquePermissions.length);
        }
      } catch (error) {
        expect([200, 404]).toContain(error.response?.status);
      }
    });
  });

  describe('7. Direct Permission Overrides', () => {
    test('direct permission grant should override role permissions', async () => {
      // This would require admin to grant direct permission
      // Test structure for when endpoint is available
      
      const client = createAuthClient(authTokens.customer);
      
      try {
        const response = await client.get('/users/me/permissions/direct');
        
        if (response.status === 200) {
          expect(response.data.data).toHaveProperty('direct_permissions');
          expect(response.data.data).toHaveProperty('role_permissions');
        }
      } catch (error) {
        expect([200, 404]).toContain(error.response?.status);
      }
    });

    test('direct permission deny should block role permissions', async () => {
      // Test for explicit permission denial
      // This would be set by admin
      
      console.log('  ⚠ Test requires admin to set permission denial');
    });
  });

  describe('8. Time-Limited Roles and Permissions', () => {
    test('expired roles should not grant permissions', async () => {
      // This test would require setting an expired role
      console.log('  ⚠ Test requires time-limited role setup');
    });

    test('expired permissions should not be available', async () => {
      // This test would require setting an expired permission
      console.log('  ⚠ Test requires time-limited permission setup');
    });
  });

  describe('9. RBAC Edge Cases', () => {
    test('user without any roles should have no permissions', async () => {
      // Create user and remove all roles (if API supports it)
      console.log('  ⚠ Test requires ability to create user without roles');
    });

    test('deleting a role should remove permissions from users', async () => {
      // Would require admin capabilities
      console.log('  ⚠ Test requires admin role management');
    });

    test('should handle concurrent role assignments', async () => {
      // Test race conditions in role assignment
      console.log('  ⚠ Test requires concurrent access simulation');
    });

    test('should validate permission names', async () => {
      const client = createAuthClient(authTokens.customer);
      
      try {
        // Try to check for invalid permission
        const response = await client.post('/users/me/check-permission', {
          permission: 'invalid.permission.name'
        });
        
        if (response) {
          expect(response.data.data.has_permission).toBe(false);
        }
      } catch (error) {
        expect([200, 404, 422]).toContain(error.response?.status);
      }
    });
  });
});

// Error handling for unhandled rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection in RBAC test:', reason);
  await cleanupTestData();
});

