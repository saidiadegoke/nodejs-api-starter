const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  buildCatalogUniversityPayload,
  closeAllOpenJupebSessions,
  nextJupebAcademicSession,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
} = require('./jupeb-session-test-helpers');

describe('JUPEB institution finance API', () => {
  let financeMigrated = false;
  let institutionPaymentsMigrated = false;
  const password = 'InstFin@12';
  const passwordHash = bcrypt.hashSync(password, 10);

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

  async function createInstitutionAdmin(universityId, email) {
    await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active')
       ON CONFLICT DO NOTHING`,
      [email, `+2347${String(Date.now()).slice(-9)}`, passwordHash]
    );
    const userRow = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
    const userId = userRow.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name, jupeb_university_id)
       VALUES ($1, 'Inst', 'Admin', 'Inst Admin', $2)
       ON CONFLICT (user_id) DO UPDATE SET jupeb_university_id = EXCLUDED.jupeb_university_id`,
      [userId, universityId]
    );
    const roleRow = await pool.query(`SELECT id FROM roles WHERE name = 'institution_admin' LIMIT 1`);
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, roleRow.rows[0].id]
    );
    return userId;
  }

  async function createFinancialAdmin(email) {
    await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active')
       ON CONFLICT DO NOTHING`,
      [email, `+2348${String(Date.now()).slice(-9)}`, passwordHash]
    );
    const userRow = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
    const userId = userRow.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name)
       VALUES ($1, 'Fin', 'Admin', 'Fin Admin')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const roleRow = await pool.query(`SELECT id FROM roles WHERE name = 'financial_admin' LIMIT 1`);
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, roleRow.rows[0].id]
    );
    return userId;
  }

  async function login(email) {
    const res = await request(app).post('/auth/login').send({ identifier: email, password });
    return res.body.data?.access_token || null;
  }

  async function createTestUniversity(adminToken, suffix, baseName) {
    let res;
    for (let i = 0; i < 5; i += 1) {
      const code = nextJupebTestPrefix();
      res = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(
          buildCatalogUniversityPayload(String(suffix).slice(-3), {
            code,
            jupeb_prefix: code,
            name: `${baseName} ${suffix}-${i}`,
          })
        );
      if (res.status === 201) break;
    }
    expect(res.status).toBe(201);
    return res;
  }

  it('GET /finance/institution/overview requires auth', async () => {
    const res = await request(app).get('/finance/institution/overview');
    expect(res.status).toBe(401);
  });

  it('institution admin sees scoped overview, payments, fee preview, checkout, receipt', async () => {
    if (!financeMigrated || !institutionPaymentsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uniA = await createTestUniversity(adminToken, suffix, 'Inst Fin A');
    const uniB = await createTestUniversity(adminToken, suffix + 1, 'Inst Fin B');

    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: nextJupebTestUniversityCode('IFN'),
        title: 'Inst Fin Combo',
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
        university_id: uniA.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessionId,
        university_id: uniA.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });

    const instEmail = `inst_fin_${suffix}@example.com`;
    await createInstitutionAdmin(uniA.body.data.id, instEmail);
    const instToken = await login(instEmail);
    expect(instToken).toBeTruthy();

    const overview = await request(app)
      .get(`/finance/institution/overview?session_id=${sessionId}`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(overview.status).toBe(200);
    expect(overview.body.data.number_of_candidates.value).toBeGreaterThanOrEqual(2);
    expect(overview.body.data.total_expected_affiliation_fee.value).toBeGreaterThan(0);
    expect(overview.body.data.total_expected_examination_fee.value).toBeGreaterThan(0);

    const affFees = await request(app)
      .get(`/finance/institution/fees?session_id=${sessionId}&payment_item=affiliation_fee`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(affFees.status).toBe(200);
    expect(affFees.body.data.total_expected.value).toBeGreaterThan(0);

    const preview = await request(app)
      .get(`/finance/institution/fee-preview?session_id=${sessionId}&payment_item=affiliation_fee`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.outstanding).toBeGreaterThan(0);

    const checkout = await request(app)
      .post('/finance/institution/checkout')
      .set('Authorization', `Bearer ${instToken}`)
      .send({
        session_id: sessionId,
        payment_method: 'direct_transfer',
        payment_item: 'affiliation_fee',
        payment_structure: 'partial',
        amount: 50000,
        description: 'Q1 test payment',
      });
    expect(checkout.status).toBe(201);
    expect(checkout.body.data.payment).toBeDefined();

    const payRow = await pool.query(
      `SELECT jupeb_university_id, jupeb_session_id FROM payments WHERE id = $1`,
      [checkout.body.data.payment.id]
    );
    expect(String(payRow.rows[0].jupeb_university_id)).toBe(String(uniA.body.data.id));
    expect(String(payRow.rows[0].jupeb_session_id)).toBe(String(sessionId));

    const history = await request(app)
      .get(`/finance/institution/payments?session_id=${sessionId}&payment_item=affiliation_fee`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data.length).toBeGreaterThanOrEqual(1);
    expect(history.body.data[0].transaction_id).toBeDefined();

    // Reject payment via confirm endpoint and verify rejection reason is returned in history
    const rejectRes = await request(app)
      .post(`/finance/payments/${checkout.body.data.payment.payment_id}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'rejected',
        reason: 'Invalid receipt uploaded for affiliation fee',
      });
    expect(rejectRes.status).toBe(200);

    const historyAfterReject = await request(app)
      .get(`/finance/institution/payments?session_id=${sessionId}&payment_item=affiliation_fee`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(historyAfterReject.status).toBe(200);
    const rejectedItem = historyAfterReject.body.data.find(
      (p) => p.payment_id === checkout.body.data.payment.payment_id
    );
    expect(rejectedItem).toBeDefined();
    expect(rejectedItem.status).toBe('rejected');
    expect(rejectedItem.rejection_reason).toBe('Invalid receipt uploaded for affiliation fee');
    expect(rejectedItem.reason).toBe('Invalid receipt uploaded for affiliation fee');

    const receipt = await request(app)
      .get(`/finance/institution/payments/${checkout.body.data.payment.payment_id}/receipt`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data.institution.name).toContain('Inst Fin A');

    const otherUniOverview = await request(app)
      .get(`/finance/institution/overview?session_id=${sessionId}&university_id=${uniB.body.data.id}`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(otherUniOverview.status).toBe(403);

    const methods = await request(app)
      .get('/finance/payment-methods')
      .set('Authorization', `Bearer ${instToken}`);
    expect(methods.status).toBe(200);
    if (methods.body.data.length > 0) {
      expect(methods.body.data[0].group).toBeDefined();
    }
  });

  it('duplicate examination fee checkout returns pending_payment details; cancel unblocks retry', async () => {
    if (!financeMigrated || !institutionPaymentsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uni = await createTestUniversity(adminToken, suffix, 'Exam Pending Uni');

    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const sessRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        exam_fee_per_candidate: 45000,
      });
    expect(sessRes.status).toBe(201);
    const sessionId = sessRes.body.data.id;
    await closeAllOpenJupebSessions(adminToken);
    await request(app).post(`/sessions/${sessionId}/open`).set('Authorization', `Bearer ${adminToken}`);

    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: nextJupebTestUniversityCode('EPN'),
        title: 'Exam Pending Combo',
        subjects: ['A', 'B', 'C'],
        is_global: true,
      });
    expect(scRes.status).toBe(201);
    await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessionId,
        university_id: uni.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });

    const instEmail = `exam_pending_${suffix}@example.com`;
    await createInstitutionAdmin(uni.body.data.id, instEmail);
    const instToken = await login(instEmail);
    expect(instToken).toBeTruthy();

    const checkout1 = await request(app)
      .post('/finance/institution/checkout')
      .set('Authorization', `Bearer ${instToken}`)
      .send({
        session_id: sessionId,
        payment_method: 'direct_transfer',
        payment_item: 'examination_fee',
        payment_structure: 'partial',
        amount: 45000,
      });
    expect(checkout1.status).toBe(201);

    const preview = await request(app)
      .get(`/finance/institution/fee-preview?session_id=${sessionId}&payment_item=examination_fee`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.pending_payment).toBeDefined();
    expect(preview.body.data.pending_payment.id).toBe(checkout1.body.data.payment.id);

    const checkout2 = await request(app)
      .post('/finance/institution/checkout')
      .set('Authorization', `Bearer ${instToken}`)
      .send({
        session_id: sessionId,
        payment_method: 'direct_transfer',
        payment_item: 'examination_fee',
        payment_structure: 'partial',
        amount: 45000,
      });
    expect(checkout2.status).toBe(409);
    expect(checkout2.body.details.error_code).toBe('pending_payment_exists');
    expect(checkout2.body.details.pending_payment.id).toBe(checkout1.body.data.payment.id);

    const cancel = await request(app)
      .post(`/finance/institution/payments/${checkout1.body.data.payment.id}/cancel`)
      .set('Authorization', `Bearer ${instToken}`);
    expect(cancel.status).toBe(200);

    const checkout3 = await request(app)
      .post('/finance/institution/checkout')
      .set('Authorization', `Bearer ${instToken}`)
      .send({
        session_id: sessionId,
        payment_method: 'direct_transfer',
        payment_item: 'examination_fee',
        payment_structure: 'partial',
        amount: 45000,
      });
    expect(checkout3.status).toBe(201);
  });

  it('financial_admin can view institution metrics and payments via university_id query', async () => {
    if (!financeMigrated || !institutionPaymentsMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;

    const suffix = Date.now();
    const uni = await createTestUniversity(adminToken, suffix, 'Foundation Fin Uni');

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
        university_id: uni.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });

    const finEmail = `fin_admin_${suffix}@example.com`;
    await createFinancialAdmin(finEmail);
    const finToken = await login(finEmail);
    expect(finToken).toBeTruthy();

    const universityId = uni.body.data.id;
    const overview = await request(app)
      .get(`/finance/overview?session_id=${sessionId}&university_id=${universityId}`)
      .set('Authorization', `Bearer ${finToken}`);
    expect(overview.status).toBe(200);
    expect(overview.body.data.university_id).toBe(universityId);

    const fees = await request(app)
      .get(
        `/finance/fees?session_id=${sessionId}&university_id=${universityId}&payment_item=affiliation_fee`
      )
      .set('Authorization', `Bearer ${finToken}`);
    expect(fees.status).toBe(200);
    expect(fees.body.data.total_expected.value).toBeGreaterThan(0);
    expect(fees.body.data.total_expected_payment.value).toBe(fees.body.data.total_expected.value);
    expect(fees.body.data).toHaveProperty('fee_paid');
    expect(fees.body.data).toHaveProperty('outstanding_fees');
    expect(fees.body.data).toHaveProperty('total_payment_count');

    const examFees = await request(app)
      .get(
        `/finance/analytics/institutions/${universityId}/fees?session_id=${sessionId}&payment_item=examination_fee`
      )
      .set('Authorization', `Bearer ${finToken}`);
    expect(examFees.status).toBe(200);
    expect(examFees.body.data.payment_item.code).toBe('examination_fee');

    const instFees = await request(app)
      .get(
        `/finance/institution/fees?session_id=${sessionId}&university_id=${universityId}&payment_item=affiliation_fee`
      )
      .set('Authorization', `Bearer ${finToken}`);
    expect(instFees.status).toBe(200);

    const payments = await request(app)
      .get(`/finance/payments?session_id=${sessionId}&university_id=${universityId}`)
      .set('Authorization', `Bearer ${finToken}`);
    expect(payments.status).toBe(200);
    expect(Array.isArray(payments.body.data)).toBe(true);

    const pathPayments = await request(app)
      .get(`/finance/analytics/institutions/${universityId}/payments?session_id=${sessionId}`)
      .set('Authorization', `Bearer ${finToken}`);
    expect(pathPayments.status).toBe(200);
    expect(Array.isArray(pathPayments.body.data)).toBe(true);
  });
});
