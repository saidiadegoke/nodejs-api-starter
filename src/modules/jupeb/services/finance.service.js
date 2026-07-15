const pool = require('../../../db/pool');
const registrationModel = require('../models/registration.model');
const sessionModel = require('../models/session.model');
const paymentModel = require('../../payments/models/payment.model');
const { formatPendingPaymentSummary } = paymentModel;
const paymentMethodModel = require('../../payments/models/paymentMethod.model');
const paymentItemModel = require('../../payments/models/paymentItem.model');
const paymentStructureModel = require('../../payments/models/paymentStructure.model');
const paymentProcessorService = require('../../payments/services/paymentProcessor.service');
const { mapPaymentStatusToJupebProjection } = require('../utils/finance-projection');
const {
  assertInstitutionFinanceAccess,
  assertInstitutionUniversityAccess,
  effectiveInstitutionListUniversityId,
} = require('../utils/institution-scope');
const registrationKpi = require('./registration-kpi.service');
const sessionContext = require('./session-context.service');
const universityModel = require('../models/university.model');
const { hasPermission } = require('../../../shared/middleware/rbac.middleware');

const PAYMENT_METHOD_GROUP_UI = {
  bank_transfer: { label: 'Bank Transfer', subtitle: 'Transfer to JUPEB account' },
  online: { label: 'Online Payment', subtitle: 'Pay with Card or USSD' },
  pay_at_bank: { label: 'Pay at Bank', subtitle: 'Generate payment Teller' },
};

const SUPPORTED_PROCESSORS = ['paystack', 'flutterwave', 'remita', 'direct_transfer'];

