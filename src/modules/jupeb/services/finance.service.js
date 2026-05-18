const pool = require('../../../db/pool');
const registrationModel = require('../models/registration.model');
const sessionModel = require('../models/session.model');
const paymentModel = require('../../payments/models/payment.model');
const paymentProcessorService = require('../../payments/services/paymentProcessor.service');
const { mapPaymentStatusToJupebProjection } = require('../utils/finance-projection');
const { getUserRoles } = require('../../../shared/middleware/rbac.middleware');

const SUPPORTED_PROCESSORS = ['paystack', 'flutterwave', 'direct_transfer'];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

const ROLE_FINANCE = new Set(['financial_admin', 'registrar', 'admin', 'super_admin']);

async function assertFinanceRole(userId) {
  const roles = await getUserRoles(userId);
  if (!roles.some((r) => ROLE_FINANCE.has(r))) {
    throw httpError(403, 'Forbidden');
  }
}

class FinanceService {
  async resolveRegistrationForCheckout(userId, registrationIdOpt) {
    if (registrationIdOpt) {
      if (!isUuid(registrationIdOpt)) throw httpError(422, 'registration_id must be a valid UUID');
      const reg = await registrationModel.findById(registrationIdOpt);
      if (!reg) throw httpError(404, 'Registration not found');
      if (reg.user_id && reg.user_id !== userId) {
        throw httpError(403, 'Registration does not belong to current user');
      }
      if (!reg.user_id) {
        throw httpError(422, 'Registration must be claimed before checkout');
      }
      return reg;
    }
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg || reg.user_id !== userId) {
      throw httpError(404, 'No claimed registration found for checkout');
    }
    return reg;
  }

  /**
   * Start a JUPEB registration-fee checkout. Validates the registration /
   * session / fee, then hands off to paymentProcessorService so the
   * chosen method actually initializes:
   *   - paystack / flutterwave → returns a gateway `payment_link`
   *   - direct_transfer        → returns `bank_account` + emails instructions
   *
   * Body: { amount, currency?, registration_id?, payment_method, redirect_url? }
   * `payment_method` is required and must be one of the supported
   * processors. paystack / flutterwave additionally need an email on the
   * student's account.
   */
  async createCheckout(userId, body) {
    const amount = body && body.amount !== undefined ? Number(body.amount) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw httpError(422, 'amount must be a positive number');
    }
    const currency = (body && body.currency) || 'NGN';

    const processor = body && body.payment_method;
    if (!processor || !SUPPORTED_PROCESSORS.includes(processor)) {
      throw httpError(
        422,
        `payment_method is required and must be one of: ${SUPPORTED_PROCESSORS.join(', ')}`
      );
    }

    const registration = await this.resolveRegistrationForCheckout(userId, body.registration_id || null);
    const session = await sessionModel.findById(registration.session_id);
    if (!session) throw httpError(404, 'Session not found');
    if (session.status === 'closed' || session.status === 'archived') {
      throw httpError(422, 'Checkout is not available for a closed or archived session');
    }
    const feeConfigured =
      session.registration_fee_amount != null && session.registration_fee_amount !== '';
    if (feeConfigured) {
      const feeAmt = Number(session.registration_fee_amount);
      if (!Number.isFinite(feeAmt) || feeAmt <= 0) {
        throw httpError(422, 'Session registration fee is misconfigured');
      }
      if (Number(amount) !== feeAmt) {
        throw httpError(422, `amount must equal session registration fee (${feeAmt})`);
      }
      const cur = (session.registration_fee_currency || 'NGN').toString().toUpperCase();
      if (String(currency).toUpperCase() !== cur) {
        throw httpError(422, `currency must be ${cur}`);
      }
    }
    const pending = await paymentModel.countPendingForRegistration(registration.id);
    if (pending > 0) {
      throw httpError(409, 'An unpaid payment already exists for this registration');
    }

    // The gateways need the payer's email (paystack / flutterwave) and
    // name (flutterwave). Pull them off the student's account.
    const contact = await pool.query(
      `SELECT u.email, p.first_name, p.last_name
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1`,
      [userId]
    );
    const student = contact.rows[0] || {};
    if (processor !== 'direct_transfer' && !student.email) {
      throw httpError(422, 'A card payment requires an email on the student account');
    }

    const redirectUrl =
      (body && body.redirect_url) ||
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payments/callback`;

    // paymentProcessorService.initializePayment creates the payments row
    // itself (via paymentService.createPayment) and then initializes the
    // gateway — so we hand it the full payload rather than pre-creating.
    const processorResult = await paymentProcessorService.initializePayment(
      {
        amount,
        currency,
        type: 'other',
        payment_type: 'checkout',
        user_id: userId,
        registration_id: registration.id,
        purpose: 'JUPEB registration fee',
        email: student.email || null,
        first_name: student.first_name || null,
        redirect_url: redirectUrl,
        metadata: {
          jupeb: true,
          registration_id: registration.id,
          session_id: registration.session_id,
        },
      },
      processor
    );

    try {
      await pool.query(
        `UPDATE jupeb_registrations SET payment_projection = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [registration.id]
      );
    } catch {
      /* column may be absent before migration 009 */
    }

    return {
      payment: processorResult.payment,
      payment_method: processor,
      // paystack/flutterwave → gateway checkout URL; direct_transfer → null.
      payment_link:
        processorResult.authorization_url ||
        processorResult.paymentLink ||
        processorResult.redirect_url ||
        null,
      // direct_transfer only.
      bank_account: processorResult.bank_account || null,
    };
  }

  async listMyPayments(userId, query) {
    const safePage = Math.max(1, parseInt(query.page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    const rows = await paymentModel.findJupebByUserId(userId, { limit: safeLimit, offset });
    const total = await paymentModel.countJupebByUserId(userId);
    const enriched = rows.map((p) => ({
      ...p,
      jupeb_projection: mapPaymentStatusToJupebProjection(p.status),
    }));
    return { rows: enriched, page: safePage, limit: safeLimit, total };
  }

  async listAdminPayments(query, userId) {
    await assertFinanceRole(userId);
    const safePage = Math.max(1, parseInt(query.page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    if (query.session_id && !isUuid(query.session_id)) {
      throw httpError(422, 'session_id must be a valid UUID');
    }
    const { rows, total } = await paymentModel.findJupebLinkedWithRegistration({
      limit: safeLimit,
      offset,
      session_id: query.session_id || null,
    });
    const enriched = rows.map((p) => ({
      ...p,
      jupeb_projection: mapPaymentStatusToJupebProjection(p.status),
    }));
    return { rows: enriched, page: safePage, limit: safeLimit, total };
  }

  async getPaymentSummary(registrationId, userId) {
    await assertFinanceRole(userId);
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    const payments = await paymentModel.findByRegistrationId(registrationId, { limit: 100, offset: 0 });
    let totalPaid = 0;
    const byProjection = { unpaid: 0, pending: 0, paid: 0, payment_failed: 0 };
    for (const p of payments) {
      const proj = mapPaymentStatusToJupebProjection(p.status);
      byProjection[proj] += 1;
      if (p.status === 'completed') totalPaid += parseFloat(p.amount) || 0;
    }
    return {
      registration_id: registrationId,
      session_id: reg.session_id,
      university_id: reg.university_id,
      payment_projection: reg.payment_projection,
      payments,
      totals: {
        total_completed_amount: totalPaid,
        payment_count: payments.length,
        by_projection: byProjection,
      },
    };
  }

  async reconcile(registrationId, body, userId) {
    await assertFinanceRole(userId);
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const { payment_id, status_snapshot, captured_amount, currency, gateway_reference } = body || {};
    if (!payment_id || !isUuid(payment_id)) throw httpError(422, 'payment_id must be a valid UUID');
    if (!['pending', 'successful', 'failed', 'refunded'].includes(status_snapshot)) {
      throw httpError(422, 'status_snapshot must be pending, successful, failed, or refunded');
    }
    if (captured_amount === undefined || Number(captured_amount) < 0) {
      throw httpError(422, 'captured_amount is required and must be non-negative');
    }
    if (!currency || typeof currency !== 'string') {
      throw httpError(422, 'currency is required');
    }
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    const payment = await paymentModel.findById(payment_id);
    if (!payment) throw httpError(404, 'Payment not found');
    if (payment.registration_id !== registrationId) {
      throw httpError(422, 'Payment is not linked to this registration');
    }
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO jupeb_payment_reconciliations (
        registration_id, payment_id, status_snapshot, captured_amount, currency, gateway_reference, reconciled_by, reconciled_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        registrationId,
        payment_id,
        status_snapshot,
        captured_amount,
        String(currency).trim().toUpperCase().slice(0, 10),
        gateway_reference ? String(gateway_reference).slice(0, 120) : null,
        userId,
        now,
      ]
    );
    return result.rows[0];
  }

  async sessionReport(sessionId, userId) {
    await assertFinanceRole(userId);
    if (!isUuid(sessionId)) throw httpError(422, 'Invalid session id');
    const session = await sessionModel.findById(sessionId);
    if (!session) throw httpError(404, 'Session not found');
    const result = await pool.query(
      `WITH reg_summary AS (
         SELECT r.id,
           BOOL_OR(p.status = 'completed') AS has_completed,
           BOOL_OR(p.status IN ('pending', 'pending_transfer', 'processing')) AS has_pending
         FROM jupeb_registrations r
         LEFT JOIN payments p ON p.registration_id = r.id
         WHERE r.session_id = $1
         GROUP BY r.id
       )
       SELECT
         (SELECT COUNT(*)::int FROM jupeb_registrations WHERE session_id = $1) AS registration_count,
         (SELECT COUNT(DISTINCT p.registration_id)::int
            FROM payments p
            INNER JOIN jupeb_registrations r ON r.id = p.registration_id
            WHERE r.session_id = $1 AND p.status = 'completed') AS registrations_with_completed_payment,
         COALESCE((
           SELECT SUM(p.amount)::numeric
           FROM payments p
           INNER JOIN jupeb_registrations r ON r.id = p.registration_id
           WHERE r.session_id = $1 AND p.status = 'completed'
         ), 0) AS total_completed_amount,
         COALESCE((
           SELECT COUNT(*)::int
           FROM payments p
           INNER JOIN jupeb_registrations r ON r.id = p.registration_id
           WHERE r.session_id = $1 AND p.status IN ('pending', 'pending_transfer', 'processing')
         ), 0) AS pending_payment_count,
         COALESCE((SELECT COUNT(*)::int FROM reg_summary WHERE has_completed AND has_pending), 0) AS partial_payment_registration_count`,
      [sessionId]
    );
    const row = result.rows[0];
    return {
      session_id: sessionId,
      academic_year: session.academic_year,
      registration_count: row.registration_count,
      registrations_with_completed_payment: row.registrations_with_completed_payment,
      unpaid_registration_count: Math.max(
        0,
        row.registration_count - row.registrations_with_completed_payment
      ),
      total_completed_amount: parseFloat(row.total_completed_amount) || 0,
      pending_payment_count: row.pending_payment_count,
      partial_payment_registration_count: row.partial_payment_registration_count,
    };
  }

  /**
   * Per-institution fee rows for a session. One row per institution that
   * has registrations in the session, carrying:
   *   - the projected side (session fee config × candidate count)
   *   - the collected side (actual `payments` rows, status = completed)
   *
   * Affiliation rate: an institution pays `affiliation_fee_new` for the
   * FIRST session it ever has registrations in (earliest `opens_at`),
   * `affiliation_fee_existing` for every later session — `is_new_affiliate`
   * captures that. The `payments` table doesn't tag a payment as
   * affiliation-vs-exam, so `collected` is a single total, not split.
   *
   * Shared by examFeeByInstitution + institutionFeeRecords.
   */
  async _institutionFeeRows(sessionId) {
    const r = await pool.query(
      `WITH sess AS (
         SELECT id, opens_at,
                COALESCE(affiliation_fee_existing, 0)::numeric AS aff_existing,
                COALESCE(affiliation_fee_new, 0)::numeric      AS aff_new,
                COALESCE(exam_fee_per_candidate, 0)::numeric   AS exam_per
         FROM jupeb_registration_sessions WHERE id = $1
       ),
       inst AS (
         SELECT r.university_id,
                COUNT(*) FILTER (WHERE r.status <> 'withdrawn')::int AS number_of_candidates
         FROM jupeb_registrations r
         WHERE r.session_id = $1
         GROUP BY r.university_id
       )
       SELECT
         u.id   AS institution_id,
         u.name AS institution_name,
         u.code AS institution_code,
         inst.number_of_candidates,
         NOT EXISTS (
           SELECT 1 FROM jupeb_registrations r2
           JOIN jupeb_registration_sessions s2 ON s2.id = r2.session_id
           WHERE r2.university_id = u.id AND s2.opens_at < sess.opens_at
         ) AS is_new_affiliate,
         sess.aff_existing, sess.aff_new, sess.exam_per,
         COALESCE(coll.collected_total, 0)::numeric AS collected_total,
         COALESCE(coll.collected_count, 0)::int     AS collected_count,
         COALESCE(coll.pending_total, 0)::numeric   AS pending_total
       FROM inst
       JOIN jupeb_universities u ON u.id = inst.university_id
       CROSS JOIN sess
       LEFT JOIN LATERAL (
         SELECT
           SUM(p.amount) FILTER (WHERE p.status = 'completed')        AS collected_total,
           COUNT(*)      FILTER (WHERE p.status = 'completed')        AS collected_count,
           SUM(p.amount) FILTER (
             WHERE p.status IN ('pending', 'pending_transfer', 'processing', 'pending_verification')
           )                                                          AS pending_total
         FROM payments p
         JOIN jupeb_registrations r3 ON r3.id = p.registration_id
         WHERE r3.session_id = sess.id AND r3.university_id = u.id
       ) coll ON true
       ORDER BY u.name ASC`,
      [sessionId]
    );
    return r.rows.map((row) => {
      const affiliationFee = row.is_new_affiliate
        ? Number(row.aff_new)
        : Number(row.aff_existing);
      const examFee = Number(row.exam_per) * row.number_of_candidates;
      const projectedTotal = affiliationFee + examFee;
      const collectedTotal = Number(row.collected_total) || 0;
      return {
        institution_id: row.institution_id,
        institution_name: row.institution_name,
        institution_code: row.institution_code,
        number_of_candidates: row.number_of_candidates,
        is_new_affiliate: row.is_new_affiliate,
        projected: {
          affiliation_fee: affiliationFee,
          exam_fee: examFee,
          total: projectedTotal,
        },
        collected: {
          total: collectedTotal,
          payment_count: row.collected_count,
        },
        pending: { total: Number(row.pending_total) || 0 },
        outstanding: projectedTotal - collectedTotal,
      };
    });
  }

  /**
   * Exam-fee-by-institution chart: projected exam fee per institution
   * (`exam_fee_per_candidate × candidates`) for plotting fee against
   * institutions, with collected total alongside. Ordered by projected
   * exam fee, biggest first.
   */
  async examFeeByInstitution(query, userId) {
    await assertFinanceRole(userId);
    const sessionId = query.session_id;
    if (!sessionId || !isUuid(sessionId)) {
      throw httpError(422, 'session_id is required and must be a valid UUID');
    }
    const session = await sessionModel.findById(sessionId);
    if (!session) throw httpError(404, 'Session not found');

    const rows = await this._institutionFeeRows(sessionId);
    const institutions = rows
      .map((row) => ({
        institution_id: row.institution_id,
        institution_name: row.institution_name,
        institution_code: row.institution_code,
        number_of_candidates: row.number_of_candidates,
        exam_fee: row.projected.exam_fee,
        collected: row.collected.total,
      }))
      .sort((a, b) => b.exam_fee - a.exam_fee);

    return {
      session_id: sessionId,
      academic_year: session.academic_year,
      exam_fee_per_candidate: Number(session.exam_fee_per_candidate) || 0,
      total_projected_exam_fee: institutions.reduce((s, i) => s + i.exam_fee, 0),
      institutions,
    };
  }

  /**
   * Paginated list of per-institution fee records — projected (affiliation
   * + exam) and collected side by side. `q` filters by institution name
   * or code (case-insensitive substring).
   */
  async institutionFeeRecords(query, userId) {
    await assertFinanceRole(userId);
    const sessionId = query.session_id;
    if (!sessionId || !isUuid(sessionId)) {
      throw httpError(422, 'session_id is required and must be a valid UUID');
    }
    const session = await sessionModel.findById(sessionId);
    if (!session) throw httpError(404, 'Session not found');

    const safePage = Math.max(1, parseInt(query.page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));

    let rows = await this._institutionFeeRows(sessionId);
    const q = query.q ? String(query.q).trim().toLowerCase() : '';
    if (q) {
      rows = rows.filter(
        (row) =>
          row.institution_name.toLowerCase().includes(q) ||
          (row.institution_code || '').toLowerCase().includes(q)
      );
    }
    const total = rows.length;
    const offset = (safePage - 1) * safeLimit;
    return {
      rows: rows.slice(offset, offset + safeLimit),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  /**
   * Payment trends: monthly collected payment totals (status=completed)
   * for JUPEB-linked payments. Current + previous calendar year, Jan–Dec,
   * bucketed by `paid_at` (falling back to `created_at`). `session_id`
   * optionally scopes to one session's registrations.
   */
  async paymentTrends(query, userId) {
    await assertFinanceRole(userId);
    const sessionId = query.session_id || null;
    if (sessionId && !isUuid(sessionId)) {
      throw httpError(422, 'session_id must be a valid UUID');
    }
    const y = parseInt(query.year, 10);
    const targetYear = Number.isFinite(y) ? y : new Date().getUTCFullYear();
    const previousYear = targetYear - 1;

    const monthlyForYear = async (yy) => {
      const params = [yy];
      let join = '';
      let where = `p.status = 'completed' AND p.registration_id IS NOT NULL
                   AND EXTRACT(YEAR FROM COALESCE(p.paid_at, p.created_at)) = $1`;
      if (sessionId) {
        join = 'JOIN jupeb_registrations r ON r.id = p.registration_id';
        params.push(sessionId);
        where += ` AND r.session_id = $${params.length}`;
      }
      const r = await pool.query(
        `SELECT EXTRACT(MONTH FROM COALESCE(p.paid_at, p.created_at))::int AS m,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(p.amount), 0)::numeric AS amt
         FROM payments p
         ${join}
         WHERE ${where}
         GROUP BY 1`,
        params
      );
      const map = new Map(r.rows.map((row) => [row.m, row]));
      return Array.from({ length: 12 }, (_, idx) => {
        const hit = map.get(idx + 1);
        return {
          month: idx + 1,
          amount: hit ? Number(hit.amt) : 0,
          count: hit ? hit.cnt : 0,
        };
      });
    };

    return {
      year: targetYear,
      session_id: sessionId,
      series: [
        { key: 'current', year: targetYear, points: await monthlyForYear(targetYear) },
        { key: 'previous', year: previousYear, points: await monthlyForYear(previousYear) },
      ],
    };
  }
}

module.exports = new FinanceService();
