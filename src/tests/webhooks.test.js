// Webhooks module tests using Supertest
const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

describe('Webhooks API Tests', () => {
  let token;
  let userId;
  let createdUserIds = [];
  let createdWebhookIds = [];

  beforeAll(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const phone = `+234${String(Date.now() % 1000000000).padStart(10, '0').slice(-10)}`;
    const payload = {
      email: `webhooks_${suffix}@example.com`,
      phone,
      password: 'Test@123456',
      first_name: 'Web',
      last_name: 'Hook',
      role: 'user',
    };
    const res = await request(app).post('/auth/register').send(payload);
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    token = res.body.data.access_token;
    userId = res.body.data.user.user_id;
    createdUserIds.push(userId);
  });

  afterAll(async () => {
    if (createdWebhookIds.length) {
      await pool.query('DELETE FROM webhooks WHERE id = ANY($1::uuid[])', [createdWebhookIds]);
    }
    if (createdUserIds.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
  });

  describe('Auth gate', () => {
    it('GET /webhooks requires auth', async () => {
      const res = await request(app).get('/webhooks');
      expect(res.status).toBe(401);
    });
    it('POST /webhooks requires auth', async () => {
      const res = await request(app).post('/webhooks').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('Validation', () => {
    it('POST /webhooks rejects invalid URL', async () => {
      const res = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'not-a-url', events: ['order.created'] });
      expect([400, 422]).toContain(res.status);
    });

    it('POST /webhooks rejects missing events', async () => {
      const res = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'https://example.com/hook' });
      expect([400, 422]).toContain(res.status);
    });

    it('POST /webhooks rejects empty events array', async () => {
      const res = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'https://example.com/hook', events: [] });
      expect([400, 422]).toContain(res.status);
    });

    it('PUT /webhooks/:id rejects non-UUID id', async () => {
      const res = await request(app)
        .put('/webhooks/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .send({ is_active: false });
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('Lifecycle', () => {
    let createdId;

    it('POST /webhooks creates a webhook with a generated secret', async () => {
      const res = await request(app)
        .post('/webhooks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          url: 'https://example.com/receive',
          events: ['order.created', 'user.registered'],
        });
      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('secret');
      expect(res.body.data.url).toBe('https://example.com/receive');
      expect(res.body.data.events).toEqual(['order.created', 'user.registered']);
      expect(res.body.data.is_active).toBe(true);
      createdId = res.body.data.id;
      createdWebhookIds.push(createdId);
    });

    it('GET /webhooks lists the webhook', async () => {
      const res = await request(app)
        .get('/webhooks')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const found = res.body.data.find((w) => w.id === createdId);
      expect(found).toBeDefined();
    });

    it('PUT /webhooks/:id updates is_active', async () => {
      const res = await request(app)
        .put(`/webhooks/${createdId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ is_active: false });
      expect(res.status).toBe(200);
      expect(res.body.data.is_active).toBe(false);
    });

    it('PUT /webhooks/:id on unknown id returns 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .put(`/webhooks/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ is_active: false });
      expect(res.status).toBe(404);
    });

    it('DELETE /webhooks/:id deletes the webhook', async () => {
      const res = await request(app)
        .delete(`/webhooks/${createdId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);

      const list = await request(app)
        .get('/webhooks')
        .set('Authorization', `Bearer ${token}`);
      const found = list.body.data.find((w) => w.id === createdId);
      expect(found).toBeUndefined();
      // already deleted; drop from cleanup list
      createdWebhookIds = createdWebhookIds.filter((id) => id !== createdId);
    });

    it('DELETE /webhooks/:id on unknown id returns 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .delete(`/webhooks/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });
});
