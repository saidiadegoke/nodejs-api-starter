/**
 * Bio Template Tests
 * 
 * Tests for:
 * 1. Bio template creation - should NOT merge with default pages
 * 2. Applying bio template to site - should NOT add default pages
 * 3. Site creation with bio template - should have single bio page
 */

const axios = require('axios');
const { cleanupAll, logCleanupResults } = require('./cleanup-helper');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4050';
const TEST_TIMEOUT = 30000;

let testUser = null;
let authToken = null;
let createdResources = {
  users: [],
  sites: [],
  templates: [],
  sessions: [],
};

const createAuthClient = (token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return axios.create({ baseURL: BASE_URL, headers });
};

const generateEmail = () => `test${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;

const trackUser = (user, token) => {
  if (user && user.user_id) {
    createdResources.users.push({ user_id: user.user_id, token });
  }
};

const cleanupTestData = async () => {
  console.log('\n🧹 Cleaning up bio template test data...');
  try {
    for (const site of createdResources.sites) {
      try {
        const client = createAuthClient(site.token);
        await client.delete(`/sites/${site.site_id}`);
      } catch (e) { /* ignore */ }
    }
    for (const tmpl of createdResources.templates) {
      try {
        const client = createAuthClient(tmpl.token);
        await client.delete(`/templates/${tmpl.template_id}`);
      } catch (e) { /* ignore */ }
    }
    const results = await cleanupAll(createdResources, BASE_URL);
    logCleanupResults(results);
    createdResources = { users: [], sites: [], templates: [], sessions: [] };
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
};

describe('Bio Template Creation', () => {
  jest.setTimeout(TEST_TIMEOUT);

  beforeAll(async () => {
    const client = createAuthClient();
    const email = generateEmail();
    
    const registerRes = await client.post('/auth/register', {
      email,
      password: 'Test@123456',
      first_name: 'Bio',
      last_name: 'Tester',
      role: 'user'
    });
    
    // Login uses 'identifier' not 'email'
    const loginRes = await client.post('/auth/login', {
      identifier: email,
      password: 'Test@123456'
    });
    
    const loginData = loginRes.data.data;
    testUser = { user_id: loginData.user_id, email };
    authToken = loginData.access_token;
    
    trackUser(testUser, authToken);
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('1. Creating bio template', () => {
    test('1.1 should create bio template WITHOUT default pages', async () => {
      const client = createAuthClient(authToken);
      
      const bioTemplateConfig = {
        name: 'My Bio Store',
        description: 'Link-in-bio for social sellers',
        category: 'bio',
        isPremium: false,
        config: {
          layout: 'bio',
          pages: [
            {
              slug: 'home',
              title: 'Home',
              content: {
                blocks: [
                  { type: 'bio-header', config: { showAvatar: true, showBio: true } },
                  { type: 'product-grid', config: { templateId: 'productgrid-section-4', layout: 'compact', ctaType: 'whatsapp' } },
                  { type: 'bio-links', config: { links: [] } },
                  { type: 'footer', config: { branding: true } }
                ]
              }
            }
          ]
        }
      };
      
      const res = await client.post('/templates', bioTemplateConfig);
      
      expect([200, 201]).toContain(res.status);
      expect(res.data.success).toBe(true);
      
      const template = res.data.data;
      expect(template.category).toBe('bio');
      
      // Template should have ONLY 1 page (the bio home page)
      const config = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
      const pages = config.pages || [];
      
      expect(pages.length).toBe(1);
      expect(pages[0].slug).toBe('home');
      
      // Should have bio blocks
      const blocks = pages[0].content?.blocks || [];
      const blockTypes = blocks.map(b => b.type);
      expect(blockTypes).toContain('bio-header');
      expect(blockTypes).toContain('product-grid');
      expect(blockTypes).toContain('bio-links');
      
      // Should NOT have default pages (About, Contact, Store, Blog, FAQ)
      const pageSlugs = pages.map(p => p.slug);
      expect(pageSlugs).not.toContain('about');
      expect(pageSlugs).not.toContain('contact');
      expect(pageSlugs).not.toContain('store');
      expect(pageSlugs).not.toContain('blog');
      expect(pageSlugs).not.toContain('faq');
      
      // Track for cleanup
      if (template.id) {
        createdResources.templates.push({ template_id: template.id, token: authToken });
      }
    });

    test('1.2 should create standard template WITH default pages', async () => {
      const client = createAuthClient(authToken);
      
      const standardTemplateConfig = {
        name: 'My Standard Store',
        description: 'Standard e-commerce site',
        category: 'ecommerce',
        isPremium: false,
        config: {
          layout: 'standard',
          pages: []
        }
      };
      
      const res = await client.post('/templates', standardTemplateConfig);
      
      expect([200, 201]).toContain(res.status);
      expect(res.data.success).toBe(true);
      
      const template = res.data.data;
      expect(template.category).toBe('ecommerce');
      
      // Template should have default pages added
      const config = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
      const pages = config.pages || [];
      
      // Standard template should have more than 1 page (default pages)
      expect(pages.length).toBeGreaterThan(1);
      
      const pageSlugs = pages.map(p => p.slug);
      // Should have default pages
      expect(pageSlugs).toContain('home');
      
      // Track for cleanup
      if (template.id) {
        createdResources.templates.push({ template_id: template.id, token: authToken });
      }
    });
  });

  describe('2. Creating site with bio template', () => {
    test('2.1 should create site with bio template and get single bio page', async () => {
      const client = createAuthClient(authToken);
      
      // First create a bio template
      const templateRes = await client.post('/templates', {
        name: `Bio Store Template ${Date.now()}`,
        description: 'Bio store template',
        category: 'bio',
        config: {
          pages: [
            {
              slug: 'home',
              title: 'Home',
              content: {
                blocks: [
                  { type: 'bio-header', config: {} },
                  { type: 'product-grid', config: { ctaType: 'whatsapp' } },
                  { type: 'bio-links', config: {} }
                ]
              }
            }
          ]
        }
      });
      
      const template = templateRes.data.data;
      createdResources.templates.push({ template_id: template.id, token: authToken });
      
      // Create site with this bio template
      const siteRes = await client.post('/sites', {
        name: 'Test Bio Store',
        slug: `test-bio-${Date.now()}`,
        templateId: template.id
      });
      
      expect([200, 201]).toContain(siteRes.status);
      expect(siteRes.data.success).toBe(true);
      
      const site = siteRes.data.data;
      createdResources.sites.push({ site_id: site.id, token: authToken });
      
      // Get site pages
      const pagesRes = await client.get(`/sites/${site.id}/pages`);
      const pages = pagesRes.data.data || [];
      
      console.log('Bio site pages:', pages.length, pages.map(p => p.slug));
      
      // Bio site should have only 1 page
      expect(pages.length).toBe(1);
      expect(pages[0].slug).toBe('home');
      
      // Check the page has bio blocks
      const content = pages[0].content || {};
      const blocks = content.blocks || [];
      const blockTypes = blocks.map(b => b.type);
      
      expect(blockTypes).toContain('bio-header');
      expect(blockTypes).toContain('product-grid');
      expect(blockTypes).toContain('bio-links');
    });

    test('2.2 should create standard template that merges with default pages', async () => {
      const client = createAuthClient(authToken);
      
      // Create standard template with empty pages - should get defaults merged
      const templateRes = await client.post('/templates', {
        name: `Standard Template ${Date.now()}`,
        description: 'Standard site',
        category: 'ecommerce',
        config: { pages: [] }
      });
      
      const template = templateRes.data.data;
      createdResources.templates.push({ template_id: template.id, token: authToken });
      
      // Standard template should have default pages merged
      const config = typeof template.config === 'string' ? JSON.parse(template.config) : template.config;
      const pages = config.pages || [];
      
      // Should have default pages (home + others)
      expect(pages.length).toBeGreaterThan(1);
    });
  });
});
