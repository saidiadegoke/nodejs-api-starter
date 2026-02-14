/**
 * Quick tests for catalog API (products and categories per site).
 * Prerequisites: Server running, migrations 003 (sites), 009 (catalog tables), 010 (price_currency, currency_rates) applied.
 */
const axios = require('axios');
const { cleanupAll, logCleanupResults } = require('./cleanup-helper');

require('dotenv').config();
const port = process.env.PORT || 4050;
const BASE_URL = process.env.API_BASE_URL || `http://localhost:${port}`;
const TEST_TIMEOUT = 30000;

let testUser = null;
let authToken = null;
let siteId = null;

const createdResources = {
  users: [],
  sites: [],
};

const createAuthClient = (token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return axios.create({ baseURL: BASE_URL, headers });
};

const generateEmail = () => `catalog-test-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
const generateSlug = () => `catalog-site-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const cleanupTestData = async () => {
  try {
    const results = await cleanupAll(createdResources, BASE_URL);
    logCleanupResults(results);
  } catch (err) {
    console.error('Cleanup failed:', err.message);
  }
};

describe('Catalog API (products & categories)', () => {
  jest.setTimeout(TEST_TIMEOUT);

  beforeAll(async () => {
    const client = createAuthClient();
    const userData = {
      email: generateEmail(),
      password: 'Test@123456',
      first_name: 'Catalog',
      last_name: 'Tester',
      role: 'user',
    };
    await client.post('/auth/register', userData);
    const loginRes = await client.post('/auth/login', {
      identifier: userData.email,
      password: userData.password,
    });
    const data = loginRes.data.data;
    testUser = data.user || { user_id: data.user_id };
    authToken = data.access_token;
    createdResources.users.push({ user_id: testUser.user_id, token: authToken });

    const siteRes = await createAuthClient(authToken).post('/sites', {
      name: 'Catalog Test Site',
      slug: generateSlug(),
    });
    siteId = siteRes.data.data.id;
    createdResources.sites.push({ site_id: siteId, token: authToken });
  });

  afterAll(cleanupTestData);

  describe('Categories', () => {
    let categoryId;

    test('POST /sites/:siteId/categories - create category', async () => {
      const res = await createAuthClient(authToken).post(`/sites/${siteId}/categories`, {
        name: 'Electronics',
        slug: 'electronics',
        description: 'Tech stuff',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data).toHaveProperty('id');
      expect(res.data.data.name).toBe('Electronics');
      expect(res.data.data.slug).toBe('electronics');
      categoryId = res.data.data.id;
    });

    test('GET /sites/:siteId/categories - list categories', async () => {
      const res = await createAuthClient(authToken).get(`/sites/${siteId}/categories`);
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.data.length).toBeGreaterThanOrEqual(1);
      expect(res.data.data.find((c) => c.id === categoryId)).toBeDefined();
    });

    test('GET /sites/:siteId/categories/:categoryId - get one', async () => {
      const res = await createAuthClient(authToken).get(`/sites/${siteId}/categories/${categoryId}`);
      expect(res.status).toBe(200);
      expect(res.data.data.id).toBe(categoryId);
      expect(res.data.data.name).toBe('Electronics');
    });

    test('PATCH /sites/:siteId/categories/:categoryId - update', async () => {
      const res = await createAuthClient(authToken).patch(`/sites/${siteId}/categories/${categoryId}`, {
        name: 'Electronics & Gadgets',
        description: 'Updated',
      });
      expect(res.status).toBe(200);
      expect(res.data.data.name).toBe('Electronics & Gadgets');
      expect(res.data.data.description).toBe('Updated');
    });

    test('DELETE /sites/:siteId/categories/:categoryId - delete category', async () => {
      const res = await createAuthClient(authToken).delete(`/sites/${siteId}/categories/${categoryId}`);
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const listRes = await createAuthClient(authToken).get(`/sites/${siteId}/categories`);
      expect(listRes.data.data.find((c) => c.id === categoryId)).toBeUndefined();
    });
  });

  describe('Currency rates', () => {
    test('GET /sites/currency-rates - returns base_currency and rates', async () => {
      const res = await createAuthClient().get('/sites/currency-rates');
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const data = res.data.data;
      expect(data).toHaveProperty('base_currency');
      expect(data).toHaveProperty('rates');
      expect(typeof data.rates).toBe('object');
      expect(data.rates).toHaveProperty('NGN');
      expect(data.rates).toHaveProperty('USD');
      expect(data.rates).toHaveProperty('EUR');
      expect(data.rates).toHaveProperty('GBP');
      expect(typeof data.rates.NGN).toBe('number');
      expect(typeof data.rates.USD).toBe('number');
    });
  });

  describe('Products', () => {
    let productId;
    let categoryId;

    beforeAll(async () => {
      const catRes = await createAuthClient(authToken).post(`/sites/${siteId}/categories`, {
        name: 'Products Test Cat',
        slug: 'products-test-cat',
      });
      categoryId = catRes.data.data.id;
    });

    test('POST /sites/:siteId/products - create product (default NGN)', async () => {
      const res = await createAuthClient(authToken).post(`/sites/${siteId}/products`, {
        name: 'Test Widget',
        slug: 'test-widget',
        type: 'product',
        price: 1999,
        compare_at_price: 2499,
        status: 'draft',
        category_id: categoryId,
        tags: ['sale', 'featured'],
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data).toHaveProperty('id');
      expect(res.data.data.name).toBe('Test Widget');
      expect(Number(res.data.data.price)).toBe(1999);
      expect(res.data.data.price_currency).toBe('NGN');
      expect(res.data.data.status).toBe('draft');
      expect(res.data.data.prices).toBeDefined();
      expect(res.data.data.prices).toHaveProperty('NGN');
      expect(res.data.data.prices).toHaveProperty('USD');
      expect(res.data.data.prices).toHaveProperty('EUR');
      expect(res.data.data.prices).toHaveProperty('GBP');
      expect(Number(res.data.data.prices.NGN)).toBe(1999);
      expect(res.data.data.compare_at_prices).toBeDefined();
      expect(res.data.data.compare_at_prices).toHaveProperty('NGN');
      productId = res.data.data.id;
    });

    test('POST /sites/:siteId/products - create product with price_currency USD', async () => {
      const res = await createAuthClient(authToken).post(`/sites/${siteId}/products`, {
        name: 'USD Widget',
        slug: 'usd-widget',
        type: 'product',
        price: 10,
        price_currency: 'USD',
        status: 'draft',
        category_id: categoryId,
      });
      expect(res.status).toBe(200);
      expect(res.data.data.price_currency).toBe('USD');
      expect(Number(res.data.data.price)).toBe(10);
      expect(res.data.data.prices).toBeDefined();
      expect(res.data.data.prices.USD).toBe(10);
      expect(typeof res.data.data.prices.NGN).toBe('number');
      expect(typeof res.data.data.prices.EUR).toBe('number');
      expect(typeof res.data.data.prices.GBP).toBe('number');
    });

    test('GET /sites/:siteId/products - list products includes price_currency and computed prices', async () => {
      const res = await createAuthClient(authToken).get(`/sites/${siteId}/products`);
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const data = res.data.data;
      const items = Array.isArray(data) ? data : data.items;
      const total = typeof data?.total === 'number' ? data.total : (items?.length ?? 0);
      expect(Array.isArray(items)).toBe(true);
      expect(total).toBeGreaterThanOrEqual(1);
      const product = items.find((p) => p.id === productId || p.id === Number(productId));
      expect(product).toBeDefined();
      expect(product.name).toBe('Test Widget');
      expect(product.price_currency).toBeDefined();
      expect(product.prices).toBeDefined();
      expect(product.prices).toHaveProperty('NGN');
      expect(product.prices).toHaveProperty('USD');
    });

    test('GET /sites/:siteId/products - filter by status', async () => {
      const res = await createAuthClient(authToken).get(`/sites/${siteId}/products`, {
        params: { status: 'published' },
      });
      expect(res.status).toBe(200);
      expect(res.data.data.items.every((p) => p.status === 'published')).toBe(true);
    });

    test('GET /sites/:siteId/products/:productId - get one includes price_currency and computed prices', async () => {
      const res = await createAuthClient(authToken).get(`/sites/${siteId}/products/${productId}`);
      expect(res.status).toBe(200);
      expect(res.data.data.id).toBe(productId);
      expect(res.data.data.name).toBe('Test Widget');
      expect(res.data.data.category_id).toBe(categoryId);
      expect(res.data.data.price_currency).toBe('NGN');
      expect(res.data.data.prices).toBeDefined();
      expect(res.data.data.prices.NGN).toBe(1999);
      expect(res.data.data.prices).toHaveProperty('USD');
      expect(res.data.data.compare_at_prices).toBeDefined();
      expect(res.data.data.compare_at_prices).toHaveProperty('NGN');
    });

    test('PATCH /sites/:siteId/products/:productId - update price and price_currency', async () => {
      const res = await createAuthClient(authToken).patch(`/sites/${siteId}/products/${productId}`, {
        name: 'Test Widget Pro',
        status: 'published',
        price: 1799,
        price_currency: 'EUR',
      });
      expect(res.status).toBe(200);
      expect(res.data.data.name).toBe('Test Widget Pro');
      expect(res.data.data.status).toBe('published');
      expect(Number(res.data.data.price)).toBe(1799);
      expect(res.data.data.price_currency).toBe('EUR');
      expect(res.data.data.prices).toBeDefined();
      expect(res.data.data.prices.EUR).toBe(1799);
      expect(res.data.data.prices).toHaveProperty('NGN');
      expect(res.data.data.prices).toHaveProperty('USD');
    });

    test('DELETE /sites/:siteId/products/:productId - delete product', async () => {
      const res = await createAuthClient(authToken).delete(`/sites/${siteId}/products/${productId}`);
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const listRes = await createAuthClient(authToken).get(`/sites/${siteId}/products`);
      const listData = listRes.data.data;
      const listItems = Array.isArray(listData) ? listData : listData.items || [];
      expect(listItems.find((p) => p.id === productId)).toBeUndefined();
    });
  });

  describe('Public catalog (no auth)', () => {
    let publicCategoryId;
    let publicProductId;

    beforeAll(async () => {
      const catRes = await createAuthClient(authToken).post(`/sites/${siteId}/categories`, {
        name: 'Public Cat',
        slug: 'public-cat',
      });
      publicCategoryId = catRes.data.data.id;

      const prodRes = await createAuthClient(authToken).post(`/sites/${siteId}/products`, {
        name: 'Public Product',
        slug: 'public-product',
        type: 'product',
        price: 100,
        status: 'published',
      });
      publicProductId = prodRes.data.data.id;
    });

    test('GET /public/sites/:id/categories - list categories (no auth)', async () => {
      const client = createAuthClient();
      const res = await client.get(`/public/sites/${siteId}/categories`);
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.data.some((c) => c.id === publicCategoryId)).toBe(true);
    });

    test('GET /public/sites/:id/products - list published products includes price_currency and prices', async () => {
      const client = createAuthClient();
      const res = await client.get(`/public/sites/${siteId}/products`);
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const data = res.data.data;
      const items = Array.isArray(data) ? data : (data?.items || []);
      expect(items.some((p) => p.id === publicProductId && p.status === 'published')).toBe(true);
      const pubProduct = items.find((p) => p.id === publicProductId);
      expect(pubProduct).toBeDefined();
      expect(pubProduct.price_currency).toBeDefined();
      expect(pubProduct.prices).toBeDefined();
      expect(pubProduct.prices).toHaveProperty('NGN');
      expect(pubProduct.prices).toHaveProperty('USD');
    });

    test('GET /public/sites/:id/products/:slugOrId - get one product includes price_currency and prices', async () => {
      const client = createAuthClient();
      const res = await client.get(`/public/sites/${siteId}/products/public-product`);
      expect(res.status).toBe(200);
      expect(res.data.data.id).toBe(publicProductId);
      expect(res.data.data.slug).toBe('public-product');
      expect(res.data.data.price_currency).toBeDefined();
      expect(res.data.data.prices).toBeDefined();
      expect(res.data.data.prices).toHaveProperty('NGN');
      expect(res.data.data.prices).toHaveProperty('USD');
    });
  });
});
