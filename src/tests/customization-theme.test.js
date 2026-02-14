const axios = require('axios');
const { cleanupAll, logCleanupResults } = require('./cleanup-helper');

require('dotenv').config();
const port = process.env.PORT || 4050;
const BASE_URL = process.env.API_BASE_URL || `http://localhost:${port}`;
const TEST_TIMEOUT = 30000;

console.warn(`\n🧪 Customization Theme Test Configuration:`);
console.warn(`   API Base URL: ${BASE_URL}`);
console.warn(`   Environment: ${process.env.NODE_ENV}\n`);

// Test data storage
let testUser = null;
let authToken = null;

// Track created resources for cleanup
let createdResources = {
  users: [],
  sites: [],
};

// Helper functions
const createAuthClient = (token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return axios.create({ baseURL: BASE_URL, headers });
};

const generateEmail = () => `test${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
const generateSlug = () => `test-theme-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// Sample theme data
const sampleTheme = {
  colors: {
    primary: '#2563eb',
    secondary: '#64748b',
    accent: '#0ea5e9',
    background: '#ffffff',
    backgroundAlt: '#f8fafc',
    surface: '#ffffff',
    border: '#e2e8f0',
    textPrimary: '#0f172a',
    textSecondary: '#64748b',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
  },
  fonts: {
    heading: { family: 'Inter', weights: [600, 700] },
    body: { family: 'Inter', weights: [400, 500] },
    mono: { family: 'JetBrains Mono', weights: [400] },
  },
  spacing: {
    base: 4,
    scale: [0, 1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64],
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
  },
};

// Legacy format data (for backward compatibility tests)
const legacyCustomization = {
  colors: {
    primary: '#4D16D1',
    secondary: '#6B7280',
    accent: '#F59E0B',
    background: '#ffffff',
    text: '#111827',
    textSecondary: '#6B7280',
  },
  fonts: {
    heading: 'Inter, sans-serif',
    body: 'Inter, sans-serif',
    button: 'Inter, sans-serif',
  },
};

