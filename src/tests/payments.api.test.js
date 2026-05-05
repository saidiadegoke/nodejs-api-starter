const request = require('supertest');
const app = require('../app');

describe('Payments API smoke', () => {
  it('GET /payments/stats returns success', async () => {
    const res = await request(app).get('/payments/stats').expect('Content-Type', /json/);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('POST /payments/process returns 501', async () => {
    const res = await request(app).post('/payments/process').send({}).expect('Content-Type', /json/);
    expect(res.status).toBe(501);
    expect(res.body.success).toBe(false);
  });

  it('GET /payments/verify/:reference returns 404 for unknown ref', async () => {
    const res = await request(app)
      .get('/payments/verify/nonexistent_ref_xyz')
      .expect('Content-Type', /json/);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
