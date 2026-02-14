/**
 * Form Submissions API tests
 * See docs/FORM_SUBMISSIONS_SERVICE_DESIGN.md
 *
 * Run after applying migration 010_create_form_submissions_tables.sql
 * and with API server running (e.g. npm run dev).
 */

const axios = require('axios');
const { cleanupAll, logCleanupResults } = require('./cleanup-helper');

require('dotenv').config();
const port = process.env.PORT || 4050;
const BASE_URL = process.env.API_BASE_URL || `http://localhost:${port}`;
const TEST_TIMEOUT = 30000;

let testUser = null;
let authToken = null;
let createdSiteId = null;
let createdPageId = null;
let formInstanceId = null;
let submissionId = null;

const createdResources = {
  users: [],
  sites: [],
  pages: [],
};

const createAuthClient = (token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return axios.create({ baseURL: BASE_URL, headers });
};

const generateEmail = () => `form-test-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
const generateSlug = () => `form-site-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

describe('Form Submissions API', () => {
  jest.setTimeout(TEST_TIMEOUT);

  beforeAll(async () => {
    const client = createAuthClient();
    const userData = {
      email: generateEmail(),
      password: 'Test@123456',
      first_name: 'Form',
      last_name: 'Tester',
      role: 'user',
    };
    const signupResponse = await client.post('/auth/register', userData);
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

    const authClient = createAuthClient(authToken);
    const siteResponse = await authClient.post('/sites', {
      name: 'Form Test Site',
      slug: generateSlug(),
    });
    createdSiteId = siteResponse.data.data.id;
    createdResources.sites.push({ site_id: createdSiteId, token: authToken });

    let pageResponse;
    try {
      pageResponse = await authClient.post(`/sites/${createdSiteId}/pages`, {
        title: 'Contact',
        slug: 'contact',
        content: {
          blocks: [
            {
              id: 'block-contact-form',
              type: 'contactform',
              name: 'Contact Form',
              data: { title: 'Get in touch' },
            },
          ],
        },
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      const status = err.response?.status;
      throw new Error(`Page create failed (${status}): ${msg}. Response: ${JSON.stringify(err.response?.data || {})}`);
    }
    createdPageId = pageResponse.data.data.id;
    createdResources.pages.push({ page_id: createdPageId, token: authToken });
  });

  afterAll(async () => {
    const results = await cleanupAll(createdResources, BASE_URL);
    logCleanupResults(results);
  });

  describe('POST /sites/:siteId/forms/submit (public)', () => {
    test('should accept submission with page_slug and block_id', async () => {
      const client = createAuthClient();
      const response = await client.post(`/sites/${createdSiteId}/forms/submit`, {
        page_slug: 'contact',
        block_id: 'block-contact-form',
        payload: { name: 'Jane', email: 'jane@example.com', message: 'Hello' },
      });
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('submissionId');
      expect(response.data.data).toHaveProperty('message');
      submissionId = response.data.data.submissionId;
    });

    test('should accept submission with form_instance_id after first submit', async () => {
      const authClient = createAuthClient(authToken);
      const listRes = await authClient.get(`/sites/${createdSiteId}/forms`);
      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.data.data)).toBe(true);
      expect(listRes.data.data.length).toBeGreaterThan(0);
      formInstanceId = listRes.data.data[0].id;

      const client = createAuthClient();
      const response = await client.post(`/sites/${createdSiteId}/forms/submit`, {
        form_instance_id: formInstanceId,
        payload: { name: 'Bob', email: 'bob@example.com', message: 'Second submission' },
      });
      expect(response.status).toBe(201);
      expect(response.data.data.submissionId).toBeDefined();
    });

    test('should reject submit without payload', async () => {
      const client = createAuthClient();
      try {
        await client.post(`/sites/${createdSiteId}/forms/submit`, {
          page_slug: 'contact',
          block_id: 'block-contact-form',
        });
      } catch (err) {
        expect(err.response.status).toBe(422);
        expect(err.response.data.success).toBe(false);
      }
    });

    test('should reject submit with invalid payload (not object)', async () => {
      const client = createAuthClient();
      try {
        await client.post(`/sites/${createdSiteId}/forms/submit`, {
          page_slug: 'contact',
          block_id: 'block-contact-form',
          payload: 'not-an-object',
        });
      } catch (err) {
        expect(err.response.status).toBe(422);
      }
    });

    test('should reject submit when page not found', async () => {
      const client = createAuthClient();
      try {
        await client.post(`/sites/${createdSiteId}/forms/submit`, {
          page_slug: 'nonexistent-page',
          block_id: 'block-contact-form',
          payload: { name: 'x', email: 'x@x.com', message: 'x' },
        });
      } catch (err) {
        expect(err.response.status).toBe(404);
      }
    });

    test('should reject submit when block not found on page', async () => {
      const client = createAuthClient();
      try {
        await client.post(`/sites/${createdSiteId}/forms/submit`, {
          page_slug: 'contact',
          block_id: 'block-nonexistent',
          payload: { name: 'x', email: 'x@x.com', message: 'x' },
        });
      } catch (err) {
        expect(err.response.status).toBe(404);
      }
    });

    test('should reject submit with invalid form_instance_id', async () => {
      const client = createAuthClient();
      try {
        await client.post(`/sites/${createdSiteId}/forms/submit`, {
          form_instance_id: '00000000-0000-0000-0000-000000000000',
          payload: { name: 'x', email: 'x@x.com', message: 'x' },
        });
      } catch (err) {
        expect(err.response.status).toBe(404);
      }
    });

    test('should reject submit when honeypot is filled (bot)', async () => {
      const client = createAuthClient();
      try {
        await client.post(`/sites/${createdSiteId}/forms/submit`, {
          page_slug: 'contact',
          block_id: 'block-contact-form',
          payload: { name: 'Bot', email: 'bot@example.com', message: 'spam' },
          _hp: 'filled-by-bot',
        });
      } catch (err) {
        expect(err.response.status).toBe(400);
        expect(err.response.data.success).toBe(false);
      }
    });
  });

  describe('Option A: form instance sync on page save', () => {
    test('should register form when page is created with form block (no submit yet)', async () => {
      const authClient = createAuthClient(authToken);
      const listBefore = await authClient.get(`/sites/${createdSiteId}/forms`);
      const countBefore = listBefore.data.data?.length ?? 0;

      const pageRes = await authClient.post(`/sites/${createdSiteId}/pages`, {
        title: 'Newsletter',
        slug: 'newsletter-sync-test',
        content: {
          regions: [
            {
              id: 'main',
              blocks: [
                {
                  id: 'block-newsletter-sync',
                  type: 'newsletter',
                  name: 'Newsletter Signup',
                  data: {},
                },
              ],
            },
          ],
        },
      });
      expect([200, 201]).toContain(pageRes.status);
      const newPageId = pageRes.data.data?.id;
      expect(newPageId).toBeDefined();
      createdResources.pages.push({ page_id: newPageId, token: authToken });

      const listAfter = await authClient.get(`/sites/${createdSiteId}/forms`);
      expect(listAfter.data.data.length).toBeGreaterThan(countBefore);
      const newsletterForm = listAfter.data.data.find((f) => f.block_id === 'block-newsletter-sync');
      expect(newsletterForm).toBeDefined();
      expect(newsletterForm.block_type).toBe('newsletter');
      expect(newsletterForm.page_slug).toBe('newsletter-sync-test');
    });

    test('should register additional form when page is updated with new form block', async () => {
      const authClient = createAuthClient(authToken);
      const listBefore = await authClient.get(`/sites/${createdSiteId}/forms`);
      const countBefore = listBefore.data.data?.length ?? 0;

      const pageRes = await authClient.post(`/sites/${createdSiteId}/pages`, {
        title: 'Two Forms',
        slug: 'two-forms-sync-test',
        content: {
          blocks: [
            { id: 'block-form-a', type: 'contactform', name: 'Form A', data: {} },
          ],
        },
      });
      expect([200, 201]).toContain(pageRes.status);
      const pageId = pageRes.data.data?.id;
      expect(pageId).toBeDefined();
      createdResources.pages.push({ page_id: pageId, token: authToken });

      const listMid = await authClient.get(`/sites/${createdSiteId}/forms`);
      const formA = listMid.data.data.find((f) => f.block_id === 'block-form-a');
      expect(formA).toBeDefined();

      await authClient.put(`/sites/${createdSiteId}/pages/${pageId}`, {
        content: {
          blocks: [
            { id: 'block-form-a', type: 'contactform', name: 'Form A', data: {} },
            { id: 'block-form-b', type: 'contactform', name: 'Form B', data: {} },
          ],
        },
      });

      const listAfter = await authClient.get(`/sites/${createdSiteId}/forms`);
      expect(listAfter.data.data.length).toBeGreaterThan(countBefore + 1);
      const formB = listAfter.data.data.find((f) => f.block_id === 'block-form-b');
      expect(formB).toBeDefined();
      expect(formB.page_slug).toBe('two-forms-sync-test');
    });

    test('should not add form instances when page has no form blocks', async () => {
      const authClient = createAuthClient(authToken);
      const listBefore = await authClient.get(`/sites/${createdSiteId}/forms`);
      const countBefore = listBefore.data.data?.length ?? 0;

      const pageRes = await authClient.post(`/sites/${createdSiteId}/pages`, {
        title: 'No Forms',
        slug: 'no-forms-sync-test',
        content: {
          blocks: [
            { id: 'block-text', type: 'text', name: 'Text Block', data: { content: 'Hello' } },
          ],
        },
      });
      if (pageRes.data?.data?.id) createdResources.pages.push({ page_id: pageRes.data.data.id, token: authToken });

      const listAfter = await authClient.get(`/sites/${createdSiteId}/forms`);
      const noFormsPageForms = listAfter.data.data.filter((f) => f.page_slug === 'no-forms-sync-test');
      expect(noFormsPageForms.length).toBe(0);
      expect(listAfter.data.data.length).toBe(countBefore);
    });
  });

  describe('GET /sites/:siteId/forms (dashboard)', () => {
    test('should list form instances when authenticated', async () => {
      const client = createAuthClient(authToken);
      const response = await client.get(`/sites/${createdSiteId}/forms`);
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data)).toBe(true);
      const form = response.data.data.find((f) => f.block_id === 'block-contact-form');
      expect(form).toBeDefined();
      expect(form).toHaveProperty('id');
      expect(form).toHaveProperty('page_slug', 'contact');
      expect(form).toHaveProperty('block_type', 'contactform');
      expect(form).toHaveProperty('submissions_count');
      if (!formInstanceId) formInstanceId = form.id;
    });

    test('should require authentication', async () => {
      const client = createAuthClient();
      try {
        await client.get(`/sites/${createdSiteId}/forms`);
      } catch (err) {
        expect(err.response.status).toBe(401);
      }
    });
  });

  describe('GET /sites/:siteId/forms/:formInstanceId/submissions (dashboard)', () => {
    test('should list submissions for form instance', async () => {
      if (!formInstanceId) {
        const listRes = await createAuthClient(authToken).get(`/sites/${createdSiteId}/forms`);
        formInstanceId = listRes.data.data[0].id;
      }
      const client = createAuthClient(authToken);
      const response = await client.get(
        `/sites/${createdSiteId}/forms/${formInstanceId}/submissions?page=1&limit=10`
      );
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('items');
      expect(response.data.data).toHaveProperty('total');
      expect(response.data.data).toHaveProperty('page');
      expect(response.data.data).toHaveProperty('limit');
      expect(Array.isArray(response.data.data.items)).toBe(true);
      expect(response.data.data.total).toBeGreaterThanOrEqual(2);
      if (response.data.data.items[0] && !submissionId) {
        submissionId = response.data.data.items[0].id;
      }
    });

    test('should filter submissions by status', async () => {
      const client = createAuthClient(authToken);
      const response = await client.get(
        `/sites/${createdSiteId}/forms/${formInstanceId}/submissions?status=new`
      );
      expect(response.status).toBe(200);
      expect(response.data.data.items.every((s) => s.status === 'new')).toBe(true);
    });
  });

  describe('GET /sites/:siteId/forms/submissions/:submissionId (dashboard)', () => {
    test('should return submission with responses', async () => {
      if (!submissionId) return;
      const client = createAuthClient(authToken);
      const response = await client.get(
        `/sites/${createdSiteId}/forms/submissions/${submissionId}`
      );
      expect(response.status).toBe(200);
      expect(response.data.data).toHaveProperty('id', submissionId);
      expect(response.data.data).toHaveProperty('payload');
      expect(response.data.data).toHaveProperty('status');
      expect(response.data.data).toHaveProperty('responses');
      expect(Array.isArray(response.data.data.responses)).toBe(true);
    });

    test('should return 404 for unknown submission', async () => {
      const client = createAuthClient(authToken);
      try {
        await client.get(
          `/sites/${createdSiteId}/forms/submissions/00000000-0000-0000-0000-000000000000`
        );
      } catch (err) {
        expect(err.response.status).toBe(404);
      }
    });
  });

  describe('PATCH /sites/:siteId/forms/submissions/:submissionId (dashboard)', () => {
    test('should update submission status', async () => {
      if (!submissionId) return;
      const client = createAuthClient(authToken);
      const response = await client.patch(
        `/sites/${createdSiteId}/forms/submissions/${submissionId}`,
        { status: 'read' }
      );
      expect(response.status).toBe(200);
      expect(response.data.data.status).toBe('read');
    });

    test('should reject invalid status', async () => {
      if (!submissionId) return;
      const client = createAuthClient(authToken);
      try {
        await client.patch(
          `/sites/${createdSiteId}/forms/submissions/${submissionId}`,
          { status: 'invalid' }
        );
      } catch (err) {
        expect(err.response.status).toBe(422);
      }
    });
  });

  describe('POST /sites/:siteId/forms/submissions/:submissionId/responses (dashboard)', () => {
    test('should add a note response', async () => {
      if (!submissionId) return;
      const client = createAuthClient(authToken);
      const response = await client.post(
        `/sites/${createdSiteId}/forms/submissions/${submissionId}/responses`,
        { type: 'note', body: 'Internal note here' }
      );
      expect(response.status).toBe(201);
      expect(response.data.data).toHaveProperty('id');
      expect(response.data.data.type).toBe('note');
      expect(response.data.data.body).toBe('Internal note here');
    });

    test('should add reply and set submission status to replied', async () => {
      if (!submissionId) return;
      const client = createAuthClient(authToken);
      await client.post(
        `/sites/${createdSiteId}/forms/submissions/${submissionId}/responses`,
        { type: 'reply', body: 'Thank you for your message.' }
      );
      const getRes = await client.get(
        `/sites/${createdSiteId}/forms/submissions/${submissionId}`
      );
      expect(getRes.data.data.status).toBe('replied');
      expect(getRes.data.data.responses.length).toBeGreaterThanOrEqual(2);
    });

    test('should reject missing body', async () => {
      if (!submissionId) return;
      const client = createAuthClient(authToken);
      try {
        await client.post(
          `/sites/${createdSiteId}/forms/submissions/${submissionId}/responses`,
          { type: 'note' }
        );
      } catch (err) {
        expect(err.response.status).toBe(422);
      }
    });
  });
});