// Cleanup function
const cleanupTestData = async () => {
  console.log('\n🧹 Cleaning up theme test data...');
  try {
    const results = await cleanupAll(createdResources, BASE_URL);
    logCleanupResults(results);
    createdResources = { users: [], sites: [] };
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
};

describe('Customization Theme API Tests', () => {
  jest.setTimeout(TEST_TIMEOUT);

  // Shared test site ID for all tests
  let testSiteId = null;

  // Setup: Create test user, auth token, and a single test site
  beforeAll(async () => {
    try {
      const client = createAuthClient();

      const userData = {
        email: generateEmail(),
        password: 'Test@123456',
        first_name: 'Theme',
        last_name: 'Tester',
        role: 'user',
      };

      await client.post('/auth/register', userData);
      const loginResponse = await client.post('/auth/login', {
        identifier: userData.email,
        password: userData.password,
      });

      const loginData = loginResponse.data.data;
      testUser = loginData.user || {
        user_id: loginData.user_id,
        email: loginData.email,
      };
      authToken = loginData.access_token;

      createdResources.users.push({ user_id: testUser.user_id, token: authToken });
      console.log('✅ Theme test user created:', testUser.email);

      // Create a single test site for all tests
      const authClient = createAuthClient(authToken);
      const siteResponse = await authClient.post('/sites', {
        name: 'Theme Test Site',
        slug: generateSlug(),
      });
      testSiteId = siteResponse.data.data.id;
      createdResources.sites.push({ site_id: testSiteId, token: authToken });
      console.log('✅ Theme test site created:', testSiteId);
    } catch (error) {
      console.error('❌ Failed to setup theme test:', error.response?.data || error.message);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('Theme CRUD Operations', () => {
    beforeEach(async () => {
      // Reset customization before each test in this section
      const client = createAuthClient(authToken);
      await client.post(`/sites/${testSiteId}/customization/reset`);
    });

    test('should save theme data to customization', async () => {
      const client = createAuthClient(authToken);

      const response = await client.put(`/sites/${testSiteId}/customization`, {
        theme: sampleTheme,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('theme');
    });

    test('should retrieve theme data from customization', async () => {
      const client = createAuthClient(authToken);

      // First save theme
      await client.put(`/sites/${testSiteId}/customization`, {
        theme: sampleTheme,
      });

      // Then retrieve
      const response = await client.get(`/sites/${testSiteId}/customization`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.theme).toBeDefined();
      expect(response.data.data.theme.colors.primary).toBe(sampleTheme.colors.primary);
      expect(response.data.data.theme.fonts.heading.family).toBe(sampleTheme.fonts.heading.family);
    });

    test('should update theme colors correctly', async () => {
      const client = createAuthClient(authToken);

      const updatedTheme = {
        ...sampleTheme,
        colors: {
          ...sampleTheme.colors,
          primary: '#dc2626', // Changed to red
          accent: '#f97316',
        },
      };

      const response = await client.put(`/sites/${testSiteId}/customization`, {
        theme: updatedTheme,
      });

      expect(response.status).toBe(200);

      // Verify update
      const getResponse = await client.get(`/sites/${testSiteId}/customization`);
      expect(getResponse.data.data.theme.colors.primary).toBe('#dc2626');
      expect(getResponse.data.data.theme.colors.accent).toBe('#f97316');
    });

    test('should update theme fonts correctly', async () => {
      const client = createAuthClient(authToken);

      const updatedTheme = {
        ...sampleTheme,
        fonts: {
          heading: { family: 'Playfair Display', weights: [600, 700] },
          body: { family: 'Lato', weights: [400, 500] },
          mono: { family: 'Fira Code', weights: [400] },
        },
      };

      const response = await client.put(`/sites/${testSiteId}/customization`, {
        theme: updatedTheme,
      });

      expect(response.status).toBe(200);

      // Verify update
      const getResponse = await client.get(`/sites/${testSiteId}/customization`);
      expect(getResponse.data.data.theme.fonts.heading.family).toBe('Playfair Display');
      expect(getResponse.data.data.theme.fonts.body.family).toBe('Lato');
    });

    test('should reset theme with customization reset', async () => {
      const client = createAuthClient(authToken);

      // First save theme
      await client.put(`/sites/${testSiteId}/customization`, {
        theme: sampleTheme,
      });

      // Reset
      const resetResponse = await client.post(`/sites/${testSiteId}/customization/reset`);
      expect(resetResponse.status).toBe(200);

      // Verify reset
      const getResponse = await client.get(`/sites/${testSiteId}/customization`);
      expect(getResponse.data.data.theme).toBeNull();
    });
  });

  describe('Backward Compatibility', () => {
    beforeEach(async () => {
      // Reset customization before each test
      const client = createAuthClient(authToken);
      await client.post(`/sites/${testSiteId}/customization/reset`);
    });

    test('should save legacy format (colors, fonts) without theme', async () => {
      const client = createAuthClient(authToken);

      const response = await client.put(`/sites/${testSiteId}/customization`, legacyCustomization);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('colors');
      expect(response.data.data).toHaveProperty('fonts');
    });

    test('should retrieve legacy format correctly', async () => {
      const client = createAuthClient(authToken);

      await client.put(`/sites/${testSiteId}/customization`, legacyCustomization);

      const response = await client.get(`/sites/${testSiteId}/customization`);

      expect(response.status).toBe(200);
      expect(response.data.data.colors.primary).toBe(legacyCustomization.colors.primary);
      expect(response.data.data.fonts.heading).toBe(legacyCustomization.fonts.heading);
    });

    test('should support both legacy and theme format simultaneously', async () => {
      const client = createAuthClient(authToken);

      const mixedData = {
        ...legacyCustomization,
        theme: sampleTheme,
      };

      const response = await client.put(`/sites/${testSiteId}/customization`, mixedData);

      expect(response.status).toBe(200);

      const getResponse = await client.get(`/sites/${testSiteId}/customization`);

      // Both should be present
      expect(getResponse.data.data.colors).toBeDefined();
      expect(getResponse.data.data.fonts).toBeDefined();
      expect(getResponse.data.data.theme).toBeDefined();
    });
  });

  describe('Theme Data Validation', () => {
    beforeEach(async () => {
      // Reset customization before each test
      const client = createAuthClient(authToken);
      await client.post(`/sites/${testSiteId}/customization/reset`);
    });

    test('should accept partial theme (colors only)', async () => {
      const client = createAuthClient(authToken);

      const partialTheme = {
        colors: {
          primary: '#008284',
          accent: '#14b8a6',
        },
      };

      const response = await client.put(`/sites/${testSiteId}/customization`, {
        theme: partialTheme,
      });

      expect(response.status).toBe(200);

      const getResponse = await client.get(`/sites/${testSiteId}/customization`);
      expect(getResponse.data.data.theme.colors.primary).toBe('#008284');
    });

    test('should accept partial theme (fonts only)', async () => {
      const client = createAuthClient(authToken);

      const partialTheme = {
        fonts: {
          heading: { family: 'Montserrat', weights: [600] },
        },
      };

      const response = await client.put(`/sites/${testSiteId}/customization`, {
        theme: partialTheme,
      });

      expect(response.status).toBe(200);

      const getResponse = await client.get(`/sites/${testSiteId}/customization`);
      expect(getResponse.data.data.theme.fonts.heading.family).toBe('Montserrat');
    });

    test('should preserve theme structure with nested objects', async () => {
      const client = createAuthClient(authToken);

      const complexTheme = {
        colors: sampleTheme.colors,
        fonts: sampleTheme.fonts,
        spacing: sampleTheme.spacing,
        shadows: sampleTheme.shadows,
      };

      const response = await client.put(`/sites/${testSiteId}/customization`, {
        theme: complexTheme,
      });

      expect(response.status).toBe(200);

      const getResponse = await client.get(`/sites/${testSiteId}/customization`);
      const savedTheme = getResponse.data.data.theme;

      // Verify nested structure preserved
      expect(savedTheme.spacing.base).toBe(4);
      expect(Array.isArray(savedTheme.spacing.scale)).toBe(true);
      expect(savedTheme.shadows.sm).toBeDefined();
      expect(savedTheme.fonts.heading.weights).toContain(600);
    });
  });

  describe('Theme Presets', () => {
    const themePresets = {
      'professional-blue': {
        colors: {
          primary: '#2563eb',
          secondary: '#64748b',
          accent: '#0ea5e9',
          background: '#ffffff',
          backgroundAlt: '#f8fafc',
          textPrimary: '#0f172a',
          textSecondary: '#64748b',
        },
      },
      'modern-purple': {
        colors: {
          primary: '#7c3aed',
          secondary: '#64748b',
          accent: '#a855f7',
          background: '#ffffff',
          backgroundAlt: '#faf5ff',
          textPrimary: '#1e1b4b',
          textSecondary: '#6b7280',
        },
      },
      'teal-professional': {
        colors: {
          primary: '#008284',
          secondary: '#64748b',
          accent: '#14b8a6',
          background: '#ffffff',
          backgroundAlt: '#f0fdfa',
          textPrimary: '#134e4a',
          textSecondary: '#6b7280',
        },
      },
    };

    beforeEach(async () => {
      // Reset customization before each test
      const client = createAuthClient(authToken);
      await client.post(`/sites/${testSiteId}/customization/reset`);
    });

    test('should apply professional-blue preset', async () => {
      const client = createAuthClient(authToken);
      const preset = themePresets['professional-blue'];

      const response = await client.put(`/sites/${testSiteId}/customization`, {
        theme: preset,
      });

      expect(response.status).toBe(200);

      const getResponse = await client.get(`/sites/${testSiteId}/customization`);
      expect(getResponse.data.data.theme.colors.primary).toBe('#2563eb');
    });

    test('should apply modern-purple preset', async () => {
      const client = createAuthClient(authToken);
      const preset = themePresets['modern-purple'];

      const response = await client.put(`/sites/${testSiteId}/customization`, {
        theme: preset,
      });

      expect(response.status).toBe(200);

      const getResponse = await client.get(`/sites/${testSiteId}/customization`);
      expect(getResponse.data.data.theme.colors.primary).toBe('#7c3aed');
    });

    test('should apply teal-professional preset', async () => {
      const client = createAuthClient(authToken);
      const preset = themePresets['teal-professional'];

      const response = await client.put(`/sites/${testSiteId}/customization`, {
        theme: preset,
      });

      expect(response.status).toBe(200);

      const getResponse = await client.get(`/sites/${testSiteId}/customization`);
      expect(getResponse.data.data.theme.colors.primary).toBe('#008284');
    });

    test('should switch between presets correctly', async () => {
      const client = createAuthClient(authToken);

      // Apply first preset
      await client.put(`/sites/${testSiteId}/customization`, {
        theme: themePresets['professional-blue'],
      });

      let getResponse = await client.get(`/sites/${testSiteId}/customization`);
      expect(getResponse.data.data.theme.colors.primary).toBe('#2563eb');

      // Switch to another preset
      await client.put(`/sites/${testSiteId}/customization`, {
        theme: themePresets['teal-professional'],
      });

      getResponse = await client.get(`/sites/${testSiteId}/customization`);
      expect(getResponse.data.data.theme.colors.primary).toBe('#008284');
    });
  });

  describe('Authorization', () => {
    test('should require authentication for theme update', async () => {
      const publicClient = createAuthClient(null);

      try {
        await publicClient.put(`/sites/${testSiteId}/customization`, {
          theme: sampleTheme,
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should prevent other users from updating theme', async () => {
      const client = createAuthClient();

      // Create another user
      const user2Data = {
        email: generateEmail(),
        password: 'Test@123456',
        first_name: 'Other',
        last_name: 'User',
        role: 'user',
      };

      await client.post('/auth/register', user2Data);
      const loginResponse = await client.post('/auth/login', {
        identifier: user2Data.email,
        password: user2Data.password,
      });
      const user2Token = loginResponse.data.data.access_token;
      createdResources.users.push({
        user_id: loginResponse.data.data.user_id || loginResponse.data.data.user?.user_id,
        token: user2Token,
      });

      const user2Client = createAuthClient(user2Token);

      try {
        await user2Client.put(`/sites/${testSiteId}/customization`, {
          theme: sampleTheme,
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect([401, 403, 404]).toContain(error.response.status);
      }
    });
  });
});
