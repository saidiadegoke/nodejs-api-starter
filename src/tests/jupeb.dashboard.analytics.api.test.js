/**
 * Analytics endpoints powering the Dashboard + Registration Management
 * screens.
 *
 * Covers the additions made for the frontend graphs:
 *   - stat-cards now carries `institutions_onboarded` + `without_biometrics`
 *   - quick-stats now carries `institutions_count`
 *   - GET /dashboard/institution-distribution     (donut)
 *   - GET /dashboard/session-timeline             (timeline card)
 */
const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');

describe('Dashboard analytics — added widgets', () => {
  async function adminToken() {
    const r = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return r.body.data?.access_token;
  }

  it('GET /dashboard/stat-cards returns institutions_onboarded + without_biometrics', async () => {
    const token = await adminToken();
    if (!token) return;
    const r = await request(app)
      .get('/dashboard/stat-cards')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveProperty('institutions_onboarded');
    expect(typeof r.body.data.institutions_onboarded.value).toBe('number');
    expect(r.body.data).toHaveProperty('without_biometrics');
    expect(typeof r.body.data.without_biometrics.value).toBe('number');
    // Sanity — every existing card still present
    expect(r.body.data).toHaveProperty('total_registered');
    expect(r.body.data).toHaveProperty('approved');
    expect(r.body.data).toHaveProperty('pending');
    expect(r.body.data).toHaveProperty('with_biometrics');
    expect(r.body.data).toHaveProperty('total_subjects');
    expect(r.body.data).toHaveProperty('inactive_subjects');
    expect(r.body.data).toHaveProperty('total_subject_combinations');
    expect(typeof r.body.data.total_subject_combinations.value).toBe('number');
    expect(r.body.data).toHaveProperty('active_subject_combinations');
    expect(typeof r.body.data.active_subject_combinations.value).toBe('number');
    expect(r.body.data).toHaveProperty('inactive_subject_combinations');
    expect(typeof r.body.data.inactive_subject_combinations.value).toBe('number');
    expect(r.body.data).toHaveProperty('total_active_subject_combinations');
    expect(r.body.data).toHaveProperty('total_inactive_subject_combinations');
    expect(r.body.data).toHaveProperty('registration_locked');
    expect(typeof r.body.data.registration_locked).toBe('boolean');
    expect(r.body.data.registration_lock).toEqual(
      expect.objectContaining({
        locked: expect.any(Boolean),
      })
    );
  });

  it('GET /dashboard/quick-stats now includes institutions_count', async () => {
    const token = await adminToken();
    if (!token) return;
    const r = await request(app)
      .get('/dashboard/quick-stats')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(typeof r.body.data.institutions_count).toBe('number');
    expect(typeof r.body.data.total_students).toBe('number');
    expect(r.body.data).toHaveProperty('active_session');
  });

  it('GET /dashboard/institution-distribution returns slices + total', async () => {
    const token = await adminToken();
    if (!token) return;
    const r = await request(app)
      .get('/dashboard/institution-distribution')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(typeof r.body.data.total).toBe('number');
    expect(Array.isArray(r.body.data.slices)).toBe(true);
    if (r.body.data.slices.length) {
      const s = r.body.data.slices[0];
      expect(s).toHaveProperty('type');
      expect(typeof s.count).toBe('number');
      expect(typeof s.pct).toBe('number');
    }
    // The slice percentages should sum to ~100 (allowing rounding slack).
    const sum = r.body.data.slices.reduce((acc, s) => acc + s.pct, 0);
    if (r.body.data.total > 0) {
      expect(sum).toBeGreaterThan(99);
      expect(sum).toBeLessThan(101);
    }
  });

  it('GET /dashboard/session-timeline returns opens_at, closes_at, now, within_window', async () => {
    const token = await adminToken();
    if (!token) return;
    const r = await request(app)
      .get('/dashboard/session-timeline')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    if (r.body.data === null) return; // no sessions in DB — acceptable for fresh envs
    expect(r.body.data).toHaveProperty('session_id');
    expect(r.body.data).toHaveProperty('academic_year');
    expect(r.body.data).toHaveProperty('opens_at');
    expect(r.body.data).toHaveProperty('closes_at');
    expect(r.body.data).toHaveProperty('now');
    expect(typeof r.body.data.within_window).toBe('boolean');
  });

  it('analytics endpoints require auth', async () => {
    const r1 = await request(app).get('/dashboard/institution-distribution');
    expect(r1.status).toBe(401);
    const r2 = await request(app).get('/dashboard/session-timeline');
    expect(r2.status).toBe(401);
  });

  it('GET /dashboard/subject-combination-distribution returns distribution without SQL errors', async () => {
    const token = await adminToken();
    if (!token) return;
    const r = await request(app)
      .get('/dashboard/subject-combination-distribution')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveProperty('total');
    expect(r.body.data).toHaveProperty('slices');
    expect(Array.isArray(r.body.data.slices)).toBe(true);
  });

  it('GET /dashboard/subject-enrollment returns items with subjects list', async () => {
    const token = await adminToken();
    if (!token) return;
    const r = await request(app)
      .get('/dashboard/subject-enrollment')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
  });
});
