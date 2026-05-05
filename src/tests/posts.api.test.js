const request = require('supertest');
const { randomUUID } = require('crypto');
const app = require('../app');

describe('Posts API smoke', () => {

  it('GET /posts returns success with empty or populated list', async () => {
    const res = await request(app).get('/posts').expect('Content-Type', /json/);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.posts).toBeDefined();
    expect(Array.isArray(res.body.data.posts)).toBe(true);
    expect(res.body.data.pagination).toBeDefined();
  });

  it('GET /posts/feed.xml returns RSS', async () => {
    const res = await request(app).get('/posts/feed.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<rss');
  });

  it('GET /posts/search rejects missing q (validation)', async () => {
    const res = await request(app).get('/posts/search').expect('Content-Type', /json/);
    expect(res.status).toBe(422);
  });

  it('GET /posts/search?q=hello returns 200', async () => {
    const res = await request(app).get('/posts/search?q=hello').expect('Content-Type', /json/);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.posts).toBeDefined();
  });

  it('GET /posts/:postId/comments returns 404 when post is missing', async () => {
    const res = await request(app)
      .get(`/posts/${randomUUID()}/comments`)
      .expect('Content-Type', /json/);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
