/**
 * Integration tests: subscription payment creation -> admin approval -> current subscription data correct.
 * Requires: API server running, DB migrated and seeded (payment methods, plan_configs).
 * Run with: API server up, then npm test -- --testPathPattern=subscription-approval
 */

const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3010/api';
const TEST_TIMEOUT = 35000;

const generateEmail = () => `sub-approval-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
const generatePhone = () => `08${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;

describe('Subscription approval flow (integration)', () => {
  let customerToken;
  let adminToken;
  let customerUser;
  let paymentId;   // PAY_xxx from create response
  let paymentDbId;  // UUID for admin PUT

  beforeAll(async () => {
    const password = 'Test@123456';

    // Create customer user and login
    const customerEmail = generateEmail();
    await axios.post(`${BASE_URL}/auth/register`, {
      phone: generatePhone(),
      email: customerEmail,
      password,
      first_name: 'Sub',
      last_name: 'Tester',
      role: 'user'
    });
    const customerLogin = await axios.post(`${BASE_URL}/auth/login`, {
      identifier: customerEmail,
      password
    });
    customerToken = customerLogin.data.data.access_token;
    customerUser = customerLogin.data.data.user;

    // Create admin user and login (role admin for payment admin routes)
    const adminEmail = generateEmail();
    await axios.post(`${BASE_URL}/auth/register`, {
      phone: generatePhone(),
      email: adminEmail,
      password,
      first_name: 'Admin',
      last_name: 'Tester',
      role: 'admin'
    });
    const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
      identifier: adminEmail,
      password
    });
    adminToken = adminLogin.data.data.access_token;
  }, TEST_TIMEOUT);

  test('customer creates subscription payment (direct transfer)', async () => {
    const res = await axios.post(
      `${BASE_URL}/payments/create`,
      {
        amount: 5000,
        currency: 'NGN',
        type: 'subscription',
        payment_method: 'direct_transfer',
        metadata: {
          plan_type: 'small_scale',
          billing_cycle: 'monthly'
        },
        email: customerUser?.email || 'customer@example.com'
      },
      { headers: { Authorization: `Bearer ${customerToken}` } }
    );

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.payment_id).toBeDefined();
    paymentId = res.data.data.payment_id;
    expect(paymentId).toMatch(/^PAY_/);
  }, TEST_TIMEOUT);

  test('admin lists payments and finds the subscription payment', async () => {
    const res = await axios.get(`${BASE_URL}/payments/admin/all`, {
      params: { limit: 50 },
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);

    const payment = res.data.data.find((p) => p.payment_id === paymentId);
    expect(payment).toBeDefined();
    expect(payment.type).toBe('subscription');
    expect(payment.status).toMatch(/pending|pending_transfer/);
    expect(payment.metadata).toBeDefined();
    expect(payment.metadata.plan_type).toBe('small_scale');
    paymentDbId = payment.id;
    expect(paymentDbId).toBeDefined();
  }, TEST_TIMEOUT);

  test('admin approves payment (status -> completed)', async () => {
    const res = await axios.put(
      `${BASE_URL}/payments/admin/${paymentDbId}`,
      { status: 'completed' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('completed');
  }, TEST_TIMEOUT);

  test('customer GET /subscriptions/current returns correct active plan', async () => {
    const res = await axios.get(`${BASE_URL}/payments/subscriptions/current`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const sub = res.data.data;
    expect(sub).toBeDefined();
    expect(sub.plan_type).toBe('small_scale');
    expect(sub.status).toBe('active');
    expect(sub.limits).toBeDefined();
    expect(sub.features).toBeDefined();
    expect(typeof sub.limits.pages).toBe('number');
    expect(Array.isArray(sub.features) || (sub.features && typeof sub.features === 'object')).toBe(true);
  }, TEST_TIMEOUT);

  test('payment record has subscription_id set after approval', async () => {
    const res = await axios.get(`${BASE_URL}/payments/admin/payment/${paymentDbId}`, {
      headers: { Authorization: `Bearer ${adminToken}` } }
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.subscription_id).toBeDefined();
    expect(res.data.data.subscription_id).not.toBeNull();
    expect(res.data.data.status).toBe('completed');
  }, TEST_TIMEOUT);
});