function httpError(status, message, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

async function assertFinanceRole(userId) {
  const ok = await hasPermission(userId, 'jupeb.finance.manage');
  if (!ok) {
    throw httpError(
      403,
      'Access denied. Required permission(s): jupeb.finance.manage',
      { required_permissions: ['jupeb.finance.manage'] }
    );
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
   * Resolve the full fee for a payment item against a registration's
   * session. `affiliation` picks the new-affiliate rate for the
   * institution's first session and the existing rate afterwards.
   */
  async _resolveItemFullFee(item, registration, session) {
    if (item.fee_source === 'fixed') {
      return Number(item.fixed_amount) || 0;
    }
    if (item.fee_source === 'examination') {
      return Number(session.exam_fee_per_candidate) || 0;
    }
    if (item.fee_source === 'affiliation') {
      const r = await pool.query(
        `SELECT NOT EXISTS (
           SELECT 1 FROM jupeb_registrations r2
           JOIN jupeb_registration_sessions s2 ON s2.id = r2.session_id
           WHERE r2.university_id = $1 AND s2.opens_at < $2
         ) AS is_new`,
        [registration.university_id, session.opens_at]
      );
      const isNew = r.rows[0] && r.rows[0].is_new;
      return Number(isNew ? session.affiliation_fee_new : session.affiliation_fee_existing) || 0;
    }
    return 0;
  }

  /** Sum of completed payments for one item on one registration. */
  async _completedForItem(registrationId, paymentItemId) {
    const r = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM payments
       WHERE registration_id = $1 AND payment_item_id = $2 AND status = 'completed'`,
      [registrationId, paymentItemId]
    );
    return Number(r.rows[0].total) || 0;
  }

  /**
   * Start a JUPEB checkout. Resolves the chosen payment item + structure,
   * computes the outstanding balance, validates the amount, then hands
   * off to paymentProcessorService so the chosen method initializes:
   *   - paystack / flutterwave / remita → returns a gateway `payment_link`
   *   - direct_transfer                 → returns `bank_account` + emails instructions
   *
   * Body: {
   *   payment_method,                 // paystack | flutterwave | remita | direct_transfer
   *   payment_item_id | payment_item, // catalog id or code
   *   payment_structure_id | payment_structure,
   *   amount,                         // required for partial; for full it must equal the balance
   *   currency?, registration_id?, description?, redirect_url?
   * }
   */
  async createCheckout(userId, body) {
    const requestedAmount = body && body.amount !== undefined ? Number(body.amount) : NaN;
    const currency = (body && body.currency) || 'NGN';

    const processor = body && body.payment_method;
    if (!processor || !SUPPORTED_PROCESSORS.includes(processor)) {
      throw httpError(
        422,
        `payment_method is required and must be one of: ${SUPPORTED_PROCESSORS.join(', ')}`
      );
    }

    // What is being paid for.
    const itemRef = body && (body.payment_item_id || body.payment_item);
    if (!itemRef) throw httpError(422, 'payment_item_id (or payment_item code) is required');
    const item = isUuid(itemRef)
      ? await paymentItemModel.findById(itemRef)
      : await paymentItemModel.findByCode(itemRef);
    if (!item || !item.is_active) throw httpError(404, 'Payment item not found or inactive');

    // How they're paying (full / partial).
    const structureRef = body && (body.payment_structure_id || body.payment_structure);
    if (!structureRef) {
      throw httpError(422, 'payment_structure_id (or payment_structure code) is required');
    }
    const structure = isUuid(structureRef)
      ? await paymentStructureModel.findById(structureRef)
      : await paymentStructureModel.findByCode(structureRef);
    if (!structure || !structure.is_active) {
      throw httpError(404, 'Payment structure not found or inactive');
    }

    const registration = await this.resolveRegistrationForCheckout(userId, body.registration_id || null);
    const session = await sessionModel.findById(registration.session_id);
    if (!session) throw httpError(404, 'Session not found');
    if (session.status === 'closed') {
      throw httpError(422, 'Checkout is not available for a closed session');
    }

    // Full fee for this item, minus what's already been paid → outstanding.
    const fullFee = await this._resolveItemFullFee(item, registration, session);
    if (!(fullFee > 0)) {
      throw httpError(422, `No "${item.name}" fee is configured for this session`);
    }
    const alreadyPaid = await this._completedForItem(registration.id, item.id);
    const outstanding = Number((fullFee - alreadyPaid).toFixed(2));
    if (outstanding <= 0) {
      throw httpError(409, `"${item.name}" is already fully paid for this registration`);
    }

    // Amount rule: partial → any amount up to the balance; full → the balance.
    let amount;
    if (structure.allows_partial) {
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        throw httpError(422, 'amount must be a positive number for a partial payment');
      }
      if (Number(requestedAmount.toFixed(2)) > outstanding) {
        throw httpError(422, `amount may not exceed the outstanding balance (${outstanding})`);
      }
      amount = Number(requestedAmount.toFixed(2));
    } else {
      if (Number.isFinite(requestedAmount) && Number(requestedAmount.toFixed(2)) !== outstanding) {
        throw httpError(422, `Full payment amount must equal the outstanding balance (${outstanding})`);
      }
      amount = outstanding;
    }

    const pending = await paymentModel.countPendingForRegistration(registration.id, item.id);
    if (pending > 0) {
      const pendingRow = await paymentModel.findLatestPendingForRegistration(registration.id, item.id);
      throw httpError(409, 'An unpaid payment already exists for this registration', {
        error_code: 'pending_payment_exists',
        pending_payment: formatPendingPaymentSummary(pendingRow, item),
      });
    }

    // The gateways need the payer's email (paystack / flutterwave / remita)
    // and name. Pull them off the student's account.
    const contact = await pool.query(
      `SELECT u.email, p.first_name, p.last_name
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1`,
      [userId]
    );
    const student = contact.rows[0] || {};
    if (processor !== 'direct_transfer' && !student.email) {
      throw httpError(422, 'A card / online payment requires an email on the student account');
    }

    const redirectUrl =
      (body && body.redirect_url) ||
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payments/callback`;
    const description =
      (body && body.description && String(body.description).trim()) || item.name;

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
        payment_item_id: item.id,
        payment_structure_id: structure.id,
        purpose: description,
        email: student.email || null,
        first_name: student.first_name || null,
        redirect_url: redirectUrl,
        metadata: {
          jupeb: true,
          registration_id: registration.id,
          session_id: registration.session_id,
          payment_item_code: item.code,
          payment_structure_code: structure.code,
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
      payment_item: { id: item.id, code: item.code, name: item.name },
      payment_structure: { id: structure.id, code: structure.code, name: structure.name },
      amount,
      full_fee: fullFee,
      outstanding_before: outstanding,
      outstanding_after: Number((outstanding - amount).toFixed(2)),
      // paystack/flutterwave/remita → gateway checkout URL; direct_transfer → null.
      payment_link:
        processorResult.authorization_url ||
        processorResult.paymentLink ||
        processorResult.redirect_url ||
        null,
      // direct_transfer only.
      bank_account: processorResult.bank_account || null,
    };
  }

  /**
   * Payment methods to show at checkout — only those an admin has
   * configured and activated (gateways must have credentials). Each
   * method is tagged with a `group` so the UI can render the three
   * "Make Payment" cards (Bank Transfer / Online Payment / Pay at Bank)
   * without hard-coding a code→card mapping. No secrets are exposed.
   */
  async listPaymentMethods() {
    const rows = await paymentMethodModel.getAvailableForCheckout();
    const groupFor = (code) => {
      if (code === 'direct_transfer') return 'bank_transfer';
      if (code === 'remita') return 'pay_at_bank';
      return 'online'; // paystack, flutterwave, …
    };
    return rows.map((m) => {
      const group = groupFor(m.code);
      return {
        ...m,
        group,
        ...(PAYMENT_METHOD_GROUP_UI[group] || {}),
      };
    });
  }

  async _resolveInstitutionFinanceScope(query, userId, { useViewingContext = true } = {}) {
    await assertInstitutionFinanceAccess(userId);
    const { session_id, university_id } = query || {};
    if (university_id && !isUuid(university_id)) {
      throw httpError(422, 'university_id must be a valid UUID');
    }
    if (session_id && !isUuid(session_id)) {
      throw httpError(422, 'session_id must be a valid UUID');
    }
    const scopedUniversityId = await effectiveInstitutionListUniversityId(
      userId,
      university_id || null
    );
    if (!scopedUniversityId) {
      throw httpError(422, 'university_id is required');
    }
    const sessionMeta = useViewingContext
      ? await sessionContext.resolveEffectiveSession(userId, session_id || null)
      : await registrationKpi.resolveRegistrationSession(session_id || null);
    if (!sessionMeta) throw httpError(404, 'No registration session found');
    const session = await sessionModel.findById(sessionMeta.id);
    if (!session) throw httpError(404, 'Session not found');
    return { universityId: scopedUniversityId, session };
  }

  /**
   * Foundation finance callers must pass university_id explicitly.
   */
  async _resolveFoundationInstitutionScope(query, userId) {
    await assertFinanceRole(userId);
    const { session_id, university_id } = query || {};
    if (!university_id || !isUuid(university_id)) {
      throw httpError(422, 'university_id is required and must be a valid UUID');
    }
    if (session_id && !isUuid(session_id)) {
      throw httpError(422, 'session_id must be a valid UUID');
    }
    const uni = await universityModel.findById(university_id);
    if (!uni) throw httpError(404, 'Institution not found');
    const sessionMeta = await sessionContext.resolveEffectiveSession(userId, session_id || null);
    if (!sessionMeta) throw httpError(404, 'No registration session found');
    const session = await sessionModel.findById(sessionMeta.id);
    if (!session) throw httpError(404, 'Session not found');
    return { universityId: university_id, session, university: uni };
  }

  async _institutionOverviewPayload(universityId, session) {
    const current = await this._resolveInstitutionFeeRow(universityId, session.id);
    if (!current) throw httpError(404, 'Institution not found');

    const previousSession = await registrationKpi.findPreviousRegistrationSession(session);
    const prev = previousSession
      ? await this._resolveInstitutionFeeRow(universityId, previousSession.id)
      : null;

    return {
      session_id: session.id,
      university_id: universityId,
      number_of_candidates: this._growthCard(
        current.number_of_candidates,
        prev?.number_of_candidates
      ),
      total_expected_affiliation_fee: this._growthCard(
        current.projected.affiliation_fee,
        prev?.projected.affiliation_fee
      ),
      total_expected_examination_fee: this._growthCard(
        current.projected.exam_fee,
        prev?.projected.exam_fee
      ),
      total_amount_paid: this._growthCard(current.collected.total, prev?.collected.total),
      compared_to: previousSession
        ? { session_id: previousSession.id, label: previousSession.academic_year }
        : null,
    };
  }

  async _institutionFeesPayload(universityId, session, itemRef) {
    if (!itemRef) throw httpError(422, 'payment_item is required');

    const item = isUuid(itemRef)
      ? await paymentItemModel.findById(itemRef)
      : await paymentItemModel.findByCode(itemRef);
    if (!item || !item.is_active) throw httpError(404, 'Payment item not found or inactive');

    const current = await this._resolveInstitutionFeeRow(universityId, session.id);
    if (!current) throw httpError(404, 'Institution not found');

    const previousSession = await registrationKpi.findPreviousRegistrationSession(session);
    const prev = previousSession
      ? await this._resolveInstitutionFeeRow(universityId, previousSession.id)
      : null;

    const isAffiliation = item.fee_source === 'affiliation' || item.code === 'affiliation_fee';
    const expectedKey = isAffiliation ? 'affiliation_fee' : 'exam_fee';
    const collectedKey = isAffiliation ? 'affiliation_fee' : 'examination_fee';
    const outstandingKey = isAffiliation ? 'affiliation_fee' : 'examination_fee';

    const expected = current.projected[expectedKey];
    const paid = current.collected[collectedKey];
    const outstanding = current.outstanding_by_fee[outstandingKey];
    const prevExpected = prev?.projected[expectedKey];
    const prevPaid = prev?.collected[collectedKey];
    const prevOutstanding = prev?.outstanding_by_fee?.[outstandingKey];

    return {
      session_id: session.id,
      university_id: universityId,
      payment_item: { id: item.id, code: item.code, name: item.name },
      total_payment_count: this._growthCard(current.collected.payment_count, prev?.collected.payment_count),
      total_expected: this._growthCard(expected, prevExpected),
      paid: this._growthCard(paid, prevPaid),
      outstanding: this._growthCard(outstanding, prevOutstanding),
      // UI aliases for Session History / institution fee tabs.
      total_expected_payment: this._growthCard(expected, prevExpected),
      fee_paid: this._growthCard(paid, prevPaid),
      outstanding_fees: this._growthCard(outstanding, prevOutstanding),
      compared_to: previousSession
        ? { session_id: previousSession.id, label: previousSession.academic_year }
        : null,
    };
  }

  async _resolveInstitutionItemFullFee(item, universityId, session) {
    if (item.fee_source === 'fixed') {
      return Number(item.fixed_amount) || 0;
    }
    if (item.fee_source === 'examination') {
      const r = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE status <> 'withdrawn')::int AS c
         FROM jupeb_registrations WHERE university_id = $1 AND session_id = $2`,
        [universityId, session.id]
      );
      return (Number(session.exam_fee_per_candidate) || 0) * (r.rows[0]?.c || 0);
    }
    if (item.fee_source === 'affiliation') {
      const r = await pool.query(
        `SELECT NOT EXISTS (
           SELECT 1 FROM jupeb_registrations r2
           JOIN jupeb_registration_sessions s2 ON s2.id = r2.session_id
           WHERE r2.university_id = $1 AND s2.opens_at < $2
         ) AS is_new`,
        [universityId, session.opens_at]
      );
      const isNew = r.rows[0] && r.rows[0].is_new;
      return Number(isNew ? session.affiliation_fee_new : session.affiliation_fee_existing) || 0;
    }
    return 0;
  }

  async _completedForInstitutionItem(universityId, sessionId, paymentItemId) {
    const r = await pool.query(
      `SELECT COALESCE(SUM(p.amount), 0)::numeric AS total
       FROM payments p
       LEFT JOIN jupeb_registrations reg ON reg.id = p.registration_id
       WHERE p.payment_item_id = $3 AND p.status = 'completed'
         AND (
           (p.jupeb_university_id = $1 AND p.jupeb_session_id = $2)
           OR (reg.university_id = $1 AND reg.session_id = $2)
         )`,
      [universityId, sessionId, paymentItemId]
    );
    return Number(r.rows[0].total) || 0;
  }

  _mapInstitutionFeeRow(row) {
    const affiliationFee = row.is_new_affiliate
      ? Number(row.aff_new)
      : Number(row.aff_existing);
    const examFee = Number(row.exam_per) * row.number_of_candidates;
    const projectedTotal = affiliationFee + examFee;
    const collectedAffiliation = Number(row.collected_affiliation) || 0;
    const collectedExamination = Number(row.collected_examination) || 0;
    const collectedTotal = Number(row.collected_total) || 0;
    return {
      institution_id: row.institution_id,
      institution_name: row.institution_name,
      institution_code: row.institution_code,
      jupeb_prefix: row.jupeb_prefix || null,
      email: row.email || null,
      status: row.status || null,
      number_of_candidates: row.number_of_candidates,
      is_new_affiliate: row.is_new_affiliate,
      projected: {
        affiliation_fee: affiliationFee,
        exam_fee: examFee,
        total: projectedTotal,
      },
      collected: {
        affiliation_fee: collectedAffiliation,
        examination_fee: collectedExamination,
        total: collectedTotal,
        payment_count: row.collected_count,
      },
      pending: { total: Number(row.pending_total) || 0 },
      outstanding: projectedTotal - collectedTotal,
      outstanding_by_fee: {
        affiliation_fee: affiliationFee - collectedAffiliation,
        examination_fee: examFee - collectedExamination,
      },
    };
  }

  async _resolveInstitutionFeeRow(universityId, sessionId) {
    const rows = await this._institutionFeeRows(sessionId);
    const hit = rows.find((r) => String(r.institution_id) === String(universityId));
    if (hit) return hit;

    const session = await sessionModel.findById(sessionId);
    const uni = await universityModel.findById(universityId);
    if (!session || !uni) return null;

    const isNewR = await pool.query(
      `SELECT NOT EXISTS (
         SELECT 1 FROM jupeb_registrations r2
         JOIN jupeb_registration_sessions s2 ON s2.id = r2.session_id
         WHERE r2.university_id = $1 AND s2.opens_at < $2
       ) AS is_new`,
      [universityId, session.opens_at]
    );
    const isNewAffiliate = isNewR.rows[0]?.is_new;
    const affiliationFee = Number(
      isNewAffiliate ? session.affiliation_fee_new : session.affiliation_fee_existing
    ) || 0;
    return {
      institution_id: uni.id,
      institution_name: uni.name,
      institution_code: uni.code,
      number_of_candidates: 0,
      is_new_affiliate: isNewAffiliate,
      projected: { affiliation_fee: affiliationFee, exam_fee: 0, total: affiliationFee },
      collected: {
        affiliation_fee: 0,
        examination_fee: 0,
        total: 0,
        payment_count: 0,
      },
      pending: { total: 0 },
      outstanding: affiliationFee,
      outstanding_by_fee: {
        affiliation_fee: affiliationFee,
        examination_fee: 0,
      },
    };
  }

  _growthCard(curVal, prevVal) {
    return {
      value: curVal,
      delta_pct: prevVal !== null && prevVal !== undefined
        ? registrationKpi.deltaPct(curVal, prevVal)
        : null,
      trend: prevVal !== null && prevVal !== undefined
        ? registrationKpi.growthTrend(curVal, prevVal)
        : null,
    };
  }

  async institutionOverview(query, userId) {
    const { universityId, session } = await this._resolveInstitutionFinanceScope(query, userId);
    return this._institutionOverviewPayload(universityId, session);
  }

  async institutionFees(query, userId) {
    const { universityId, session } = await this._resolveInstitutionFinanceScope(query, userId);
    const itemRef = query.payment_item || query.payment_item_id;
    return this._institutionFeesPayload(universityId, session, itemRef);
  }

  async institutionFeePreview(query, userId) {
    const { universityId, session } = await this._resolveInstitutionFinanceScope(query, userId);
    const itemRef = query.payment_item || query.payment_item_id;
    if (!itemRef) throw httpError(422, 'payment_item is required');

    const item = isUuid(itemRef)
      ? await paymentItemModel.findById(itemRef)
      : await paymentItemModel.findByCode(itemRef);
    if (!item || !item.is_active) throw httpError(404, 'Payment item not found or inactive');

    const fullFee = await this._resolveInstitutionItemFullFee(item, universityId, session);
    const alreadyPaid = await this._completedForInstitutionItem(universityId, session.id, item.id);
    const outstanding = Number((fullFee - alreadyPaid).toFixed(2));
    const pendingRow = await paymentModel.findLatestPendingForInstitution(
      universityId,
      session.id,
      item.id
    );

    return {
      session_id: session.id,
      university_id: universityId,
      currency: session.registration_fee_currency || 'NGN',
      payment_item: { id: item.id, code: item.code, name: item.name },
      full_fee: fullFee,
      already_paid: alreadyPaid,
      outstanding: outstanding > 0 ? outstanding : 0,
      fully_paid: outstanding <= 0,
      pending_payment: formatPendingPaymentSummary(pendingRow, item),
    };
  }

  async createInstitutionCheckout(userId, body) {
    const scopeQuery = {
      session_id: body && body.session_id,
      university_id: body && body.university_id,
    };
    const { universityId, session } = await this._resolveInstitutionFinanceScope(scopeQuery, userId, {
      useViewingContext: false,
    });

    if (session.status === 'closed') {
      throw httpError(422, 'Checkout is not available for a closed session');
    }

    const requestedAmount = body && body.amount !== undefined ? Number(body.amount) : NaN;
    const currency = (body && body.currency) || 'NGN';
    const processor = body && body.payment_method;
    if (!processor || !SUPPORTED_PROCESSORS.includes(processor)) {
      throw httpError(
        422,
        `payment_method is required and must be one of: ${SUPPORTED_PROCESSORS.join(', ')}`
      );
    }

    const itemRef = body && (body.payment_item_id || body.payment_item);
    if (!itemRef) throw httpError(422, 'payment_item_id (or payment_item code) is required');
    const item = isUuid(itemRef)
      ? await paymentItemModel.findById(itemRef)
      : await paymentItemModel.findByCode(itemRef);
    if (!item || !item.is_active) throw httpError(404, 'Payment item not found or inactive');

    const structureRef = body && (body.payment_structure_id || body.payment_structure);
    if (!structureRef) {
      throw httpError(422, 'payment_structure_id (or payment_structure code) is required');
    }
    const structure = isUuid(structureRef)
      ? await paymentStructureModel.findById(structureRef)
      : await paymentStructureModel.findByCode(structureRef);
    if (!structure || !structure.is_active) {
      throw httpError(404, 'Payment structure not found or inactive');
    }

    const fullFee = await this._resolveInstitutionItemFullFee(item, universityId, session);
    if (!(fullFee > 0)) {
      throw httpError(422, `No "${item.name}" fee is configured for this session`);
    }
    const alreadyPaid = await this._completedForInstitutionItem(universityId, session.id, item.id);
    const outstanding = Number((fullFee - alreadyPaid).toFixed(2));
    if (outstanding <= 0) {
      throw httpError(409, `"${item.name}" is already fully paid for this institution`);
    }

    let amount;
    if (structure.allows_partial) {
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        throw httpError(422, 'amount must be a positive number for a partial payment');
      }
      if (Number(requestedAmount.toFixed(2)) > outstanding) {
        throw httpError(422, `amount may not exceed the outstanding balance (${outstanding})`);
      }
      amount = Number(requestedAmount.toFixed(2));
    } else {
      if (Number.isFinite(requestedAmount) && Number(requestedAmount.toFixed(2)) !== outstanding) {
        throw httpError(422, `Full payment amount must equal the outstanding balance (${outstanding})`);
      }
      amount = outstanding;
    }

    const pending = await paymentModel.countPendingForInstitution(
      universityId,
      session.id,
      item.id
    );
    if (pending > 0) {
      const pendingRow = await paymentModel.findLatestPendingForInstitution(
        universityId,
        session.id,
        item.id
      );
      throw httpError(409, 'An unpaid payment already exists for this fee type', {
        error_code: 'pending_payment_exists',
        pending_payment: formatPendingPaymentSummary(pendingRow, item),
      });
    }

    const rawDescription = body && body.description ? String(body.description).trim() : '';
    if (rawDescription.length > 250) {
      throw httpError(422, 'description must be at most 250 characters');
    }
    const description = rawDescription || item.name;

    const contact = await pool.query(
      `SELECT u.email, p.first_name, p.last_name
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1`,
      [userId]
    );
    const payer = contact.rows[0] || {};
    if (processor !== 'direct_transfer' && !payer.email) {
      throw httpError(422, 'A card / online payment requires an email on the payer account');
    }

    const redirectUrl =
      (body && body.redirect_url) ||
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payments/callback`;

    const processorResult = await paymentProcessorService.initializePayment(
      {
        amount,
        currency,
        type: 'other',
        payment_type: 'checkout',
        user_id: userId,
        jupeb_university_id: universityId,
        jupeb_session_id: session.id,
        payment_item_id: item.id,
        payment_structure_id: structure.id,
        purpose: description,
        email: payer.email || null,
        first_name: payer.first_name || null,
        redirect_url: redirectUrl,
        metadata: {
          jupeb: true,
          jupeb_institution: true,
          university_id: universityId,
          session_id: session.id,
          payment_item_code: item.code,
          payment_structure_code: structure.code,
        },
      },
      processor
    );

    return {
      payment: processorResult.payment,
      payment_method: processor,
      payment_item: { id: item.id, code: item.code, name: item.name },
      payment_structure: { id: structure.id, code: structure.code, name: structure.name },
      amount,
      full_fee: fullFee,
      outstanding_before: outstanding,
      outstanding_after: Number((outstanding - amount).toFixed(2)),
      payment_link:
        processorResult.authorization_url ||
        processorResult.paymentLink ||
        processorResult.redirect_url ||
        null,
      bank_account: processorResult.bank_account || null,
    };
  }

  /**
   * Cancel a stale institution-scoped pending checkout so a new one can be started.
   */
  async cancelInstitutionPayment(paymentId, userId) {
    await assertInstitutionFinanceAccess(userId);
    if (!isUuid(paymentId)) throw httpError(422, 'payment id must be a valid UUID');

    const payment = await paymentModel.findById(paymentId);
    if (!payment) throw httpError(404, 'Payment not found');
    if (!payment.jupeb_university_id) {
      throw httpError(422, 'Only institution-scoped payments can be cancelled via this endpoint');
    }
    await assertInstitutionUniversityAccess(userId, payment.jupeb_university_id);

    const cancellable = paymentModel.PENDING_PAYMENT_STATUSES || [
      'pending',
      'pending_transfer',
      'processing',
      'pending_verification',
    ];
    if (!cancellable.includes(payment.status)) {
      throw httpError(422, `Cannot cancel a payment in status "${payment.status}"`);
    }

    const updated = await paymentModel.updateStatus(payment.id, 'failed', {
      notes: 'Cancelled by institution admin',
    });
    return {
      id: updated.id,
      payment_id: updated.payment_id,
      status: updated.status,
      amount: updated.amount,
      cancelled_at: updated.updated_at,
    };
  }

  async listInstitutionPayments(query, userId) {
    const { universityId, session } = await this._resolveInstitutionFinanceScope(query, userId);
    const safePage = Math.max(1, parseInt(query.page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;

    let paymentItemId = null;
    const itemRef = query.payment_item || query.payment_item_id;
    if (itemRef) {
      const item = isUuid(itemRef)
        ? await paymentItemModel.findById(itemRef)
        : await paymentItemModel.findByCode(itemRef);
      if (!item) throw httpError(404, 'Payment item not found');
      paymentItemId = item.id;
    }

    const { rows, total } = await paymentModel.findInstitutionPayments({
      university_id: universityId,
      session_id: session.id,
      payment_item_id: paymentItemId,
      status: query.status || null,
      q: query.q ? String(query.q).trim() : null,
      limit: safeLimit,
      offset,
    });

    const enriched = rows.map((p) => ({
      id: p.id,
      transaction_id: p.payment_id,
      payment_type: p.item_name
        ? { code: p.item_code, name: p.item_name }
        : null,
      payment_structure: p.structure_name
        ? { code: p.structure_code, name: p.structure_name }
        : null,
      description: p.purpose || null,
      payment_method: p.payment_method,
      amount: Number(p.amount),
      currency: p.currency,
      date: p.paid_at || p.created_at,
      status: p.status,
      jupeb_projection: mapPaymentStatusToJupebProjection(p.status),
    }));

    return { rows: enriched, page: safePage, limit: safeLimit, total };
  }

  async getInstitutionPaymentReceipt(paymentId, userId) {
    await assertInstitutionFinanceAccess(userId);
    const byUuid = isUuid(paymentId);
    const r = await pool.query(
      `SELECT p.payment_id, p.amount, p.currency, p.status, p.payment_method,
              p.purpose, p.created_at, p.paid_at, p.user_id,
              p.jupeb_university_id, p.jupeb_session_id,
              pi.code AS item_code, pi.name AS item_name,
              ps.code AS structure_code, ps.name AS structure_name,
              r.id AS registration_id,
              COALESCE(p.jupeb_university_id, r.university_id) AS institution_id,
              u.name AS institution_name, u.address AS institution_address,
              u.phone AS institution_phone, u.email AS institution_email
         FROM payments p
         LEFT JOIN payment_items pi ON pi.id = p.payment_item_id
         LEFT JOIN payment_structures ps ON ps.id = p.payment_structure_id
         LEFT JOIN jupeb_registrations r ON r.id = p.registration_id
         LEFT JOIN jupeb_universities u ON u.id = COALESCE(p.jupeb_university_id, r.university_id)
        WHERE ${byUuid ? 'p.id' : 'p.payment_id'} = $1
        LIMIT 1`,
      [paymentId]
    );
    const row = r.rows[0];
    if (!row) throw httpError(404, 'Payment not found');
    if (!row.institution_id) throw httpError(404, 'Payment not found');
    await assertInstitutionUniversityAccess(userId, row.institution_id);

    return {
      transaction_id: row.payment_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      jupeb_projection: mapPaymentStatusToJupebProjection(row.status),
      payment_method: row.payment_method,
      payment_item: row.item_name ? { code: row.item_code, name: row.item_name } : null,
      payment_structure: row.structure_name
        ? { code: row.structure_code, name: row.structure_name }
        : null,
      description: row.purpose || null,
      institution: {
        id: row.institution_id,
        name: row.institution_name,
        address: row.institution_address,
        phone: row.institution_phone,
        email: row.institution_email,
      },
      registration_id: row.registration_id || null,
      session_id: row.jupeb_session_id || null,
      date: row.paid_at || row.created_at,
      created_at: row.created_at,
      paid_at: row.paid_at,
    };
  }

  /**
   * Pre-checkout fee preview. For the chosen payment item (or all active
   * items when none is given), returns the full fee, what's already been
   * paid, and the outstanding balance — so the "Make Payment" screens
   * can show the amount due and validate a partial entry before commit.
   *
   * Query: { payment_item_id | payment_item?, registration_id? }
   */
  async getFeePreview(userId, query) {
    const registration = await this.resolveRegistrationForCheckout(
      userId,
      (query && query.registration_id) || null
    );
    const session = await sessionModel.findById(registration.session_id);
    if (!session) throw httpError(404, 'Session not found');

    let items;
    const itemRef = query && (query.payment_item_id || query.payment_item);
    if (itemRef) {
      const item = isUuid(itemRef)
        ? await paymentItemModel.findById(itemRef)
        : await paymentItemModel.findByCode(itemRef);
      if (!item || !item.is_active) throw httpError(404, 'Payment item not found or inactive');
      items = [item];
    } else {
      items = await paymentItemModel.listActive();
    }

    const previews = [];
    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      const fullFee = await this._resolveItemFullFee(item, registration, session);
      // eslint-disable-next-line no-await-in-loop
      const alreadyPaid = await this._completedForItem(registration.id, item.id);
      const outstanding = Number((fullFee - alreadyPaid).toFixed(2));
      // eslint-disable-next-line no-await-in-loop
      const pendingRow = await paymentModel.findLatestPendingForRegistration(registration.id, item.id);
      previews.push({
        payment_item: { id: item.id, code: item.code, name: item.name },
        full_fee: fullFee,
        already_paid: alreadyPaid,
        outstanding: outstanding > 0 ? outstanding : 0,
        fully_paid: outstanding <= 0,
        pending_payment: formatPendingPaymentSummary(pendingRow, item),
      });
    }

    return {
      registration_id: registration.id,
      session_id: session.id,
      currency: session.registration_fee_currency || 'NGN',
      items: previews,
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

  /**
   * Transaction receipt composite for one payment — powers the figma
   * "Transaction Receipt" screen. Resolves the payment item, structure,
   * payment method and the institution (name / address / phone) behind
   * the registration. `paymentId` accepts the UUID or the `PAY_…` ref.
   * Owner-scoped: a student can only read their own payment.
   */
  async getPaymentReceipt(paymentId, userId) {
    const byUuid = isUuid(paymentId);
    const r = await pool.query(
      `SELECT p.payment_id, p.amount, p.currency, p.status, p.payment_method,
              p.purpose, p.created_at, p.paid_at, p.user_id,
              pi.code AS item_code, pi.name AS item_name,
              ps.code AS structure_code, ps.name AS structure_name,
              r.id AS registration_id,
              u.id AS institution_id, u.name AS institution_name,
              u.address AS institution_address, u.phone AS institution_phone,
              u.email AS institution_email
         FROM payments p
         LEFT JOIN payment_items pi      ON pi.id = p.payment_item_id
         LEFT JOIN payment_structures ps ON ps.id = p.payment_structure_id
         LEFT JOIN jupeb_registrations r ON r.id = p.registration_id
         LEFT JOIN jupeb_universities u  ON u.id = r.university_id
        WHERE ${byUuid ? 'p.id' : 'p.payment_id'} = $1
        LIMIT 1`,
      [paymentId]
    );
    const row = r.rows[0];
    if (!row) throw httpError(404, 'Payment not found');
    if (row.user_id && userId && row.user_id !== userId) {
      throw httpError(403, 'This payment does not belong to you');
    }
    return {
      transaction_id: row.payment_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      jupeb_projection: mapPaymentStatusToJupebProjection(row.status),
      payment_method: row.payment_method,
      payment_item: row.item_name ? { code: row.item_code, name: row.item_name } : null,
      payment_structure: row.structure_name
        ? { code: row.structure_code, name: row.structure_name }
        : null,
      description: row.purpose || null,
      institution: row.institution_id
        ? {
          id: row.institution_id,
          name: row.institution_name,
          address: row.institution_address,
          phone: row.institution_phone,
          email: row.institution_email,
        }
        : null,
      registration_id: row.registration_id || null,
      date: row.paid_at || row.created_at,
      created_at: row.created_at,
      paid_at: row.paid_at,
    };
  }

  async listAdminPayments(query, userId) {
    await assertFinanceRole(userId);
    if (query.university_id) {
      if (!isUuid(query.university_id)) {
        throw httpError(422, 'university_id must be a valid UUID');
      }
      return this.listFoundationInstitutionPayments(query.university_id, query, userId);
    }
    const safePage = Math.max(1, parseInt(query.page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    if (query.session_id && !isUuid(query.session_id)) {
      throw httpError(422, 'session_id must be a valid UUID');
    }
    const effectiveSession = await sessionContext.resolveEffectiveSession(
      userId,
      query.session_id || null
    );
    const { rows, total } = await paymentModel.findJupebLinkedWithRegistration({
      limit: safeLimit,
      offset,
      session_id: effectiveSession?.id || null,
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
         u.jupeb_prefix,
         u.email,
         u.status,
         inst.number_of_candidates,
         NOT EXISTS (
           SELECT 1 FROM jupeb_registrations r2
           JOIN jupeb_registration_sessions s2 ON s2.id = r2.session_id
           WHERE r2.university_id = u.id AND s2.opens_at < sess.opens_at
         ) AS is_new_affiliate,
         sess.aff_existing, sess.aff_new, sess.exam_per,
         COALESCE(coll.collected_total, 0)::numeric AS collected_total,
         COALESCE(coll.collected_affiliation, 0)::numeric AS collected_affiliation,
         COALESCE(coll.collected_examination, 0)::numeric AS collected_examination,
         COALESCE(coll.collected_count, 0)::int     AS collected_count,
         COALESCE(coll.pending_total, 0)::numeric   AS pending_total
       FROM inst
       JOIN jupeb_universities u ON u.id = inst.university_id
       CROSS JOIN sess
       LEFT JOIN LATERAL (
         SELECT
           SUM(p.amount) FILTER (WHERE p.status = 'completed') AS collected_total,
           SUM(p.amount) FILTER (
             WHERE p.status = 'completed' AND pi.code = 'affiliation_fee'
           ) AS collected_affiliation,
           SUM(p.amount) FILTER (
             WHERE p.status = 'completed' AND pi.code = 'examination_fee'
           ) AS collected_examination,
           COUNT(*) FILTER (WHERE p.status = 'completed') AS collected_count,
           SUM(p.amount) FILTER (
             WHERE p.status IN ('pending', 'pending_transfer', 'processing', 'pending_verification')
           ) AS pending_total
         FROM payments p
         LEFT JOIN payment_items pi ON pi.id = p.payment_item_id
         LEFT JOIN jupeb_registrations r3 ON r3.id = p.registration_id
         WHERE (
           (p.jupeb_university_id = u.id AND p.jupeb_session_id = sess.id)
           OR (r3.session_id = sess.id AND r3.university_id = u.id)
         )
       ) coll ON true
       ORDER BY u.name ASC`,
      [sessionId]
    );
    return r.rows.map((row) => this._mapInstitutionFeeRow(row));
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
    const allInstitutions = rows
      .map((row) => ({
        institution_id: row.institution_id,
        institution_name: row.institution_name,
        institution_code: row.institution_code,
        number_of_candidates: row.number_of_candidates,
        exam_fee: row.projected.exam_fee,
        collected: row.collected.total,
        collected_examination: row.collected.examination_fee,
      }))
      .sort((a, b) => b.exam_fee - a.exam_fee);

    let institutions = allInstitutions;
    if (query.university_id) {
      if (!isUuid(query.university_id)) {
        throw httpError(422, 'university_id must be a valid UUID');
      }
      institutions = allInstitutions.filter(
        (row) => String(row.institution_id) === String(query.university_id)
      );
    }
    const limitRaw = parseInt(query.limit, 10);
    if (Number.isFinite(limitRaw) && limitRaw > 0) {
      institutions = allInstitutions.slice(0, Math.min(limitRaw, 100));
    }

    return {
      session_id: sessionId,
      academic_year: session.academic_year,
      exam_fee_per_candidate: Number(session.exam_fee_per_candidate) || 0,
      total_projected_exam_fee: allInstitutions.reduce((s, i) => s + i.exam_fee, 0),
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
    if (query.university_id) {
      if (!isUuid(query.university_id)) {
        throw httpError(422, 'university_id must be a valid UUID');
      }
      rows = rows.filter((row) => String(row.institution_id) === String(query.university_id));
    }
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

  _aggregateFoundationFeeRows(feeRows) {
    return feeRows.reduce(
      (acc, row) => ({
        institutions: acc.institutions + 1,
        candidates: acc.candidates + row.number_of_candidates,
        projectedAffiliation: acc.projectedAffiliation + row.projected.affiliation_fee,
        projectedExam: acc.projectedExam + row.projected.exam_fee,
        collectedAffiliation: acc.collectedAffiliation + row.collected.affiliation_fee,
        collectedExam: acc.collectedExam + row.collected.examination_fee,
      }),
      {
        institutions: 0,
        candidates: 0,
        projectedAffiliation: 0,
        projectedExam: 0,
        collectedAffiliation: 0,
        collectedExam: 0,
      }
    );
  }

  /**
   * Foundation finance portal KPI cards — aggregates all institutions in a
   * session with projected + collected fee totals and growth vs previous session.
   */
  async foundationOverview(query, userId) {
    await assertFinanceRole(userId);
    if (query.university_id) {
      const { universityId, session } = await this._resolveFoundationInstitutionScope(query, userId);
      return this._institutionOverviewPayload(universityId, session);
    }

    const session = await sessionContext.resolveEffectiveSession(userId, query.session_id || null);
    if (!session) throw httpError(404, 'No registration session found');

    const rows = await this._institutionFeeRows(session.id);
    const current = this._aggregateFoundationFeeRows(rows);
    const previousSession = await registrationKpi.findPreviousRegistrationSession(session);
    const prevRows = previousSession ? await this._institutionFeeRows(previousSession.id) : null;
    const prev = prevRows ? this._aggregateFoundationFeeRows(prevRows) : null;

    const now = new Date();
    const opens = session.opens_at ? new Date(session.opens_at) : null;
    const closes = session.closes_at ? new Date(session.closes_at) : null;
    const within = opens && closes && now >= opens && now <= closes;

    return {
      session_id: session.id,
      academic_year: session.academic_year,
      institutions_with_registrations: this._growthCard(current.institutions, prev?.institutions),
      total_candidates_registered: this._growthCard(current.candidates, prev?.candidates),
      total_affiliation_fee: {
        projected: this._growthCard(current.projectedAffiliation, prev?.projectedAffiliation),
        collected: this._growthCard(current.collectedAffiliation, prev?.collectedAffiliation),
      },
      total_examination_fee: {
        projected: this._growthCard(current.projectedExam, prev?.projectedExam),
        collected: this._growthCard(current.collectedExam, prev?.collectedExam),
      },
      registration_status: {
        status: session.status,
        closes_at: session.closes_at || null,
        within_window: !!within,
      },
      compared_to: previousSession
        ? { session_id: previousSession.id, label: previousSession.academic_year }
        : null,
    };
  }

  /**
   * Foundation finance portal — per-institution fee tab KPI cards.
   * Requires `university_id` + `payment_item` (e.g. affiliation_fee).
   */
  async foundationInstitutionFees(query, userId) {
    const { universityId, session } = await this._resolveFoundationInstitutionScope(query, userId);
    const itemRef = query.payment_item || query.payment_item_id;
    return this._institutionFeesPayload(universityId, session, itemRef);
  }

  /**
   * Foundation admin — institution fee KPI cards (path param variant).
   */
  async foundationInstitutionFeesByUniversity(universityId, query, userId) {
    return this.foundationInstitutionFees(
      { ...query, university_id: universityId },
      userId
    );
  }

  /**
   * Foundation admin view of one institution's payment history (eye-icon drawer).
   */
  async listFoundationInstitutionPayments(universityId, query, userId) {
    await assertFinanceRole(userId);
    if (!isUuid(universityId)) throw httpError(422, 'university_id must be a valid UUID');

    const uni = await universityModel.findById(universityId);
    if (!uni) throw httpError(404, 'Institution not found');

    const session = await sessionContext.resolveEffectiveSession(userId, query.session_id || null);
    if (!session) throw httpError(404, 'No registration session found');

    const safePage = Math.max(1, parseInt(query.page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;

    let paymentItemId = null;
    const itemRef = query.payment_item || query.payment_item_id;
    if (itemRef) {
      const item = isUuid(itemRef)
        ? await paymentItemModel.findById(itemRef)
        : await paymentItemModel.findByCode(itemRef);
      if (!item) throw httpError(404, 'Payment item not found');
      paymentItemId = item.id;
    }

    const { rows, total } = await paymentModel.findInstitutionPayments({
      university_id: universityId,
      session_id: session.id,
      payment_item_id: paymentItemId,
      status: query.status || null,
      q: query.q ? String(query.q).trim() : null,
      limit: safeLimit,
      offset,
    });

    const enriched = rows.map((p) => ({
      id: p.id,
      transaction_id: p.payment_id,
      payment_type: p.item_name ? { code: p.item_code, name: p.item_name } : null,
      payment_structure: p.structure_name
        ? { code: p.structure_code, name: p.structure_name }
        : null,
      description: p.purpose || null,
      payment_method: p.payment_method,
      amount: Number(p.amount),
      currency: p.currency,
      date: p.paid_at || p.created_at,
      status: p.status,
      jupeb_projection: mapPaymentStatusToJupebProjection(p.status),
    }));

    return {
      session_id: session.id,
      university_id: universityId,
      rows: enriched,
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
    const universityId = query.university_id || null;
    if (sessionId && !isUuid(sessionId)) {
      throw httpError(422, 'session_id must be a valid UUID');
    }
    if (universityId && !isUuid(universityId)) {
      throw httpError(422, 'university_id must be a valid UUID');
    }
    const y = parseInt(query.year, 10);
    const targetYear = Number.isFinite(y) ? y : new Date().getUTCFullYear();
    const previousYear = targetYear - 1;

    const monthlyForYear = async (yy) => {
      const params = [yy];
      let where = `p.status = 'completed'
                   AND EXTRACT(YEAR FROM COALESCE(p.paid_at, p.created_at)) = $1
                   AND (
                     p.registration_id IS NOT NULL
                     OR (p.jupeb_university_id IS NOT NULL AND p.jupeb_session_id IS NOT NULL)
                   )`;
      if (sessionId) {
        params.push(sessionId);
        where += ` AND (
          p.jupeb_session_id = $${params.length}
          OR EXISTS (
            SELECT 1 FROM jupeb_registrations r
            WHERE r.id = p.registration_id AND r.session_id = $${params.length}
          )
        )`;
      }
      if (universityId) {
        params.push(universityId);
        where += ` AND (
          p.jupeb_university_id = $${params.length}
          OR EXISTS (
            SELECT 1 FROM jupeb_registrations r
            WHERE r.id = p.registration_id AND r.university_id = $${params.length}
          )
        )`;
      }
      const r = await pool.query(
        `SELECT EXTRACT(MONTH FROM COALESCE(p.paid_at, p.created_at))::int AS m,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(p.amount), 0)::numeric AS amt
         FROM payments p
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
      university_id: universityId,
      series: [
        { key: 'current', year: targetYear, points: await monthlyForYear(targetYear) },
        { key: 'previous', year: previousYear, points: await monthlyForYear(previousYear) },
      ],
    };
  }
}

module.exports = new FinanceService();
