const bcrypt = require('bcryptjs');
const request = require('supertest');
const { getAppUnderTest } = require('./helpers/app-under-test');
const pool = require('../database/pool');

describe('Users profile API', () => {
  let app;
  const password = 'Profile@12';
  const passwordHash = bcrypt.hashSync(password, 10);

  beforeAll(async () => {
    app = await getAppUnderTest();
  });

  async function createUser(email) {
    const phone = `+2348${String(Date.now()).slice(-9)}`;
    const userRes = await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active')
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [email, phone, passwordHash]
    );
    const userId = userRes.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name)
       VALUES ($1, 'Finance', 'User', 'finance User')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const roleRow = await pool.query(`SELECT id FROM roles WHERE name = 'financial_admin' LIMIT 1`);
    if (roleRow.rows[0]) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, roleRow.rows[0].id]
      );
    }
    return userId;
  }

  async function login(email) {
    const res = await request(app).post('/auth/login').send({ identifier: email, password });
    return res.body.data?.access_token || null;
  }

  it('GET /users/me returns personal info fields', async () => {
    const email = `profile_get_${Date.now()}@example.com`;
    await createUser(email);
    const token = await login(email);
    expect(token).toBeTruthy();

    const res = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe('finance User');
    expect(res.body.data.position).toBe('Financial Admin');
    expect(res.body.data).toHaveProperty('professional_title');
    expect(res.body.data).toHaveProperty('phone');
  });

  it('PUT /users/me updates full_name, professional_title, and phone', async () => {
    const email = `profile_put_${Date.now()}@example.com`;
    await createUser(email);
    const token = await login(email);
    expect(token).toBeTruthy();

    const uniquePhone = `+2347${String(Date.now() + 1).slice(-9)}`;
    const res = await request(app)
      .put('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        full_name: 'Dr. John Adewale',
        professional_title: 'Dr',
        phone: uniquePhone,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe('Dr. John Adewale');
    expect(res.body.data.professional_title).toBe('Dr');
    expect(res.body.data.phone).toBe(uniquePhone);
    expect(res.body.data.position).toBe('Financial Admin');
  });
});
