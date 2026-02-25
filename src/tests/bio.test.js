/**
 * Bio Commerce (Link-in-Bio) Tests
 *
 * Tests for:
 * 1. POST /sites/quick-setup – create bio store with minimal fields
 * 2. GET  /public/sites/:id/bio – public bio page data
 * 3. PUT  /sites/:siteId/bio-profile – update bio-specific fields
 */

const axios = require('axios');
const { cleanupAll, logCleanupResults } = require('./cleanup-helper');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4050';
const TEST_TIMEOUT = 30000;

// Test state
let testUser = null;
let authToken = null;
let createdSiteId = null;
let createdSiteSlug = null;

let createdResources = {
  users: [],
  sites: [],
  sessions: [],
};

// Helpers
const createAuthClient = (token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return axios.create({ baseURL: BASE_URL, headers });
};

const generateEmail = () => `test${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
const generatePhone = () => `+234${Math.floor(8000000000 + Math.random() * 1000000000)}`;

const trackUser = (user, token) => {
  if (user && user.user_id) {
    createdResources.users.push({ user_id: user.user_id, token });
  }
};

const cleanupTestData = async () => {
  console.log('\n🧹 Cleaning up bio test data...');
  try {
    // Delete sites first (before users, since cascade may not cover everything)
    for (const site of createdResources.sites) {
      try {
        const client = createAuthClient(site.token);
        await client.delete(`/sites/${site.site_id}`);
      } catch (e) { /* ignore cleanup errors */ }
    }

    const results = await cleanupAll(createdResources, BASE_URL);
    logCleanupResults(results);
    createdResources = { users: [], sites: [], sessions: [] };
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────
describe('Bio Commerce (Link-in-Bio) Tests', () => {
  jest.setTimeout(TEST_TIMEOUT);

  // ── SETUP: register + login a test user ──────────────────────────────────
  beforeAll(async () => {
    const email = generateEmail();
    const phone = generatePhone();
    const password = 'Test@123456';

    // Register
    const regRes = await axios.post(`${BASE_URL}/auth/register`, {
      email,
      phone,
      password,
      first_name: 'Bio',
      last_name: 'Tester',
      role: 'user',
    });
    expect(regRes.status).toBe(201);
    testUser = regRes.data.data;
    testUser.password = password;

    // Login
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      identifier: email,
      password,
    });
    expect(loginRes.status).toBe(200);
    authToken = loginRes.data.data.access_token;

    trackUser(testUser, authToken);
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. POST /sites/quick-setup
  // ─────────────────────────────────────────────────────────────────────────
  describe('1. Quick Setup – POST /sites/quick-setup', () => {
    test('1.1 should create a bio store with business name and WhatsApp number', async () => {
      const client = createAuthClient(authToken);
      const res = await client.post('/sites/quick-setup', {
        businessName: 'Amara Sneakers',
        whatsappNumber: '08012345678',
      });

      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);

      const data = res.data.data;
      expect(data).toHaveProperty('site');
      expect(data).toHaveProperty('storeUrl');
      expect(data.site).toHaveProperty('id');
      expect(data.site).toHaveProperty('slug');
      expect(data.site.name).toBe('Amara Sneakers');
      expect(data.site.status).toBe('active');
      expect(data.site.site_type).toBe('bio');
      expect(data.storeUrl).toContain(data.site.slug);

      // Store for later tests
      createdSiteId = data.site.id;
      createdSiteSlug = data.site.slug;
      createdResources.sites.push({ site_id: data.site.id, token: authToken });
    });

    test('1.2 should auto-generate a valid slug from business name', async () => {
      const client = createAuthClient(authToken);
      const res = await client.post('/sites/quick-setup', {
        businessName: 'Tunde\'s Fashion Hub!!!',
        whatsappNumber: '09087654321',
      });

      expect(res.status).toBe(201);
      const slug = res.data.data.site.slug;
      // Slug should be lowercase, no special chars, hyphens only
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug).not.toContain("'");
      expect(slug).not.toContain('!');

      createdResources.sites.push({ site_id: res.data.data.site.id, token: authToken });
    });

    test('1.3 should handle slug collision by appending a suffix', async () => {
      const client = createAuthClient(authToken);
      const uniqueName = `TestStore ${Date.now()}`;

      // Create first
      const res1 = await client.post('/sites/quick-setup', {
        businessName: uniqueName,
        whatsappNumber: '08011111111',
      });
      expect(res1.status).toBe(201);
      const slug1 = res1.data.data.site.slug;
      createdResources.sites.push({ site_id: res1.data.data.site.id, token: authToken });

      // Create second with same name – should get different slug
      const res2 = await client.post('/sites/quick-setup', {
        businessName: uniqueName,
        whatsappNumber: '08022222222',
      });
      expect(res2.status).toBe(201);
      const slug2 = res2.data.data.site.slug;
      expect(slug2).not.toBe(slug1);
      createdResources.sites.push({ site_id: res2.data.data.site.id, token: authToken });
    });

    test('1.4 should fail without businessName', async () => {
      const client = createAuthClient(authToken);
      try {
        await client.post('/sites/quick-setup', {
          whatsappNumber: '08012345678',
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.success).toBe(false);
      }
    });

    test('1.5 should fail without whatsappNumber', async () => {
      const client = createAuthClient(authToken);
      try {
        await client.post('/sites/quick-setup', {
          businessName: 'Missing Phone Store',
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.success).toBe(false);
      }
    });

    test('1.6 should fail without authentication', async () => {
      try {
        await axios.post(`${BASE_URL}/sites/quick-setup`, {
          businessName: 'No Auth Store',
          whatsappNumber: '08012345678',
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });

    test('1.7 should set default customization (colors, fonts)', async () => {
      const client = createAuthClient(authToken);
      // Use the site created in test 1.1
      const res = await client.get(`/sites/${createdSiteId}/customization`);

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const customization = res.data.data;
      expect(customization).toHaveProperty('colors');
      expect(customization.colors).toHaveProperty('primary');
      expect(customization.colors).toHaveProperty('background');
    });

    test('1.8 should store WhatsApp number in commerce settings', async () => {
      const client = createAuthClient(authToken);
      const res = await client.get(`/sites/${createdSiteId}/commerce-settings`);

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const settings = res.data.data;
      expect(settings).toHaveProperty('whatsappNumber');
      // Should be normalized with country code
      expect(settings.whatsappNumber).toMatch(/^234/);
    });

    test('1.9 should set default delivery zones', async () => {
      const client = createAuthClient(authToken);
      const res = await client.get(`/sites/${createdSiteId}/commerce-settings`);

      expect(res.status).toBe(200);
      const settings = res.data.data;
      expect(settings).toHaveProperty('deliveryZones');
      expect(Array.isArray(settings.deliveryZones)).toBe(true);
      expect(settings.deliveryZones.length).toBeGreaterThan(0);
      expect(settings.deliveryZones[0]).toHaveProperty('name');
      expect(settings.deliveryZones[0]).toHaveProperty('fee');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. GET /public/sites/:id/bio
  // ─────────────────────────────────────────────────────────────────────────
  describe('2. Public Bio Page – GET /public/sites/:id/bio', () => {
    test('2.1 should return bio page data without authentication', async () => {
      const res = await axios.get(`${BASE_URL}/public/sites/${createdSiteId}/bio`);

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const data = res.data.data;
      expect(data).toHaveProperty('site');
      expect(data).toHaveProperty('profile');
      expect(data).toHaveProperty('products');
      expect(data).toHaveProperty('links');
      expect(data).toHaveProperty('commerceSettings');
    });

    test('2.2 should include site name and slug', async () => {
      const res = await axios.get(`${BASE_URL}/public/sites/${createdSiteId}/bio`);

      const site = res.data.data.site;
      expect(site.name).toBe('Amara Sneakers');
      expect(site.slug).toBe(createdSiteSlug);
    });

    test('2.3 should include customization (colors, logo)', async () => {
      const res = await axios.get(`${BASE_URL}/public/sites/${createdSiteId}/bio`);

      const data = res.data.data;
      expect(data).toHaveProperty('customization');
      expect(data.customization).toHaveProperty('colors');
    });

    test('2.4 should include commerce settings with WhatsApp and delivery zones', async () => {
      const res = await axios.get(`${BASE_URL}/public/sites/${createdSiteId}/bio`);

      const commerce = res.data.data.commerceSettings;
      expect(commerce).toHaveProperty('whatsappNumber');
      expect(commerce).toHaveProperty('deliveryZones');
    });

    test('2.5 should return 404 for non-existent site', async () => {
      try {
        await axios.get(`${BASE_URL}/public/sites/999999/bio`);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(404);
      }
    });

    test('2.6 should return empty products array when no products exist', async () => {
      const res = await axios.get(`${BASE_URL}/public/sites/${createdSiteId}/bio`);
      expect(Array.isArray(res.data.data.products)).toBe(true);
    });

    test('2.7 should return products after adding one', async () => {
      // Add a product to the site
      const client = createAuthClient(authToken);
      const productRes = await client.post(`/sites/${createdSiteId}/products`, {
        name: 'Air Jordan Sneakers',
        price: 14000,
        status: 'published',
      });
      expect(productRes.status).toBe(200);

      // Fetch public bio page
      const res = await axios.get(`${BASE_URL}/public/sites/${createdSiteId}/bio`);
      const products = res.data.data.products;
      expect(products.length).toBe(1);
      expect(products[0].name).toBe('Air Jordan Sneakers');
      expect(products[0].price).toBe(14000);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. PUT /sites/:siteId/bio-profile
  // ─────────────────────────────────────────────────────────────────────────
  describe('3. Bio Profile Update – PUT /sites/:siteId/bio-profile', () => {
    test('3.1 should update bio text', async () => {
      const client = createAuthClient(authToken);
      const res = await client.put(`/sites/${createdSiteId}/bio-profile`, {
        bioText: 'We sell authentic sneakers at the best prices in Lagos!',
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.bioText).toBe('We sell authentic sneakers at the best prices in Lagos!');
    });

    test('3.2 should update social links', async () => {
      const client = createAuthClient(authToken);
      const res = await client.put(`/sites/${createdSiteId}/bio-profile`, {
        socialLinks: [
          { platform: 'tiktok', url: 'https://tiktok.com/@amarasneakers' },
          { platform: 'instagram', url: 'https://instagram.com/amarasneakers' },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.data.data.socialLinks).toHaveLength(2);
      expect(res.data.data.socialLinks[0].platform).toBe('tiktok');
    });

    test('3.3 should update external links', async () => {
      const client = createAuthClient(authToken);
      const res = await client.put(`/sites/${createdSiteId}/bio-profile`, {
        links: [
          { title: 'My YouTube Channel', url: 'https://youtube.com/@amara', icon: 'youtube' },
          { title: 'Join Telegram', url: 'https://t.me/amarasneakers', icon: 'telegram' },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.data.data.links).toHaveLength(2);
      expect(res.data.data.links[0].title).toBe('My YouTube Channel');
    });

    test('3.4 should persist bio profile changes in public page', async () => {
      const client = createAuthClient(authToken);

      // Update bio profile
      await client.put(`/sites/${createdSiteId}/bio-profile`, {
        bioText: 'Updated bio text for public page test',
        socialLinks: [{ platform: 'tiktok', url: 'https://tiktok.com/@test' }],
        links: [{ title: 'My Link', url: 'https://example.com', icon: 'link' }],
      });

      // Verify public page reflects changes
      const publicRes = await axios.get(`${BASE_URL}/public/sites/${createdSiteId}/bio`);
      const data = publicRes.data.data;

      expect(data.profile.bioText).toBe('Updated bio text for public page test');
      expect(data.profile.socialLinks).toHaveLength(1);
      expect(data.links).toHaveLength(1);
      expect(data.links[0].title).toBe('My Link');
    });

    test('3.5 should fail without authentication', async () => {
      try {
        await axios.put(`${BASE_URL}/sites/${createdSiteId}/bio-profile`, {
          bioText: 'Unauthorized update',
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });

    test('3.6 should fail for site owned by another user', async () => {
      // Register a second user
      const email2 = generateEmail();
      const phone2 = generatePhone();
      const regRes = await axios.post(`${BASE_URL}/auth/register`, {
        email: email2,
        phone: phone2,
        password: 'Test@123456',
        first_name: 'Other',
        last_name: 'User',
        role: 'user',
      });
      const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        identifier: email2,
        password: 'Test@123456',
      });
      const otherToken = loginRes.data.data.access_token;
      createdResources.users.push({ user_id: regRes.data.data.user_id, token: otherToken });

      // Try to update the first user's site
      const client = createAuthClient(otherToken);
      try {
        await client.put(`/sites/${createdSiteId}/bio-profile`, {
          bioText: 'Hijacking attempt',
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect([403, 401]).toContain(error.response.status);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Commerce Settings – GET/PUT /sites/:siteId/commerce-settings
  // ─────────────────────────────────────────────────────────────────────────
  describe('4. Commerce Settings', () => {
    test('4.1 should update WhatsApp number', async () => {
      const client = createAuthClient(authToken);
      const res = await client.put(`/sites/${createdSiteId}/commerce-settings`, {
        whatsappNumber: '09099998888',
      });

      expect(res.status).toBe(200);
      expect(res.data.data.whatsappNumber).toMatch(/^234/);
    });

    test('4.2 should update delivery zones', async () => {
      const client = createAuthClient(authToken);
      const res = await client.put(`/sites/${createdSiteId}/commerce-settings`, {
        deliveryZones: [
          { name: 'Within Lekki', fee: 1000, estimatedDays: 'Same day' },
          { name: 'Mainland', fee: 2000, estimatedDays: '1-2 days' },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.data.data.deliveryZones).toHaveLength(2);
      expect(res.data.data.deliveryZones[0].name).toBe('Within Lekki');
      expect(res.data.data.deliveryZones[0].fee).toBe(1000);
    });

    test('4.3 should reflect commerce settings in public bio page', async () => {
      const res = await axios.get(`${BASE_URL}/public/sites/${createdSiteId}/bio`);
      const commerce = res.data.data.commerceSettings;

      expect(commerce.deliveryZones).toHaveLength(2);
      expect(commerce.deliveryZones[0].name).toBe('Within Lekki');
    });
  });
});
