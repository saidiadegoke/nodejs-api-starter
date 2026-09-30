const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  buildCatalogUniversityPayload,
  closeAllOpenJupebSessions,
  nextJupebAcademicSession,
  nextJupebTestUniversityCode,
} = require('./jupeb-session-test-helpers');

describe('JUPEB foundation finance API', () => {
  let financeMigrated = false;
  let institutionPaymentsMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_payment_reconciliations LIMIT 1');
      financeMigrated = true;
    } catch {
      financeMigrated = false;
    }
    if (financeMigrated) {
      try {
        await pool.query('SELECT jupeb_university_id FROM payments LIMIT 1');
        institutionPaymentsMigrated = true;
      } catch {
        institutionPaymentsMigrated = false;
      }
    }
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  it('GET /finance/overview requires auth', async () => {
    const res = await request(app).get('/finance/overview');
    expect(res.status).toBe(401);
  });

  it('foundation overview, analytics charts, fee records table, institution payments', async () => {
    if (!financeMigrated || !institutionPaymentsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        buildCatalogUniversityPayload(String(suffix).slice(-3), {
          name: `Foundation Fin ${suffix}`,
          email: `foundation_${suffix}@example.com`,
        })
      );
    expect(uniRes.status).toBe(201);
    const universityId = uniRes.body.data.id;

    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: nextJupebTestUniversityCode('FFN'),
        title: 'Foundation Fin Combo',
        subjects: ['A', 'B', 'C'],
        is_global: true,
      });
    expect(scRes.status).toBe(201);

    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const sessRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        affiliation_fee_existing: 250000,
        affiliation_fee_new: 350000,
        exam_fee_per_candidate: 45000,
      });
    expect(sessRes.status).toBe(201);
    const sessionId = sessRes.body.data.id;
    await closeAllOpenJupebSessions(adminToken);
    await request(app).post(`/sessions/${sessionId}/open`).set('Authorization', `Bearer ${adminToken}`);

    await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessionId,
        university_id: universityId,
        subject_combination_id: scRes.body.data.id,
      });
    await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessionId,
        university_id: universityId,
        subject_combination_id: scRes.body.data.id,
      });

    const examItem = await pool.query(
      `SELECT id FROM payment_items WHERE code = 'examination_fee' LIMIT 1`
    );
    const affItem = await pool.query(
      `SELECT id FROM payment_items WHERE code = 'affiliation_fee' LIMIT 1`
    );
    const structure = await pool.query(
      `SELECT id FROM payment_structures WHERE code = 'partial' LIMIT 1`
    );
    const paidAt = new Date().toISOString();
    await pool.query(
      `INSERT INTO payments (
         payment_id, amount, currency, type, payment_type, status, payment_method,
         user_id, purpose, payment_item_id, payment_structure_id,
         jupeb_university_id, jupeb_session_id, paid_at, created_at
       ) VALUES ($1, 30000, 'NGN', 'other', 'checkout', 'completed', 'direct_transfer',
         (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1),
         'Exam partial', $2, $3, $4, $5, $6, $6),
              ($7, 50000, 'NGN', 'other', 'checkout', 'completed', 'direct_transfer',
         (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1),
         'Affiliation partial', $8, $3, $4, $5, $6, $6)`,
      [
        `ff-exam-${suffix}`,
        examItem.rows[0].id,
        structure.rows[0].id,
        universityId,
        sessionId,
        paidAt,
        `ff-aff-${suffix}`,
        affItem.rows[0].id,
      ]
    );

    const overview = await request(app)
      .get(`/finance/overview?session_id=${sessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(overview.status).toBe(200);
    expect(overview.body.data.institutions_with_registrations.value).toBe(1);
    expect(overview.body.data.total_candidates_registered.value).toBe(2);
    expect(overview.body.data.total_affiliation_fee.projected.value).toBeGreaterThan(0);
    expect(overview.body.data.total_affiliation_fee.collected.value).toBe(50000);
    expect(overview.body.data.total_examination_fee.projected.value).toBe(90000);
    expect(overview.body.data.total_examination_fee.collected.value).toBe(30000);
    expect(overview.body.data.registration_status.status).toBeDefined();

    const examChart = await request(app)
      .get(`/finance/analytics/exam-fee-by-institution?session_id=${sessionId}&limit=6`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(examChart.status).toBe(200);
    expect(examChart.body.data.institutions.length).toBe(1);
    expect(examChart.body.data.institutions[0].exam_fee).toBe(90000);
    expect(examChart.body.data.institutions[0].collected_examination).toBe(30000);
    expect(examChart.body.data.total_projected_exam_fee).toBe(90000);

    const year = new Date().getUTCFullYear();
    const trends = await request(app)
      .get(`/finance/analytics/payment-trends?year=${year}&session_id=${sessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(trends.status).toBe(200);
    const currentSeries = trends.body.data.series.find((s) => s.key === 'current');
    const monthTotal = currentSeries.points.reduce((sum, p) => sum + p.amount, 0);
    expect(monthTotal).toBeGreaterThanOrEqual(80000);

    const records = await request(app)
      .get(`/finance/analytics/institution-fee-records?session_id=${sessionId}&q=Foundation`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(records.status).toBe(200);
    expect(records.body.data.length).toBe(1);
    expect(records.body.data[0].jupeb_prefix).toBeDefined();
    expect(records.body.data[0].email).toBe(`foundation_${suffix}@example.com`);
    expect(records.body.data[0].status).toBe('active');
    expect(records.body.data[0].collected.examination_fee).toBe(30000);

    const instPayments = await request(app)
      .get(
        `/finance/analytics/institutions/${universityId}/payments?session_id=${sessionId}`
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(instPayments.status).toBe(200);
    expect(instPayments.body.data.length).toBeGreaterThanOrEqual(2);
    expect(instPayments.body.pagination.total).toBeGreaterThanOrEqual(2);
  });
});
