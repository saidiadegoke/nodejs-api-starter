const pool = require('../../../db/pool');
const registrationModel = require('../models/registration.model');
const sessionModel = require('../models/session.model');
const paymentModel = require('../../payments/models/payment.model');
const paymentService = require('../../payments/services/payment.service');
const { mapPaymentStatusToJupebProjection } = require('../utils/finance-projection');
const { getUserRoles } = require('../../../shared/middleware/rbac.middleware');

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

  async createCheckout(userId, body) {
    const amount = body && body.amount !== undefined ? Number(body.amount) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw httpError(422, 'amount must be a positive number');
    }
    const currency = (body && body.currency) || 'NGN';
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
    const metadata = {
      jupeb: true,
      registration_id: registration.id,
      session_id: registration.session_id,
    };
    const created = await paymentService.createPayment({
      amount,
      currency,
      type: 'other',
      payment_type: 'checkout',
      user_id: userId,
      registration_id: registration.id,
      purpose: 'JUPEB registration fee',
      metadata,
      payment_method: body.payment_method || undefined,
    });
    try {
      await pool.query(
        `UPDATE jupeb_registrations SET payment_projection = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [registration.id]
      );
    } catch {
      /* column may be absent before migration 009 */
    }
    return created;
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
}

module.exports = new FinanceService();
