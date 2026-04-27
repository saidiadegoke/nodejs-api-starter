const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('JUPEB finance API', () => {
  let financeMigrated = false;
  let jupebEnhancements = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_payment_reconciliations LIMIT 1');
      financeMigrated = true;
    } catch {
      financeMigrated = false;
      // eslint-disable-next-line no-console
      console.warn('[jupeb.finance.api] Skipping: apply migration `007_jupeb_finance.sql`.');
    }
    if (financeMigrated) {
      try {
        await pool.query('SELECT registration_fee_amount FROM jupeb_registration_sessions LIMIT 1');
        jupebEnhancements = true;
      } catch {
        jupebEnhancements = false;
      }
    }
  });

  const adminCredentials = {
    identifier: 'admin@example.com',
    password: 'Admin@12',
  };

  async function getAdminToken() {
    const res = await request(app).post('/auth/login').send(adminCredentials);
    if (res.status !== 200 || !res.body.data?.access_token) return null;
    return res.body.data.access_token;
  }

  it('POST /finance/me/checkout without auth returns 401', async () => {
    const res = await request(app).post('/finance/me/checkout').send({ amount: 1000 });
    expect(res.status).toBe(401);
  });

  it('checkout, my payments, admin list, summary, session report, reconcile', async () => {
    if (!financeMigrated) return;
    const token = await getAdminToken();
    if (!token) return;

    const suffix = Date.now();
    const prefix = nextJupebTestPrefix();
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('FIN'),
        name: `Finance Uni ${suffix}`,
        jupeb_prefix: prefix,
      });
    expect(uniRes.status).toBe(201);

    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('FNSC'),
        title: 'Fin Combo',
        subjects: ['A', 'B', 'C'],
        is_global: true,
      });
    expect(scRes.status).toBe(201);

    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const sessRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
      });
    expect(sessRes.status).toBe(201);
    const sessionId = sessRes.body.data.id;
    await closeAllOpenJupebSessions(token);
    await request(app).post(`/sessions/${sessionId}/open`).set('Authorization', `Bearer ${token}`);

    const regRes = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    expect(regRes.status).toBe(201);
    const registrationId = regRes.body.data.id;

    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: regRes.body.data.institution_issued_code });

    const checkout = await request(app)
      .post('/finance/me/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5000, currency: 'NGN' });
    expect(checkout.status).toBe(201);
    expect(checkout.body.data.registration_id).toBe(registrationId);

    const dup = await request(app)
      .post('/finance/me/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1000 });
    expect(dup.status).toBe(409);

    const mine = await request(app).get('/finance/me/payments').set('Authorization', `Bearer ${token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBeGreaterThanOrEqual(1);

    const adminList = await request(app)
      .get('/finance/payments')
      .set('Authorization', `Bearer ${token}`);
    expect(adminList.status).toBe(200);

    const summary = await request(app)
      .get(`/finance/registrations/${registrationId}/payment-summary`)
      .set('Authorization', `Bearer ${token}`);
    expect(summary.status).toBe(200);
    expect(summary.body.data.totals.payment_count).toBeGreaterThanOrEqual(1);

    const report = await request(app)
      .get(`/finance/reports/session/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(report.status).toBe(200);
    expect(report.body.data.session_id).toBe(sessionId);
    if (jupebEnhancements) {
      expect(typeof report.body.data.partial_payment_registration_count).toBe('number');
    }

    const recon = await request(app)
      .post(`/finance/registrations/${registrationId}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        payment_id: checkout.body.data.id,
        status_snapshot: 'successful',
        captured_amount: 5000,
        currency: 'NGN',
        gateway_reference: 'test-ref',
      });
    expect(recon.status).toBe(201);
    expect(recon.body.data.status_snapshot).toBe('successful');
  });

  it('checkout rejects amount/currency when session fee rules are configured', async () => {
    if (!financeMigrated || !jupebEnhancements) return;
    const token = await getAdminToken();
    if (!token) return;

    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('FEE'),
        name: `Fee Uni ${Date.now()}`,
        jupeb_prefix: nextJupebTestPrefix(),
      });
    expect(uniRes.status).toBe(201);
    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('FSC'),
        title: 'Fee Combo',
        subjects: ['A', 'B', 'C'],
        is_global: true,
      });
    expect(scRes.status).toBe(201);
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const sessRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        registration_fee_amount: 7500,
        registration_fee_currency: 'NGN',
      });
    expect(sessRes.status).toBe(201);
    const sessionId = sessRes.body.data.id;
    await closeAllOpenJupebSessions(token);
    await request(app).post(`/sessions/${sessionId}/open`).set('Authorization', `Bearer ${token}`);

    const regRes = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    expect(regRes.status).toBe(201);
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: regRes.body.data.institution_issued_code });

    const wrongAmt = await request(app)
      .post('/finance/me/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5000, currency: 'NGN' });
    expect(wrongAmt.status).toBe(422);

    const wrongCur = await request(app)
      .post('/finance/me/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 7500, currency: 'USD' });
    expect(wrongCur.status).toBe(422);
  });

  it('payment verify updates jupeb_registrations.payment_projection to paid', async () => {
    if (!financeMigrated || !jupebEnhancements) return;
    const token = await getAdminToken();
    if (!token) return;
    const paymentService = require('../modules/payments/services/payment.service');

    const suffix = Date.now() + 12;
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('PRJ'),
        name: `Proj Uni ${suffix}`,
        jupeb_prefix: nextJupebTestPrefix(),
      });
    expect(uniRes.status).toBe(201);
    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode('PRJSC'),
        title: 'Proj Combo',
        subjects: ['A', 'B', 'C'],
        is_global: true,
      });
    expect(scRes.status).toBe(201);
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const sessRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
      });
    expect(sessRes.status).toBe(201);
    await closeAllOpenJupebSessions(token);
    await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${token}`);

    const regRes = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessRes.body.data.id,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    expect(regRes.status).toBe(201);
    const registrationId = regRes.body.data.id;
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ institution_issued_code: regRes.body.data.institution_issued_code });

    const checkout = await request(app)
      .post('/finance/me/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 3200, currency: 'NGN' });
    expect(checkout.status).toBe(201);
    const pay = checkout.body.data;
    const pend = await pool.query(`SELECT payment_projection FROM jupeb_registrations WHERE id = $1`, [registrationId]);
    expect(pend.rows[0].payment_projection).toBe('pending');

    await paymentService.verifyPayment(pay.payment_id, 'test-ref-verify', null, pay.payment_method || 'paystack', {});

    const done = await pool.query(`SELECT payment_projection FROM jupeb_registrations WHERE id = $1`, [registrationId]);
    expect(done.rows[0].payment_projection).toBe('paid');
  });
});
