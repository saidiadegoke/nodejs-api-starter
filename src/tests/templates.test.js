const axios = require('axios');
const { cleanupAll, logCleanupResults } = require('./cleanup-helper');

require('dotenv').config();
const port = process.env.PORT || 4050;
const BASE_URL = process.env.API_BASE_URL || `http://localhost:${port}`;
const TEST_TIMEOUT = 30000; // 30 seconds

// Log configuration at start
console.warn(`\n🧪 Templates Test Configuration:`);
console.warn(`   API Base URL: ${BASE_URL}`);
console.warn(`   Environment: ${process.env.NODE_ENV}\n`);

// Test data storage
let testUser = null;
let authToken = null;

// Track all created resources for cleanup
let createdResources = {
  users: [],
  templates: []
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

// Helper to generate random template name
const generateTemplateName = () => `Test Template ${Date.now()}`;

// Cleanup function to delete test data
const cleanupTestData = async () => {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    const results = await cleanupAll(createdResources, BASE_URL);
    logCleanupResults(results);

    // Reset tracking arrays
    createdResources = {
      users: [],
      templates: []
    };

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
};

describe('Templates API Tests', () => {
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
      await client.post('/auth/register', userData);
      
      // Login to get token and user info
      const loginResponse = await client.post('/auth/login', {
        identifier: userData.email,
        password: userData.password
      });
      
      // Extract user from login response
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

  describe('Template Creation with Default Pages', () => {
    test('should create template with default pages automatically', async () => {
      const client = createAuthClient(authToken);
      
      const templateData = {
        name: generateTemplateName(),
        description: 'Test template with default pages',
        config: {
          // Empty config - should trigger default pages creation
          pages: [],
          blocks: [],
          theme: {
            colors: {},
            fonts: {}
          }
        }
      };

      const response = await client.post('/templates', templateData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');
      expect(response.data.data).toHaveProperty('config');
      
      const templateId = response.data.data.id;
      createdResources.templates.push({ template_id: templateId, token: authToken });
      
      // Parse config from response
      const config = typeof response.data.data.config === 'string'
        ? JSON.parse(response.data.data.config)
        : response.data.data.config;
      
      // Verify default pages are present
      expect(config).toHaveProperty('pages');
      expect(Array.isArray(config.pages)).toBe(true);
      
      // Check for default page slugs
      const pageSlugs = config.pages.map(p => p.slug);
      const expectedDefaultPages = ['home', 'about', 'contact', 'services', 'store'];
      
      expectedDefaultPages.forEach(slug => {
        expect(pageSlugs).toContain(slug);
      });
      
      // Verify at least 5 pages (the default pages)
      expect(config.pages.length).toBeGreaterThanOrEqual(5);
      
      console.log('✅ Template created with default pages:', pageSlugs);
      
      // Verify blocks are present (default blocks for navigation, footer, etc.)
      expect(config).toHaveProperty('blocks');
      expect(Array.isArray(config.blocks)).toBe(true);
      expect(config.blocks.length).toBeGreaterThan(0);
      
      console.log('✅ Template created with default blocks:', config.blocks.length, 'blocks');
    });

    test('should create template with default pages even when config has existing pages', async () => {
      const client = createAuthClient(authToken);
      
      const templateData = {
        name: generateTemplateName(),
        description: 'Test template with existing pages',
        config: {
          // Config with only home page - should still add other defaults
          pages: [
            {
              slug: 'home',
              title: 'Home',
              layout: 'linear',
              blockIds: []
            }
          ],
          blocks: [],
          theme: {
            colors: {},
            fonts: {}
          }
        }
      };

      const response = await client.post('/templates', templateData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      
      const templateId = response.data.data.id;
      createdResources.templates.push({ template_id: templateId, token: authToken });
      
      // Parse config
      const config = typeof response.data.data.config === 'string'
        ? JSON.parse(response.data.data.config)
        : response.data.data.config;
      
      // Verify default pages are added (should have more than just home)
      const pageSlugs = config.pages.map(p => p.slug);
      const expectedDefaultPages = ['about', 'contact', 'services', 'store'];
      
      expectedDefaultPages.forEach(slug => {
        expect(pageSlugs).toContain(slug);
      });
      
      // Verify home page is still present (not duplicated)
      const homePages = config.pages.filter(p => p.slug === 'home');
      expect(homePages.length).toBe(1);
      
      console.log('✅ Template created with existing pages, defaults added:', pageSlugs);
    });

    test('should not duplicate pages when creating template with all default pages already present', async () => {
      const client = createAuthClient(authToken);
      
      const templateData = {
        name: generateTemplateName(),
        description: 'Test template with all default pages',
        config: {
          pages: [
            { slug: 'home', title: 'Home', layout: 'linear', blockIds: [] },
            { slug: 'about', title: 'About', layout: 'linear', blockIds: [] },
            { slug: 'contact', title: 'Contact', layout: 'linear', blockIds: [] },
            { slug: 'services', title: 'Services', layout: 'linear', blockIds: [] },
            { slug: 'store', title: 'Store', layout: 'linear', blockIds: [] }
          ],
          blocks: [],
          theme: {
            colors: {},
            fonts: {}
          }
        }
      };

      const response = await client.post('/templates', templateData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      
      const templateId = response.data.data.id;
      createdResources.templates.push({ template_id: templateId, token: authToken });
      
      // Parse config
      const config = typeof response.data.data.config === 'string'
        ? JSON.parse(response.data.data.config)
        : response.data.data.config;
      
      // Verify no duplicates (each slug should appear only once)
      const pageSlugs = config.pages.map(p => p.slug);
      const uniqueSlugs = [...new Set(pageSlugs)];
      
      expect(pageSlugs.length).toBe(uniqueSlugs.length);
      
      // Verify all default pages are still present
      const expectedDefaultPages = ['home', 'about', 'contact', 'services', 'store'];
      expectedDefaultPages.forEach(slug => {
        expect(pageSlugs).toContain(slug);
      });
      
      console.log('✅ Template created without duplicates:', pageSlugs);
    });

    test('should create template with default blocks', async () => {
      const client = createAuthClient(authToken);
      
      const templateData = {
        name: generateTemplateName(),
        description: 'Test template for default blocks',
        config: {
          pages: [],
          blocks: [],
          theme: {
            colors: {},
            fonts: {}
          }
        }
      };

      const response = await client.post('/templates', templateData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      
      const templateId = response.data.data.id;
      createdResources.templates.push({ template_id: templateId, token: authToken });
      
      // Parse config
      const config = typeof response.data.data.config === 'string'
        ? JSON.parse(response.data.data.config)
        : response.data.data.config;
      
      // Verify default blocks are present
      expect(config).toHaveProperty('blocks');
      expect(Array.isArray(config.blocks)).toBe(true);
      expect(config.blocks.length).toBeGreaterThan(0);
      
      // Check for default block IDs (navigation and footer)
      const blockIds = config.blocks.map(b => b.id);
      const expectedDefaultBlocks = ['block-nav-default', 'block-footer-default'];
      
      expectedDefaultBlocks.forEach(blockId => {
        expect(blockIds).toContain(blockId);
      });
      
      // Verify blocks have componentId set
      const navBlock = config.blocks.find(b => b.id === 'block-nav-default');
      const footerBlock = config.blocks.find(b => b.id === 'block-footer-default');
      
      if (navBlock) {
        expect(navBlock).toHaveProperty('componentId');
        expect(navBlock.componentId).toBe('topnav');
      }
      
      if (footerBlock) {
        expect(footerBlock).toHaveProperty('componentId');
        expect(footerBlock.componentId).toBe('footer');
      }
      
      console.log('✅ Template created with default blocks:', blockIds.slice(0, 5));
    });

    test('should not duplicate blocks when creating template with existing blocks', async () => {
      const client = createAuthClient(authToken);
      
      const templateData = {
        name: generateTemplateName(),
        description: 'Test template with existing blocks',
        config: {
          pages: [],
          blocks: [
            {
              id: 'block-nav-default',
              name: 'Navigation',
              componentId: 'topnav',
              data: {},
              order: 0
            },
            {
              id: 'block-footer-default',
              name: 'Footer',
              componentId: 'footer',
              data: {},
              order: 0
            }
          ],
          theme: {
            colors: {},
            fonts: {}
          }
        }
      };

      const response = await client.post('/templates', templateData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      
      const templateId = response.data.data.id;
      createdResources.templates.push({ template_id: templateId, token: authToken });
      
      // Parse config
      const config = typeof response.data.data.config === 'string'
        ? JSON.parse(response.data.data.config)
        : response.data.data.config;
      
      // Verify no duplicate blocks (each block ID should appear only once)
      const blockIds = config.blocks.map(b => b.id);
      const uniqueBlockIds = [...new Set(blockIds)];
      
      expect(blockIds.length).toBe(uniqueBlockIds.length);
      
      // Verify default blocks are still present
      expect(blockIds).toContain('block-nav-default');
      expect(blockIds).toContain('block-footer-default');
      
      console.log('✅ Template created without duplicate blocks');
    });
  });

  describe('Add Default Pages to Existing Template', () => {
    let createdTemplateId = null;

    test('should add default pages to existing template', async () => {
      const client = createAuthClient(authToken);
      
      // Create a template without default pages
      const templateData = {
        name: generateTemplateName(),
        description: 'Test template for adding defaults',
        config: {
          pages: [
            {
              slug: 'custom-page',
              title: 'Custom Page',
              layout: 'linear',
              blockIds: []
            }
          ],
          blocks: [],
          theme: {
            colors: {},
            fonts: {}
          }
        }
      };

      const createResponse = await client.post('/templates', templateData);
      createdTemplateId = createResponse.data.data.id;
      createdResources.templates.push({ template_id: createdTemplateId, token: authToken });
      
      // Verify template was created
      expect(createResponse.status).toBe(200);
      
      // Wait a bit to ensure template is fully created
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Add default pages
      const addResponse = await client.post(`/templates/${createdTemplateId}/default-pages`);

      expect(addResponse.status).toBe(200);
      expect(addResponse.data.success).toBe(true);
      
      // Parse updated config
      const updatedConfig = typeof addResponse.data.data.config === 'string'
        ? JSON.parse(addResponse.data.data.config)
        : addResponse.data.data.config;
      
      // Verify default pages are added
      const pageSlugs = updatedConfig.pages.map(p => p.slug);
      const expectedDefaultPages = ['home', 'about', 'contact', 'services', 'store'];
      
      expectedDefaultPages.forEach(slug => {
        expect(pageSlugs).toContain(slug);
      });
      
      // Verify custom page is still present
      expect(pageSlugs).toContain('custom-page');

      // Verify default blocks have templateId and componentName (builder UI shows "Template: X")
      const blocks = updatedConfig.blocks || [];
      const blocksWithTemplate = blocks.filter((b) => b.templateId);
      const blocksWithComponentName = blocks.filter((b) => b.componentName);
      expect(blocksWithTemplate.length).toBe(blocks.length);
      expect(blocksWithComponentName.length).toBe(blocks.length);

      const aboutHero = blocks.find((b) => b.id === 'block-about-hero');
      expect(aboutHero).toBeDefined();
      expect(aboutHero.templateId).toBe('hero-section-1');
      expect(aboutHero.componentName).toBe('About Hero');
      expect(aboutHero.data?.showPrimaryButton).toBe(false);
      expect(aboutHero.data?.showStats).toBe(false);
      expect(aboutHero.data?.headlineSize).toBe('medium');

      console.log('✅ Default pages added to existing template:', pageSlugs);
    });
  });

  describe('GET /templates/default-page-structure', () => {
    test('should return page and blocks for valid pageType', async () => {
      const client = createAuthClient(authToken);
      const res = await client.get('/templates/default-page-structure', { params: { pageType: 'about' } });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data).toHaveProperty('page');
      expect(res.data.data).toHaveProperty('blocks');
      expect(res.data.data.page.slug).toBe('about');
      const hero = res.data.data.blocks.find((b) => b.id === 'block-about-hero');
      expect(hero).toBeDefined();
      expect(hero.templateId).toBe('hero-section-1');
      expect(hero.componentName).toBe('About Hero');
      expect(hero.data?.showPrimaryButton).toBe(false);
      expect(hero.data?.headlineSize).toBe('medium');
    });

    test('should reject invalid pageType', async () => {
      const client = createAuthClient(authToken);
      await expect(client.get('/templates/default-page-structure', { params: { pageType: 'invalid' } }))
        .rejects.toMatchObject({ response: { status: 400 } });
    });
  });

  describe('Template Preview Service', () => {
    let testTemplateId = null;
    let testTemplateConfig = null;

    beforeAll(async () => {
      // Create a template with default pages and blocks for preview testing
      const client = createAuthClient(authToken);
      
      const templateData = {
        name: generateTemplateName(),
        description: 'Test template for preview service',
        config: {
          pages: [],
          blocks: [],
          theme: {
            colors: {
              primary: '#3b82f6',
              secondary: '#6b7280',
            },
            fonts: {
              heading: 'Inter, sans-serif',
              body: 'Inter, sans-serif',
            }
          }
        }
      };

      const response = await client.post('/templates', templateData);
      testTemplateId = response.data.data.id;
      createdResources.templates.push({ template_id: testTemplateId, token: authToken });
      
      // Parse config
      testTemplateConfig = typeof response.data.data.config === 'string'
        ? JSON.parse(response.data.data.config)
        : response.data.data.config;
    });

    test('should resolve blockIds to actual blocks in preview config', async () => {
      const PreviewService = require('../modules/sites/services/preview.service');
      
      // Get preview config
      const previewConfig = await PreviewService.previewTemplate(testTemplateId);
      
      // Verify preview config structure
      expect(previewConfig).toHaveProperty('site');
      expect(previewConfig).toHaveProperty('pages');
      expect(previewConfig).toHaveProperty('template');
      
      // Find home page
      const homePage = previewConfig.pages.find(p => p.slug === 'home');
      expect(homePage).toBeDefined();
      
      // Verify home page has content with regions
      expect(homePage.content).toBeDefined();
      expect(homePage.content.regions).toBeDefined();
      expect(Array.isArray(homePage.content.regions)).toBe(true);
      
      // Find header region
      const headerRegion = homePage.content.regions.find(r => r.regionId === 'header' || r.id === 'header');
      expect(headerRegion).toBeDefined();
      
      // Verify header region has blocks (not just blockIds)
      expect(headerRegion.blocks).toBeDefined();
      expect(Array.isArray(headerRegion.blocks)).toBe(true);
      expect(headerRegion.blocks.length).toBeGreaterThan(0);
      
      // Verify blocks have type set
      const navBlock = headerRegion.blocks.find(b => b.componentId === 'topnav' || b.type === 'topnav');
      expect(navBlock).toBeDefined();
      expect(navBlock).toHaveProperty('type');
      expect(navBlock.type).toBe('topnav');
      
      console.log('✅ BlockIds resolved to blocks:', headerRegion.blocks.map(b => ({ id: b.id, type: b.type })));
    });

    test('should set type from componentId when type is missing', async () => {
      const PreviewService = require('../modules/sites/services/preview.service');
      
      // Get preview config
      const previewConfig = await PreviewService.previewTemplate(testTemplateId);
      
      // Find home page
      const homePage = previewConfig.pages.find(p => p.slug === 'home');
      expect(homePage).toBeDefined();
      
      // Get all blocks from all regions
      const allBlocks = [];
      if (homePage.content.regions) {
        homePage.content.regions.forEach(region => {
          if (region.blocks && Array.isArray(region.blocks)) {
            allBlocks.push(...region.blocks);
          }
        });
      }
      
      // Verify all blocks have type set
      allBlocks.forEach(block => {
        expect(block).toHaveProperty('type');
        expect(typeof block.type).toBe('string');
        expect(block.type.length).toBeGreaterThan(0);
        
        // If block has componentId, type should match or be set from componentId
        if (block.componentId) {
          expect(block.type).toBe(block.componentId);
        }
      });
      
      console.log('✅ All blocks have type set:', allBlocks.map(b => ({ id: b.id, type: b.type, componentId: b.componentId })));
    });

    test('should include all blocks from home page in preview', async () => {
      const PreviewService = require('../modules/sites/services/preview.service');
      
      // Get preview config
      const previewConfig = await PreviewService.previewTemplate(testTemplateId);
      
      // Find home page
      const homePage = previewConfig.pages.find(p => p.slug === 'home');
      expect(homePage).toBeDefined();
      
      // Get main region blocks
      const mainRegion = homePage.content.regions.find(r => r.regionId === 'main' || r.id === 'main' || r.regionType === 'main');
      expect(mainRegion).toBeDefined();
      expect(mainRegion.blocks).toBeDefined();
      expect(Array.isArray(mainRegion.blocks)).toBe(true);
      
      // Verify home page has expected blocks (hero, features, stats, testimonials, cta)
      const blockTypes = mainRegion.blocks.map(b => b.type || b.componentId);
      const expectedBlockTypes = ['hero', 'features', 'stats', 'testimonials', 'cta'];
      
      // At least some of the expected blocks should be present
      const foundBlocks = expectedBlockTypes.filter(type => blockTypes.includes(type));
      expect(foundBlocks.length).toBeGreaterThan(0);
      
      console.log('✅ Home page blocks:', blockTypes);
      console.log('✅ Expected blocks found:', foundBlocks);
    });

    test('should include topnav and footer blocks in header and footer regions', async () => {
      const PreviewService = require('../modules/sites/services/preview.service');
      
      // Get preview config
      const previewConfig = await PreviewService.previewTemplate(testTemplateId);
      
      // Find home page
      const homePage = previewConfig.pages.find(p => p.slug === 'home');
      expect(homePage).toBeDefined();
      
      // Find header region
      const headerRegion = homePage.content.regions.find(r => 
        r.regionId === 'header' || r.id === 'header' || r.regionType === 'header'
      );
      expect(headerRegion).toBeDefined();
      
      // Verify topnav block is in header
      const topnavBlock = headerRegion.blocks.find(b => 
        b.type === 'topnav' || b.componentId === 'topnav'
      );
      expect(topnavBlock).toBeDefined();
      expect(topnavBlock.type).toBe('topnav');
      
      // Find footer region
      const footerRegion = homePage.content.regions.find(r => 
        r.regionId === 'footer' || r.id === 'footer' || r.regionType === 'footer'
      );
      expect(footerRegion).toBeDefined();
      
      // Verify footer block is in footer
      const footerBlock = footerRegion.blocks.find(b => 
        b.type === 'footer' || b.componentId === 'footer'
      );
      expect(footerBlock).toBeDefined();
      expect(footerBlock.type).toBe('footer');
      
      console.log('✅ Topnav block found:', topnavBlock.id);
      console.log('✅ Footer block found:', footerBlock.id);
    });

    test('should handle pages with both blockIds and embedded blocks', async () => {
      const PreviewService = require('../modules/sites/services/preview.service');
      
      // Get preview config
      const previewConfig = await PreviewService.previewTemplate(testTemplateId);
      
      // Verify all pages have resolved blocks
      previewConfig.pages.forEach(page => {
        if (page.content && page.content.regions) {
          page.content.regions.forEach(region => {
            // Regions should have blocks array, not just blockIds
            if (region.blocks) {
              expect(Array.isArray(region.blocks)).toBe(true);
              region.blocks.forEach(block => {
                expect(block).toHaveProperty('id');
                expect(block).toHaveProperty('type');
                expect(block).toHaveProperty('data');
              });
            }
          });
        }
      });
      
      console.log('✅ All pages have resolved blocks');
    });

    test('should preserve block order when resolving blockIds', async () => {
      const PreviewService = require('../modules/sites/services/preview.service');

      // Get preview config
      const previewConfig = await PreviewService.previewTemplate(testTemplateId);

      // Find home page
      const homePage = previewConfig.pages.find(p => p.slug === 'home');
      expect(homePage).toBeDefined();

      // Get main region blocks
      const mainRegion = homePage.content.regions.find(r => r.regionId === 'main' || r.id === 'main' || r.regionType === 'main');
      expect(mainRegion).toBeDefined();

      if (mainRegion.blocks && mainRegion.blocks.length > 1) {
        // Verify blocks are ordered correctly
        const orders = mainRegion.blocks.map(b => b.order || 0);
        const sortedOrders = [...orders].sort((a, b) => a - b);
        expect(orders).toEqual(sortedOrders);

        console.log('✅ Block order preserved:', orders);
      }
    });
  });

  /**
   * GET /preview/template/:templateId – HTTP endpoint response data
   * Equivalent to /preview?type=template&templateId=:id (app passes templateId in path).
   * Asserts that the returned config includes template.config.theme so the app can apply theme (e.g. Feature Grid).
   */
  describe('GET /preview/template/:templateId – response data', () => {
    let previewTemplateId = null;

    beforeAll(async () => {
      const client = createAuthClient(authToken);
      const templateData = {
        name: generateTemplateName(),
        description: 'Template for preview endpoint test',
        config: {
          pages: [{ slug: 'home', title: 'Home', layout: 'regions', regions: [] }],
          blocks: [],
          theme: {
            colors: {
              primary: '#dc2626',
              primaryLight: '#ef4444',
              primaryDark: '#b91c1c',
              accent: '#dc2626',
              accentLight: '#fef2f2',
              accentDark: '#b91c1c',
              textPrimary: '#111827',
              textSecondary: '#6b7280',
              background: '#ffffff',
              border: '#e5e7eb',
            },
            fonts: { heading: 'Inter', body: 'Inter' },
          },
        },
      };
      const response = await client.post('/templates', templateData);
      previewTemplateId = response.data.data.id;
      createdResources.templates.push({ template_id: previewTemplateId, token: authToken });
    });

    test('GET /preview/template/:templateId returns config with template.config.theme', async () => {
      const client = createAuthClient(); // no auth required for preview
      const res = await client.get(`/preview/template/${previewTemplateId}`);

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('success', true);
      expect(res.data).toHaveProperty('data');

      const data = res.data.data;
      expect(data).toHaveProperty('site');
      expect(data).toHaveProperty('pages');
      expect(data).toHaveProperty('template');

      const template = data.template;
      expect(template).toHaveProperty('id', previewTemplateId);
      expect(template).toHaveProperty('config');
      expect(template.config).toHaveProperty('theme');
      expect(template.config.theme).toHaveProperty('colors');
      expect(template.config.theme.colors).toHaveProperty('primary', '#dc2626');
      expect(template.config.theme.colors).toHaveProperty('accent', '#dc2626');
      expect(template.config.theme).toHaveProperty('fonts');
    });

    test('GET /preview/template/16 returns valid structure when template exists', async () => {
      const client = createAuthClient();
      const res = await client.get('/preview/template/16').catch((err) => err.response);

      if (res.status === 404) {
        expect(res.data).toHaveProperty('success', false);
        return;
      }
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('success', true);
      expect(res.data.data).toHaveProperty('template');
      expect(res.data.data.template).toHaveProperty('config');
      // Theme may be empty; ensure config is present so app can read template.config.theme
      expect(res.data.data.template.config).toBeDefined();
    });
  });

  describe('Block templateId and componentName Persistence', () => {
    let testTemplateId = null;

    // Create a template for block tests
    beforeAll(async () => {
      const client = createAuthClient(authToken);

      const templateData = {
        name: generateTemplateName(),
        description: 'Test template for block persistence',
        config: {
          pages: [
            {
              slug: 'home',
              title: 'Home',
              layout: 'regions',
              regions: [
                {
                  regionId: 'main',
                  regionName: 'Main Content',
                  regionType: 'main',
                  blockIds: []
                }
              ]
            }
          ],
          blocks: [],
          theme: { colors: {}, fonts: {} }
        }
      };

      const response = await client.post('/templates', templateData);
      testTemplateId = response.data.data.id;
      createdResources.templates.push({ template_id: testTemplateId, token: authToken });

      console.log('✅ Test template created for block persistence tests:', testTemplateId);
    });

    test('should save block with templateId and componentName', async () => {
      const client = createAuthClient(authToken);

      // Create a block with templateId and componentName
      const newBlock = {
        id: `block-${Date.now()}`,
        type: 'hero',
        componentId: 'hero',
        componentName: 'Hero Section',
        templateId: 'hero-section-1',
        data: {
          headline: 'Test Headline',
          subheadline: 'Test Subheadline'
        },
        settings: {},
        order: 0
      };

      // Get current template config
      const getResponse = await client.get(`/templates/${testTemplateId}`);
      const config = typeof getResponse.data.data.config === 'string'
        ? JSON.parse(getResponse.data.data.config)
        : getResponse.data.data.config;

      // Add block to config
      config.blocks = [...(config.blocks || []), newBlock];

      // Add block to home page main region
      const homePage = config.pages.find(p => p.slug === 'home');
      if (homePage && homePage.regions) {
        const mainRegion = homePage.regions.find(r => r.regionId === 'main');
        if (mainRegion) {
          mainRegion.blockIds = [...(mainRegion.blockIds || []), newBlock.id];
        }
      }

      // Update template
      const updateResponse = await client.put(`/templates/${testTemplateId}`, { config });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data.success).toBe(true);

      // Fetch template again to verify persistence
      const verifyResponse = await client.get(`/templates/${testTemplateId}`);
      const verifyConfig = typeof verifyResponse.data.data.config === 'string'
        ? JSON.parse(verifyResponse.data.data.config)
        : verifyResponse.data.data.config;

      // Find the saved block
      const savedBlock = verifyConfig.blocks.find(b => b.id === newBlock.id);

      expect(savedBlock).toBeDefined();
      expect(savedBlock.templateId).toBe('hero-section-1');
      expect(savedBlock.componentName).toBe('Hero Section');
      expect(savedBlock.componentId).toBe('hero');
      expect(savedBlock.type).toBe('hero');

      console.log('✅ Block saved with templateId and componentName:', {
        id: savedBlock.id,
        templateId: savedBlock.templateId,
        componentName: savedBlock.componentName,
        componentId: savedBlock.componentId
      });
    });

    test('should update block templateId', async () => {
      const client = createAuthClient(authToken);

      // Get current template config
      const getResponse = await client.get(`/templates/${testTemplateId}`);
      const config = typeof getResponse.data.data.config === 'string'
        ? JSON.parse(getResponse.data.data.config)
        : getResponse.data.data.config;

      // Find hero block and update its templateId
      const heroBlock = config.blocks.find(b => b.type === 'hero' || b.componentId === 'hero');
      expect(heroBlock).toBeDefined();

      const originalTemplateId = heroBlock.templateId;
      heroBlock.templateId = 'hero-section-2'; // Change to different template

      // Update template
      const updateResponse = await client.put(`/templates/${testTemplateId}`, { config });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data.success).toBe(true);

      // Fetch template again to verify update
      const verifyResponse = await client.get(`/templates/${testTemplateId}`);
      const verifyConfig = typeof verifyResponse.data.data.config === 'string'
        ? JSON.parse(verifyResponse.data.data.config)
        : verifyResponse.data.data.config;

      // Find the updated block
      const updatedBlock = verifyConfig.blocks.find(b => b.id === heroBlock.id);

      expect(updatedBlock).toBeDefined();
      expect(updatedBlock.templateId).toBe('hero-section-2');
      expect(updatedBlock.templateId).not.toBe(originalTemplateId);

      console.log('✅ Block templateId updated:', {
        id: updatedBlock.id,
        originalTemplateId,
        newTemplateId: updatedBlock.templateId
      });
    });

    test('should return all block fields for frontend display', async () => {
      const client = createAuthClient(authToken);

      // Fetch template
      const response = await client.get(`/templates/${testTemplateId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const config = typeof response.data.data.config === 'string'
        ? JSON.parse(response.data.data.config)
        : response.data.data.config;

      // Verify blocks array exists
      expect(config.blocks).toBeDefined();
      expect(Array.isArray(config.blocks)).toBe(true);

      // Check each block has the required fields for frontend display
      config.blocks.forEach(block => {
        // Required fields
        expect(block).toHaveProperty('id');
        expect(block).toHaveProperty('data');

        // Fields needed for display in Pages tab
        // Note: componentName and templateId may be undefined for old blocks
        // but should be present for newly created blocks
        console.log(`Block ${block.id}:`, {
          type: block.type,
          componentId: block.componentId,
          componentName: block.componentName,
          templateId: block.templateId
        });
      });

      // Find a block with all fields (the one we created in previous test)
      const completeBlock = config.blocks.find(b => b.templateId && b.componentName);

      if (completeBlock) {
        expect(completeBlock.templateId).toBeDefined();
        expect(completeBlock.componentName).toBeDefined();
        expect(completeBlock.componentId).toBeDefined();
        console.log('✅ Complete block for display:', {
          displayName: `Block: ${completeBlock.componentName}`,
          templateLine: `Template: ${completeBlock.templateId}`
        });
      }
    });

    test('should handle block without templateId (for components without templates)', async () => {
      const client = createAuthClient(authToken);

      // Create a text block (text component typically doesn't have templates)
      const textBlock = {
        id: `block-text-${Date.now()}`,
        type: 'text',
        componentId: 'text',
        componentName: 'Text Block',
        // No templateId - text blocks don't have template variants
        data: {
          heading: 'Test Heading',
          text: 'Test text content'
        },
        settings: {},
        order: 1
      };

      // Get current template config
      const getResponse = await client.get(`/templates/${testTemplateId}`);
      const config = typeof getResponse.data.data.config === 'string'
        ? JSON.parse(getResponse.data.data.config)
        : getResponse.data.data.config;

      // Add text block
      config.blocks = [...(config.blocks || []), textBlock];

      // Update template
      const updateResponse = await client.put(`/templates/${testTemplateId}`, { config });

      expect(updateResponse.status).toBe(200);

      // Verify
      const verifyResponse = await client.get(`/templates/${testTemplateId}`);
      const verifyConfig = typeof verifyResponse.data.data.config === 'string'
        ? JSON.parse(verifyResponse.data.data.config)
        : verifyResponse.data.data.config;

      const savedTextBlock = verifyConfig.blocks.find(b => b.id === textBlock.id);

      expect(savedTextBlock).toBeDefined();
      expect(savedTextBlock.componentName).toBe('Text Block');
      expect(savedTextBlock.templateId).toBeUndefined(); // Should not have templateId

      console.log('✅ Text block saved without templateId:', {
        id: savedTextBlock.id,
        componentName: savedTextBlock.componentName,
        templateId: savedTextBlock.templateId // undefined
      });
    });

    test('should preserve block data on reorder (update order)', async () => {
      const client = createAuthClient(authToken);

      // Get current template config
      const getResponse = await client.get(`/templates/${testTemplateId}`);
      const config = typeof getResponse.data.data.config === 'string'
        ? JSON.parse(getResponse.data.data.config)
        : getResponse.data.data.config;

      // Find blocks and swap their order
      const blocks = config.blocks;
      if (blocks.length >= 2) {
        const originalFirstBlock = { ...blocks[0] };
        const originalSecondBlock = { ...blocks[1] };

        // Swap orders
        blocks[0].order = 1;
        blocks[1].order = 0;

        // Update template
        const updateResponse = await client.put(`/templates/${testTemplateId}`, { config });
        expect(updateResponse.status).toBe(200);

        // Verify all block fields are preserved
        const verifyResponse = await client.get(`/templates/${testTemplateId}`);
        const verifyConfig = typeof verifyResponse.data.data.config === 'string'
          ? JSON.parse(verifyResponse.data.data.config)
          : verifyResponse.data.data.config;

        const verifyFirstBlock = verifyConfig.blocks.find(b => b.id === originalFirstBlock.id);
        const verifySecondBlock = verifyConfig.blocks.find(b => b.id === originalSecondBlock.id);

        // All fields should be preserved
        expect(verifyFirstBlock.templateId).toBe(originalFirstBlock.templateId);
        expect(verifyFirstBlock.componentName).toBe(originalFirstBlock.componentName);
        expect(verifyFirstBlock.componentId).toBe(originalFirstBlock.componentId);

        expect(verifySecondBlock.templateId).toBe(originalSecondBlock.templateId);
        expect(verifySecondBlock.componentName).toBe(originalSecondBlock.componentName);
        expect(verifySecondBlock.componentId).toBe(originalSecondBlock.componentId);

        console.log('✅ Block data preserved on reorder');
      }
    });
  });
});

