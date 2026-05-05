/**
 * Posts ↔ files integration: media attach/clear, include=media, og_image_file_id validation.
 * Requires PostgreSQL from .env (same as other API tests).
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const app = require('../app');
const pool = require('../db/pool');

describe('Posts media & og_image_file_id', () => {
  const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const emailA = `postmedia_a_${suffix}@example.com`;
  const emailB = `postmedia_b_${suffix}@example.com`;
  const password = 'TestPostMedia@1';
  let userA;
  let userB;
  let tokenA;
  let tokenB;
  let fileIdA;
  let fileIdB;
  let postId;

  beforeAll(async () => {
    const passwordHash = bcrypt.hashSync(password, 10);
    const { rows: ra } = await pool.query(
      `INSERT INTO users (email, email_verified, phone_verified, password_hash, status)
       VALUES ($1, true, true, $2, 'active') RETURNING id`,
      [emailA, passwordHash]
    );
    const { rows: rb } = await pool.query(
      `INSERT INTO users (email, email_verified, phone_verified, password_hash, status)
       VALUES ($1, true, true, $2, 'active') RETURNING id`,
      [emailB, passwordHash]
    );
    userA = ra[0].id;
    userB = rb[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name)
       VALUES ($1, 'A', 'One', 'A One'), ($2, 'B', 'Two', 'B Two')
       ON CONFLICT (user_id) DO NOTHING`,
      [userA, userB]
    );

    fileIdA = randomUUID();
    fileIdB = randomUUID();
    await pool.query(
      `INSERT INTO files (id, provider, file_url, file_type, uploaded_by, context)
       VALUES ($1, 'local', 'https://example.test/a.png', 'image/png', $2, 'user_assets'),
              ($3, 'local', 'https://example.test/b.png', 'image/png', $4, 'user_assets')`,
      [fileIdA, userA, fileIdB, userB]
    );

    const loginA = await request(app)
      .post('/auth/login')
      .send({ identifier: emailA, password })
      .expect('Content-Type', /json/);
    const loginB = await request(app)
      .post('/auth/login')
      .send({ identifier: emailB, password })
      .expect('Content-Type', /json/);

    if (loginA.status !== 200 || !loginA.body.data?.access_token) {
      throw new Error(`Login A failed: ${loginA.status} ${JSON.stringify(loginA.body)}`);
    }
    tokenA = loginA.body.data.access_token;
    tokenB = loginB.body.data.access_token;

    const createPost = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: `Media test ${suffix}`, status: 'published' })
      .expect('Content-Type', /json/);
    if (createPost.status !== 201) {
      throw new Error(`Create post failed: ${createPost.status} ${JSON.stringify(createPost.body)}`);
    }
    postId = createPost.body.data.id;
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM files WHERE id = ANY($1::uuid[])', [[fileIdA, fileIdB]]);
      if (userA && userB) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[posts.media test cleanup]', e.message);
    }
  });

  it('PUT /posts/:id/media attaches owned file; GET ?include=media embeds list', async () => {
    const put = await request(app)
      .put(`/posts/${postId}/media`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [{ file_id: fileIdA, role: 'gallery', sort_order: 0 }] })
      .expect('Content-Type', /json/);
    expect(put.status).toBe(200);
    expect(put.body.success).toBe(true);
    expect(put.body.data.media).toHaveLength(1);
    expect(put.body.data.media[0].file_id).toBe(fileIdA);

    const get = await request(app)
      .get(`/posts/${postId}?include=media`)
      .expect('Content-Type', /json/);
    expect(get.status).toBe(200);
    expect(get.body.data.media).toHaveLength(1);
    expect(get.body.data.media[0].file_url).toContain('example.test');
  });

  it('PUT /posts/:id/media with items: [] clears attachments', async () => {
    const put = await request(app)
      .put(`/posts/${postId}/media`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [] })
      .expect('Content-Type', /json/);
    expect(put.status).toBe(200);
    expect(put.body.data.media).toHaveLength(0);

    const get = await request(app).get(`/posts/${postId}?include=media`).expect('Content-Type', /json/);
    expect(get.status).toBe(200);
    expect(get.body.data.media).toHaveLength(0);
  });

  it('POST /posts rejects og_image_file_id that does not exist', async () => {
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        title: `Og bad ${suffix}`,
        og_image_file_id: randomUUID(),
        status: 'draft',
      })
      .expect('Content-Type', /json/);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('POST /posts rejects og_image_file_id owned by another user', async () => {
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        title: `Og other ${suffix}`,
        og_image_file_id: fileIdB,
        status: 'draft',
      })
      .expect('Content-Type', /json/);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('POST /posts accepts og_image_file_id for own file', async () => {
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        title: `Og ok ${suffix}`,
        og_image_file_id: fileIdA,
        status: 'draft',
      })
      .expect('Content-Type', /json/);
    expect(res.status).toBe(201);
    expect(res.body.data.og_image_file_id).toBe(fileIdA);
    const createdId = res.body.data.id;
    await pool.query('DELETE FROM posts WHERE id = $1', [createdId]);
  });

  it('PUT /posts/:id/media rejects file owned by another user', async () => {
    const res = await request(app)
      .put(`/posts/${postId}/media`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [{ file_id: fileIdB, role: 'gallery' }] })
      .expect('Content-Type', /json/);
    expect(res.status).toBe(403);
  });
});
