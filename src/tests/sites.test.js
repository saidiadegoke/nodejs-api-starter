const axios = require('axios');
const { cleanupAll, logCleanupResults } = require('./cleanup-helper');

// Ensure environment is loaded before getting BASE_URL
// Routes are mounted at root, so BASE_URL should be the server URL
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4050';
const TEST_TIMEOUT = 30000; // 30 seconds

// Log configuration at start
console.warn(`\n🧪 Sites Test Configuration:`);
console.warn(`   API Base URL: ${BASE_URL}`);
console.warn(`   Environment: ${process.env.NODE_ENV}\n`);

// Test data storage
let testUser = null;
let authToken = null;

// Track all created resources for cleanup
let createdResources = {
  users: [],
  sites: [],
  templates: [],
  pages: []
};

// Helper function to create axios instance with auth
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

// Helper to generate random email
const generateEmail = () => `test${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;

// Helper to generate random slug
const generateSlug = () => `test-site-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// Cleanup function to delete test data
const cleanupTestData = async () => {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    const results = await cleanupAll(createdResources, BASE_URL);
    logCleanupResults(results);

    // Reset tracking arrays
    createdResources = {
      users: [],
      sites: [],
      templates: [],
      pages: []
    };

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
};

describe('Sites API Tests', () => {
  jest.setTimeout(TEST_TIMEOUT);

  // Setup: Create test user and get auth token
  beforeAll(async () => {
    try {
      const client = createAuthClient();
      
      // Create test user
      const userData = {
        email: generateEmail(),
        password: 'Test@123456',
        first_name: 'Test',
        last_name: 'User',
        role: 'user'
      };
      
      // Register user
      const signupResponse = await client.post('/auth/register', userData);
      
      // Login to get token and user info (following context.test.js pattern)
      const loginResponse = await client.post('/auth/login', {
        identifier: userData.email,
        password: userData.password
      });
      
      // Extract user from login response (login response has user object with user_id)
      const loginData = loginResponse.data.data;
      testUser = loginData.user || {
        user_id: loginData.user_id,
        email: loginData.email,
        phone: loginData.phone,
        first_name: loginData.first_name,
        last_name: loginData.last_name,
        role: loginData.role
      };
      authToken = loginData.access_token;
      
      createdResources.users.push({ user_id: testUser.user_id, token: authToken });
      
      console.log('✅ Test user created and authenticated:', testUser.email, 'user_id:', testUser.user_id);
      
    } catch (error) {
      console.error('❌ Failed to setup test user:', error.response?.data || error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  });

  // Cleanup after all tests complete
  afterAll(async () => {
    await cleanupTestData();
  });

  describe('Sites CRUD Operations', () => {
    let createdSiteId = null;

    test('should create a new site', async () => {
      const client = createAuthClient(authToken);
      const siteData = {
        name: 'Test Site',
        slug: generateSlug()
      };

      const response = await client.post('/sites', siteData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');
      expect(response.data.data.name).toBe(siteData.name);
      expect(response.data.data.slug).toBe(siteData.slug);
      expect(response.data.data.owner_id).toBe(testUser.user_id);

      createdSiteId = response.data.data.id;
      createdResources.sites.push({ site_id: createdSiteId, token: authToken });
    });

    test('should fail to create site with duplicate slug', async () => {
      const client = createAuthClient(authToken);
      
      // First, ensure we have a site to duplicate
      if (!createdSiteId || createdResources.sites.length === 0) {
        const firstSiteResponse = await client.post('/sites', {
          name: 'First Site',
          slug: generateSlug()
        });
        createdSiteId = firstSiteResponse.data.data.id;
        createdResources.sites.push({ site_id: createdSiteId, token: authToken });
      }
      
      // Get the slug from the first site
      const firstSiteResponse = await client.get(`/sites/${createdResources.sites[0].site_id}`);
      const duplicateSlug = firstSiteResponse.data.data.slug;
      
      const siteData = {
        name: 'Duplicate Site',
        slug: duplicateSlug
      };

      try {
        await client.post('/sites', siteData);
        fail('Should have thrown an error');
      } catch (error) {
        // Check if it's an axios error with response
        if (error.response) {
          expect(error.response.status).toBe(400);
          expect(error.response.data.success).toBe(false);
        } else {
          throw error; // Re-throw if it's not an axios error
        }
      }
    });

    test('should fail to create site with invalid slug', async () => {
      const client = createAuthClient(authToken);
      const siteData = {
        name: 'Invalid Site',
        slug: 'Invalid Slug With Spaces!'
      };

      try {
        await client.post('/sites', siteData);
        fail('Should have thrown an error');
      } catch (error) {
        // Validation errors return 422 (Unprocessable Entity)
        expect(error.response.status).toBe(422);
      }
    });

    test('should get all sites for user', async () => {
      const client = createAuthClient(authToken);
      const response = await client.get('/sites');

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
      expect(response.data.data.length).toBeGreaterThan(0);
    });

    test('should get site by ID', async () => {
      const client = createAuthClient(authToken);
      if (!createdSiteId) {
        // Create a site if none exists
        const createResponse = await client.post('/sites', {
          name: 'Get Test Site',
          slug: generateSlug()
        });
        createdSiteId = createResponse.data.data.id;
        createdResources.sites.push({ site_id: createdSiteId, token: authToken });
      }

      const response = await client.get(`/sites/${createdSiteId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.id).toBe(createdSiteId);
      expect(response.data.data.owner_id).toBe(testUser.user_id);
    });

    test('should get site by slug', async () => {
      const client = createAuthClient(authToken);
      if (!createdSiteId) {
        const createResponse = await client.post('/sites', {
          name: 'Slug Test Site',
          slug: generateSlug()
        });
        createdSiteId = createResponse.data.data.id;
        createdResources.sites.push({ site_id: createdSiteId, token: authToken });
      }

      // Get the site first to get its slug
      const siteResponse = await client.get(`/sites/${createdSiteId}`);
      const slug = siteResponse.data.data.slug;

      const response = await client.get(`/sites/slug/${slug}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.slug).toBe(slug);
    });

    test('should update site', async () => {
      const client = createAuthClient(authToken);
      if (!createdSiteId) {
        const createResponse = await client.post('/sites', {
          name: 'Update Test Site',
          slug: generateSlug()
        });
        createdSiteId = createResponse.data.data.id;
        createdResources.sites.push({ site_id: createdSiteId, token: authToken });
      }

      const updateData = {
        name: 'Updated Site Name',
        status: 'inactive'
      };

      const response = await client.put(`/sites/${createdSiteId}`, updateData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.name).toBe(updateData.name);
      expect(response.data.data.status).toBe(updateData.status);
    });

    test('should fail to update site with duplicate slug', async () => {
      const client = createAuthClient(authToken);
      // Create another site
      const site2Response = await client.post('/sites', {
        name: 'Site 2',
        slug: generateSlug()
      });
      const site2Id = site2Response.data.data.id;
      createdResources.sites.push({ site_id: site2Id, token: authToken });

      // Get first site's slug
      const site1Response = await client.get(`/sites/${createdSiteId}`);
      const site1Slug = site1Response.data.data.slug;

      // Try to update site2 with site1's slug
      try {
        await client.put(`/sites/${site2Id}`, { slug: site1Slug });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.success).toBe(false);
      }
    });

    test('should fail to access another user\'s site', async () => {
      // Create another user (following context.test.js pattern)
      const client = createAuthClient();
      const user2Data = {
        email: generateEmail(),
        password: 'Test@123456',
        first_name: 'Test',
        last_name: 'User2',
        role: 'user'
      };
      
      // Register user
      const signupResponse = await client.post('/auth/register', user2Data);
      const user2Id = signupResponse.data.data.user_id;
      createdResources.users.push({ user_id: user2Id, token: null });
      
      // Login to get token
      const loginResponse = await client.post('/auth/login', {
        identifier: user2Data.email,
        password: user2Data.password
      });
      const user2Token = loginResponse.data.data.access_token;
      
      // Update the user resource with the token
      createdResources.users[createdResources.users.length - 1].token = user2Token;

      const user2Client = createAuthClient(user2Token);

      // Try to access first user's site
      try {
        await user2Client.get(`/sites/${createdSiteId}`);
        fail('Should have thrown an error');
      } catch (error) {
        // Should return 401 (Unauthorized) or 404 (Not Found) depending on implementation
        expect([401, 404]).toContain(error.response.status);
        expect(error.response.data.success).toBe(false);
      }
    });

    test('should delete site', async () => {
      const client = createAuthClient(authToken);
      // Create a site to delete
      const deleteSiteResponse = await client.post('/sites', {
        name: 'Delete Test Site',
        slug: generateSlug()
      });
      const deleteSiteId = deleteSiteResponse.data.data.id;

      const response = await client.delete(`/sites/${deleteSiteId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify site is deleted
      try {
        await client.get(`/sites/${deleteSiteId}`);
        fail('Site should not exist');
      } catch (error) {
        expect(error.response.status).toBe(404);
      }
    });
  });

  describe('Templates Operations', () => {
    let createdSiteId = null;
    let createdTemplateId = null;

    beforeAll(async () => {
      // Create a site for template tests
      const client = createAuthClient(authToken);
      const siteResponse = await client.post('/sites', {
        name: 'Template Test Site',
        slug: generateSlug()
      });
      createdSiteId = siteResponse.data.data.id;
      createdResources.sites.push({ site_id: createdSiteId, token: authToken });

      // Create a test template (this would normally be done via admin API or seed)
      // For now, we'll test with the assumption templates exist or create via direct DB
      // In a real scenario, you'd have a templates admin endpoint
    });

    test('should get all templates', async () => {
      const response = await axios.get(`${BASE_URL}/templates`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    test('should get template by ID', async () => {
      // First get all templates to get an ID
      const templatesResponse = await axios.get(`${BASE_URL}/templates`);
      
      if (templatesResponse.data.data.length > 0) {
        const templateId = templatesResponse.data.data[0].id;
        
        const response = await axios.get(`${BASE_URL}/templates/${templateId}`);

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.data.id).toBe(templateId);
        expect(response.data.data).toHaveProperty('config');
      } else {
        console.warn('No templates found to test with');
      }
    });

    test('should apply template to site', async () => {
      const client = createAuthClient(authToken);
      // Ensure we have a site
      if (!createdSiteId) {
        const createResponse = await client.post('/sites', {
          name: 'Template Apply Test Site',
          slug: generateSlug()
        });
        createdSiteId = createResponse.data.data.id;
        createdResources.sites.push({ site_id: createdSiteId, token: authToken });
      }
      // Get a template first
      const templatesResponse = await axios.get(`${BASE_URL}/templates`);
      
      if (templatesResponse.data.data.length > 0) {
        const templateId = templatesResponse.data.data[0].id;

        const response = await client.post(`/sites/${createdSiteId}/templates`, {
          templateId: templateId
        });

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      } else {
        console.warn('No templates found to test with');
      }
    });

    test('should get site template', async () => {
      const client = createAuthClient(authToken);
      // Ensure we have a site
      if (!createdSiteId) {
        const createResponse = await client.post('/sites', {
          name: 'Template Test Site',
          slug: generateSlug()
        });
        createdSiteId = createResponse.data.data.id;
        createdResources.sites.push({ site_id: createdSiteId, token: authToken });
      }
      const response = await client.get(`/sites/${createdSiteId}/templates`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });

  describe('Pages CRUD Operations', () => {
    let createdSiteId = null;
    let createdPageId = null;

    beforeAll(async () => {
      // Create a site for page tests
      const client = createAuthClient(authToken);
      const siteResponse = await client.post('/sites', {
        name: 'Page Test Site',
        slug: generateSlug()
      });
      createdSiteId = siteResponse.data.data.id;
      createdResources.sites.push({ site_id: createdSiteId, token: authToken });
    });

    test('should create a page', async () => {
      const client = createAuthClient(authToken);
      const pageData = {
        title: 'Test Page',
        slug: 'test-page',
        content: {
          blocks: [
            {
              id: '1',
              type: 'text',
              data: { content: 'Hello World' }
            }
          ]
        }
      };

      const response = await client.post(`/sites/${createdSiteId}/pages`, pageData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');
      expect(response.data.data.title).toBe(pageData.title);
      expect(response.data.data.slug).toBe(pageData.slug);

      createdPageId = response.data.data.id;
      createdResources.pages.push({ page_id: createdPageId, token: authToken });
    });

    test('should fail to create page with duplicate slug', async () => {
      const client = createAuthClient(authToken);
      const pageData = {
        title: 'Duplicate Page',
        slug: 'test-page' // Same slug as above
      };

      try {
        await client.post(`/sites/${createdSiteId}/pages`, pageData);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
      }
    });

    test('should get all pages for a site', async () => {
      const client = createAuthClient(authToken);
      // Ensure we have a site
      if (!createdSiteId) {
        const createResponse = await client.post('/sites', {
          name: 'Pages Test Site',
          slug: generateSlug()
        });
        createdSiteId = createResponse.data.data.id;
        createdResources.sites.push({ site_id: createdSiteId, token: authToken });
      }
      const response = await client.get(`/sites/${createdSiteId}/pages`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
      expect(response.data.data.length).toBeGreaterThan(0);
    });

    test('should get page by ID', async () => {
      const client = createAuthClient(authToken);
      if (!createdPageId) {
        const createResponse = await client.post(`/sites/${createdSiteId}/pages`, {
          title: 'Get Test Page',
          slug: 'get-test-page'
        });
        createdPageId = createResponse.data.data.id;
        createdResources.pages.push({ page_id: createdPageId, token: authToken });
      }

      const response = await client.get(`/sites/${createdSiteId}/pages/${createdPageId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.id).toBe(createdPageId);
    });

    test('should update page', async () => {
      const client = createAuthClient(authToken);
      if (!createdPageId) {
        const createResponse = await client.post(`/sites/${createdSiteId}/pages`, {
          title: 'Update Test Page',
          slug: 'update-test-page'
        });
        createdPageId = createResponse.data.data.id;
        createdResources.pages.push({ page_id: createdPageId, token: authToken });
      }

      const updateData = {
        title: 'Updated Page Title',
        published: true
      };

      const response = await client.put(`/sites/${createdSiteId}/pages/${createdPageId}`, updateData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.title).toBe(updateData.title);
      expect(response.data.data.published).toBe(updateData.published);
    });

    test('should create page version on update', async () => {
      const client = createAuthClient(authToken);
      if (!createdPageId) {
        const createResponse = await client.post(`/sites/${createdSiteId}/pages`, {
          title: 'Version Test Page',
          slug: 'version-test-page',
          content: { blocks: [] }
        });
        createdPageId = createResponse.data.data.id;
        createdResources.pages.push({ page_id: createdPageId, token: authToken });
      }

      // Update the page (should create a version)
      await client.put(`/sites/${createdSiteId}/pages/${createdPageId}`, {
        content: { blocks: [{ id: '1', type: 'text', data: {} }] }
      });

      // Get versions
      const response = await client.get(`/sites/${createdSiteId}/pages/${createdPageId}/versions`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
    });

    test('should delete page', async () => {
      const client = createAuthClient(authToken);
      // Create a page to delete
      const deletePageResponse = await client.post(`/sites/${createdSiteId}/pages`, {
        title: 'Delete Test Page',
        slug: 'delete-test-page'
      });
      const deletePageId = deletePageResponse.data.data.id;

      const response = await client.delete(`/sites/${createdSiteId}/pages/${deletePageId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify page is deleted
      try {
        await client.get(`/sites/${createdSiteId}/pages/${deletePageId}`);
        fail('Page should not exist');
      } catch (error) {
        expect(error.response.status).toBe(404);
      }
    });
  });

  describe('Customization Operations', () => {
    let createdSiteId = null;

    beforeAll(async () => {
      // Create a site for customization tests
      const client = createAuthClient(authToken);
      const siteResponse = await client.post('/sites', {
        name: 'Customization Test Site',
        slug: generateSlug()
      });
      createdSiteId = siteResponse.data.data.id;
      createdResources.sites.push({ site_id: createdSiteId, token: authToken });
    });

    test('should get customization settings (default)', async () => {
      const client = createAuthClient(authToken);
      const response = await client.get(`/sites/${createdSiteId}/customization`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('site_id');
    });

    test('should update customization settings', async () => {
      const client = createAuthClient(authToken);
      const customizationData = {
        colors: {
          primary: '#3B82F6',
          secondary: '#10B981',
          accent: '#F59E0B',
          background: '#FFFFFF',
          text: '#1F2937'
        },
        fonts: {
          heading: 'Inter, sans-serif',
          body: 'Inter, sans-serif'
        },
        spacing: {
          sectionPadding: '2rem',
          contentWidth: '1200px'
        }
      };

      const response = await client.put(`/sites/${createdSiteId}/customization`, customizationData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('colors');
    });

    test('should reset customization to default', async () => {
      const client = createAuthClient(authToken);
      const response = await client.post(`/sites/${createdSiteId}/customization/reset`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify it's reset
      const getResponse = await client.get(`/sites/${createdSiteId}/customization`);
      // Colors and fonts might be null or empty object after reset
      expect(getResponse.data.data.colors === null || Object.keys(getResponse.data.data.colors || {}).length === 0).toBe(true);
      expect(getResponse.data.data.fonts === null || Object.keys(getResponse.data.data.fonts || {}).length === 0).toBe(true);
    });
  });

  describe('Authorization Tests', () => {
    test('should require authentication for sites endpoints', async () => {
      const publicClient = createAuthClient(null);

      try {
        await publicClient.get('/sites');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should require authentication for pages endpoints', async () => {
      const publicClient = createAuthClient(null);
      // Use a valid site ID format (just needs to be a number, doesn't need to exist)
      const testSiteId = 999;

      try {
        await publicClient.get(`/sites/${testSiteId}/pages`);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should require authentication for customization endpoints', async () => {
      const publicClient = createAuthClient(null);
      // Use a valid site ID format (just needs to be a number, doesn't need to exist)
      const testSiteId = 999;

      try {
        await publicClient.get(`/sites/${testSiteId}/customization`);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });
  });
});

