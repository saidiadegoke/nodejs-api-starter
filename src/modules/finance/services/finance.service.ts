import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { RegistrationRepository } from '../../registration/repositories/registration.repository';
import { SessionRepository } from '../../sessions/repositories/session.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { PaymentReconciliationRepository } from '../repositories/payment-reconciliation.repository';
import { PaymentItemRepository } from '../../payment-catalog/repositories/payment-item.repository';
import { PaymentStructureRepository } from '../../payment-catalog/repositories/payment-structure.repository';
import { UniversityRepository } from '../../institutions/repositories/university.repository';
import { InstitutionUserScopeService } from '../../registration/services/institution-user-scope.service';
import { UserRepository } from '../../users/repositories/user.repository';
import { FilesService } from '../../files/services/files.service';
import {
  Currency,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../../../shared/enums';
import { deltaPct, growthTrend } from '../../registration/services/registration-kpi.service';
import {
  CreateCheckoutDto,
  CreateInstitutionCheckoutDto,
  UploadPaymentReceiptDto,
  ConfirmPaymentDto,
  ReconcilePaymentDto,
  ListMyPaymentsQueryDto,
  ListAdminPaymentsQueryDto,
  ListInstitutionPaymentsQueryDto,
  AnalyticsQueryDto,
} from '../dto';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function generatePaymentId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `PAY-${ts}-${rand}`;
}

@Injectable()
export class FinanceService {
  private readonly logger;

  constructor(
    private readonly regRepo: RegistrationRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly reconRepo: PaymentReconciliationRepository,
    private readonly paymentItemRepo: PaymentItemRepository,
    private readonly paymentStructureRepo: PaymentStructureRepository,
    private readonly universityRepo: UniversityRepository,
    private readonly scopeService: InstitutionUserScopeService,
    private readonly userRepo: UserRepository,
    private readonly filesService: FilesService,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(FinanceService.name);
  }

  async listPaymentMethods() {
    const rows = await this.dataSource.query(
      `SELECT id, name, type, description, is_active FROM payment_methods WHERE is_active = true ORDER BY name ASC`,
    );
    return rows;
  }

  async resolveRegistrationForCheckout(userId: string, registrationIdOpt?: string) {
    if (registrationIdOpt) {
      const reg = await this.regRepo.findById(registrationIdOpt);
      if (!reg) throw new NotFoundException('Registration not found');
      if (reg.userId && reg.userId !== userId) {
        throw new ForbiddenException('Registration does not belong to current user');
      }
      return reg;
    }
    const reg = await this.regRepo.findLatestForUser(userId);
    if (!reg || reg.userId !== userId) {
      throw new NotFoundException('No claimed registration found for checkout');
    }
    return reg;
  }

  async getFeePreview(userId: string, query?: { registration_id?: string }) {
    const reg = await this.resolveRegistrationForCheckout(userId, query?.registration_id);
    const session = await this.sessionRepo.findById(reg.sessionId);

    const feeAmount = Number(session?.registrationFeeAmount) || Number(session?.examFeePerCandidate) || 25000;
    const payments = await this.paymentRepo.findByRegistrationId(reg.id);
    const successfulPaid = payments
      .filter((p) => p.status === 'successful')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const balanceDue = Math.max(0, feeAmount - successfulPaid);

    return {
      registration_id: reg.id,
      total_fee: feeAmount,
      amount_paid: successfulPaid,
      balance_due: balanceDue,
      currency: session?.registrationFeeCurrency || 'NGN',
      payment_projection: reg.paymentProjection,
    };
  }

  async createCheckout(userId: string, dto: CreateCheckoutDto) {
    const reg = await this.resolveRegistrationForCheckout(userId, dto.registration_id);
    const session = await this.sessionRepo.findById(reg.sessionId);

    const amount = dto.amount || Number(session?.registrationFeeAmount) || 25000;
    const paymentId = generatePaymentId();
    const transactionRef = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const payment = await this.paymentRepo.create({
      paymentId,
      amount,
      currency: session?.registrationFeeCurrency || Currency.NGN,
      type: PaymentType.REGISTRATION_FEE,
      paymentType: PaymentType.FEE,
      status: PaymentStatus.PENDING,
      paymentMethod: (dto.payment_method as PaymentMethod) || PaymentMethod.PAYSTACK,
      paymentMethodId: dto.payment_method_id || null,
      transactionRef,
      userId,
      registrationId: reg.id,
      paymentItemId: dto.payment_item_id || null,
      paymentStructureId: dto.payment_structure_id || null,
      jupebUniversityId: reg.universityId,
      jupebSessionId: reg.sessionId,
      metadata: {
        registration_id: reg.id,
        processor: dto.processor || 'paystack',
      },
    });

    return {
      id: payment.id,
      payment_id: payment.paymentId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      transaction_ref: payment.transactionRef,
      checkout_url: `https://checkout.paystack.com/${transactionRef}`,
    };
  }

  async listMyPayments(userId: string, query: ListMyPaymentsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const values: any[] = [userId];
    let whereClause = `WHERE p.user_id = $1`;

    if (query.status) {
      values.push(query.status);
      whereClause += ` AND p.status = $${values.length}`;
    }
    if (query.registration_id) {
      values.push(query.registration_id);
      whereClause += ` AND p.registration_id = $${values.length}`;
    }

    const countRes = await this.dataSource.query(
      `SELECT COUNT(*)::int as total FROM payments p ${whereClause}`,
      values,
    );
    const total = countRes[0]?.total || 0;

    const rows = await this.dataSource.query(
      `SELECT p.*, pi.name as payment_item_name
       FROM payments p
       LEFT JOIN payment_items pi ON pi.id = p.payment_item_id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    return { rows, page, limit, total };
  }

  async getPaymentReceipt(paymentId: string, userId: string) {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) throw new NotFoundException('Payment not found');

    const user = await this.userRepo.findById(userId);

    return {
      id: payment.id,
      payment_id: payment.paymentId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      transaction_ref: payment.transactionRef,
      paid_at: payment.updatedAt?.toISOString(),
      payer_name: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : null,
      payer_email: user?.email || null,
    };
  }

  async listAdminPayments(query: ListAdminPaymentsQueryDto, _actorUserId: string) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const values: any[] = [];
    const conditions: string[] = [];

    if (query.status) {
      values.push(query.status);
      conditions.push(`p.status = $${values.length}`);
    }
    if (query.session_id) {
      values.push(query.session_id);
      conditions.push(`p.jupeb_session_id = $${values.length}`);
    }
    if (query.university_id) {
      values.push(query.university_id);
      conditions.push(`p.jupeb_university_id = $${values.length}`);
    }
    if (query.q) {
      values.push(`%${query.q}%`);
      conditions.push(`(p.payment_id ILIKE $${values.length} OR p.transaction_ref ILIKE $${values.length})`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.dataSource.query(
      `SELECT COUNT(*)::int as total FROM payments p ${where}`,
      values,
    );
    const total = countRes[0]?.total || 0;

    const rows = await this.dataSource.query(
      `SELECT p.*, u.email as user_email, ju.name as university_name
       FROM payments p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN jupeb_universities ju ON ju.id = p.jupeb_university_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    return { rows, page, limit, total };
  }

  async getPaymentSummary(registrationId: string, _actorUserId: string) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    const payments = await this.paymentRepo.findByRegistrationId(registrationId);
    const reconciliations = await this.reconRepo.findByRegistrationId(registrationId);

    const session = await this.sessionRepo.findById(reg.sessionId);
    const totalExpected = Number(session?.registrationFeeAmount) || 25000;
    const successfulPaid = payments
      .filter((p) => p.status === 'successful')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      registration_id: registrationId,
      total_expected: totalExpected,
      total_paid: successfulPaid,
      outstanding_balance: Math.max(0, totalExpected - successfulPaid),
      payment_projection: reg.paymentProjection,
      payments,
      reconciliations,
    };
  }

  async reconcile(registrationId: string, dto: ReconcilePaymentDto, actorUserId: string) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    let paymentId = dto.payment_id;
    if (!paymentId) {
      const p = await this.paymentRepo.create({
        paymentId: generatePaymentId(),
        amount: dto.captured_amount,
        currency: dto.currency || 'NGN',
        type: 'manual_reconciliation',
        paymentType: 'reconciliation',
        status: dto.status_snapshot,
        transactionRef: dto.gateway_reference || `REC-${Date.now()}`,
        userId: reg.userId,
        registrationId,
        jupebUniversityId: reg.universityId,
        jupebSessionId: reg.sessionId,
      });
      paymentId = p.id;
    }

    const recon = await this.reconRepo.create({
      registrationId,
      paymentId,
      statusSnapshot: dto.status_snapshot,
      capturedAmount: dto.captured_amount,
      currency: dto.currency || 'NGN',
      gatewayReference: dto.gateway_reference || null,
      reconciledBy: actorUserId,
      reconciledAt: new Date(),
    });

    return recon;
  }

  async sessionReport(sessionId: string, _actorUserId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');

    const stats = await this.dataSource.query(
      `SELECT
         COUNT(DISTINCT r.id)::int as total_registrations,
         COALESCE(SUM(p.amount), 0)::numeric as total_collected,
         COUNT(DISTINCT p.id)::int as total_transactions
       FROM jupeb_registrations r
       LEFT JOIN payments p ON p.registration_id = r.id AND p.status = 'successful'
       WHERE r.session_id = $1`,
      [sessionId],
    );

    return {
      session_id: sessionId,
      academic_year: session.academicYear,
      ...stats[0],
    };
  }

  async _institutionFeeRows(sessionId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) return [];

    const r = await this.dataSource.query(
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
         COALESCE(inst.number_of_candidates, 0)::int AS number_of_candidates,
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
       FROM jupeb_universities u
       LEFT JOIN inst ON inst.university_id = u.id
       CROSS JOIN sess
       LEFT JOIN LATERAL (
         SELECT
           SUM(p.amount) FILTER (WHERE p.status IN ('completed', 'successful')) AS collected_total,
           SUM(p.amount) FILTER (
             WHERE p.status IN ('completed', 'successful') AND (pi.code = 'affiliation_fee' OR pi.code ILIKE '%affiliation%' OR p.purpose ILIKE '%affiliation%')
           ) AS collected_affiliation,
           SUM(p.amount) FILTER (
             WHERE p.status IN ('completed', 'successful') AND (pi.code = 'examination_fee' OR pi.code ILIKE '%exam%' OR p.purpose ILIKE '%exam%')
           ) AS collected_examination,
           COUNT(*) FILTER (WHERE p.status IN ('completed', 'successful')) AS collected_count,
           SUM(p.amount) FILTER (
             WHERE p.status IN ('pending', 'pending_transfer', 'processing', 'pending_verification')
           ) AS pending_total
         FROM payments p
         LEFT JOIN payment_items pi ON pi.id = p.payment_item_id
         LEFT JOIN jupeb_registrations r3 ON r3.id = p.registration_id
         WHERE (
           (p.jupeb_university_id = u.id AND (p.jupeb_session_id = sess.id OR p.session_id = sess.id))
           OR (r3.session_id = sess.id AND r3.university_id = u.id)
         )
       ) coll ON true
       WHERE u.deleted_at IS NULL
       ORDER BY u.name ASC`,
      [sessionId],
    );

    return r.map((row: any) => this._mapInstitutionFeeRow(row));
  }

  private _mapInstitutionFeeRow(row: any) {
    const numCandidates = Number(row.number_of_candidates) || 0;
    const affiliationFee = row.is_new_affiliate
      ? Number(row.aff_new) || 0
      : Number(row.aff_existing) || 0;
    const examFee = (Number(row.exam_per) || 0) * numCandidates;
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
      number_of_candidates: numCandidates,
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
        payment_count: Number(row.collected_count) || 0,
      },
      pending: { total: Number(row.pending_total) || 0 },
      outstanding: projectedTotal - collectedTotal,
      outstanding_by_fee: {
        affiliation_fee: affiliationFee - collectedAffiliation,
        examination_fee: examFee - collectedExamination,
      },
    };
  }

  async examFeeByInstitution(query: AnalyticsQueryDto, _actorUserId: string) {
    const session = query.session_id
      ? await this.sessionRepo.findById(query.session_id)
      : await this.sessionRepo.findActive();

    if (!session) {
      return {
        session_id: null,
        academic_year: null,
        exam_fee_per_candidate: 0,
        total_projected_exam_fee: 0,
        institutions: [],
      };
    }

    const sessionId = session.id;
    const rows = await this._institutionFeeRows(sessionId);
    const allInstitutions = rows
      .map((row) => ({
        institution_id: row.institution_id,
        institution_name: row.institution_name,
        institution_code: row.institution_code,
        jupeb_prefix: row.jupeb_prefix,
        number_of_candidates: row.number_of_candidates,
        exam_fee: row.projected.exam_fee,
        collected: row.collected.total,
        collected_examination: row.collected.examination_fee,
      }))
      .sort((a, b) => b.exam_fee - a.exam_fee);

    let institutions = allInstitutions;
    if (query.university_id) {
      institutions = allInstitutions.filter(
        (row) => String(row.institution_id) === String(query.university_id),
      );
    }
    const limitRaw = parseInt(String(query.limit), 10);
    if (Number.isFinite(limitRaw) && limitRaw > 0) {
      institutions = institutions.slice(0, Math.min(limitRaw, 100));
    }

    const totalProjectedExamFee = allInstitutions.reduce((s, i) => s + i.exam_fee, 0);

    return {
      session_id: sessionId,
      academic_year: session.academicYear || (session as any).academic_year,
      exam_fee_per_candidate:
        Number(session.examFeePerCandidate || (session as any).exam_fee_per_candidate) || 0,
      total_projected_exam_fee: totalProjectedExamFee,
      institutions,
    };
  }

  async paymentTrends(_query: AnalyticsQueryDto, _actorUserId: string) {
    const rows = await this.dataSource.query(
      `SELECT
         DATE_TRUNC('day', created_at)::date as date,
         SUM(amount)::numeric as total_amount,
         COUNT(id)::int as transaction_count
       FROM payments
       WHERE status IN ('successful', 'completed') AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE_TRUNC('day', created_at)
       ORDER BY date ASC`,
    );
    return { trends: rows, data: rows };
  }

  async institutionFeeRecords(query: AnalyticsQueryDto, _actorUserId: string) {
    const session = query.session_id
      ? await this.sessionRepo.findById(query.session_id)
      : await this.sessionRepo.findActive();

    if (!session) {
      return {
        success: true,
        message: 'Institution fee records retrieved successfully',
        data: [],
        rows: [],
        page: 1,
        limit: 20,
        total: 0,
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      };
    }

    const safePage = Math.max(1, parseInt(String(query.page), 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(String(query.limit), 10) || 20));

    let rows = await this._institutionFeeRows(session.id);
    if (query.university_id) {
      rows = rows.filter((row) => String(row.institution_id) === String(query.university_id));
    }
    const q = query.q ? String(query.q).trim().toLowerCase() : '';
    if (q) {
      rows = rows.filter(
        (row) =>
          row.institution_name.toLowerCase().includes(q) ||
          (row.institution_code || '').toLowerCase().includes(q),
      );
    }
    const total = rows.length;
    const offset = (safePage - 1) * safeLimit;
    const pagedRows = rows.slice(offset, offset + safeLimit);

    return {
      success: true,
      message: 'Institution fee records retrieved successfully',
      data: pagedRows,
      rows: pagedRows,
      page: safePage,
      limit: safeLimit,
      total,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: safeLimit > 0 ? Math.ceil(total / safeLimit) : 1,
      },
    };
  }

  private _growthCard(curVal: any, prevVal?: any) {
    const cur = curVal !== undefined && curVal !== null ? Number(curVal) : 0;
    const prev = prevVal !== undefined && prevVal !== null ? Number(prevVal) : null;
    return {
      value: cur,
      delta_pct: deltaPct(cur, prev),
      trend: growthTrend(cur, prev),
    };
  }

  async resolveInstitutionFeeDetails(universityId: string, session: any) {
    const sessionId = session.id;
    const opensAt = session.opensAt || (session as any).opens_at;

    // 1. Number of active candidates in this session
    const regCountRow = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM jupeb_registrations
       WHERE university_id = $1 AND session_id = $2 AND status <> 'withdrawn'`,
      [universityId, sessionId],
    );
    const numberOfCandidates = Number(regCountRow[0]?.count) || 0;

    // 2. Determine if institution is new affiliate
    let isNewAffiliate = true;
    if (opensAt) {
      const isNewRow = await this.dataSource.query(
        `SELECT NOT EXISTS (
           SELECT 1 FROM jupeb_registrations r2
           JOIN jupeb_registration_sessions s2 ON s2.id = r2.session_id
           WHERE r2.university_id = $1 AND s2.opens_at < $2
         ) AS is_new`,
        [universityId, opensAt],
      );
      isNewAffiliate = Boolean(isNewRow[0]?.is_new ?? true);
    }

    // 3. Projected Fees
    const affNew = Number(session.affiliationFeeNew ?? (session as any).affiliation_fee_new) || 0;
    const affExisting = Number(session.affiliationFeeExisting ?? (session as any).affiliation_fee_existing) || 0;
    const examPerCandidate = Number(session.examFeePerCandidate ?? (session as any).exam_fee_per_candidate) || 25000;

    const affiliationFee = isNewAffiliate ? affNew : affExisting;
    const examFee = examPerCandidate * numberOfCandidates;
    const projectedTotal = affiliationFee + examFee;

    // 4. Collected Payments
    const collRow = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('successful', 'completed')), 0)::numeric AS collected_total,
         COALESCE(SUM(p.amount) FILTER (
           WHERE p.status IN ('successful', 'completed') AND (pi.code ILIKE '%affiliation%' OR p.purpose ILIKE '%affiliation%')
         ), 0)::numeric AS collected_affiliation,
         COALESCE(SUM(p.amount) FILTER (
           WHERE p.status IN ('successful', 'completed') AND (pi.code ILIKE '%exam%' OR p.purpose ILIKE '%exam%')
         ), 0)::numeric AS collected_examination,
         COUNT(*) FILTER (WHERE p.status IN ('successful', 'completed'))::int AS collected_count,
         COALESCE(SUM(p.amount) FILTER (
           WHERE p.status IN ('pending', 'pending_transfer', 'processing', 'pending_verification')
         ), 0)::numeric AS pending_total
       FROM payments p
       LEFT JOIN payment_items pi ON pi.id = p.payment_item_id
       LEFT JOIN jupeb_registrations r ON r.id = p.registration_id
       WHERE (
         (p.jupeb_university_id = $1 AND (p.jupeb_session_id = $2 OR p.session_id = $2))
         OR (r.university_id = $1 AND r.session_id = $2)
       )`,
      [universityId, sessionId],
    );

    const coll = collRow[0] || {};
    const collectedTotal = Number(coll.collected_total) || 0;
    const collectedAffiliation = Number(coll.collected_affiliation) || 0;
    const collectedExamination = Number(coll.collected_examination) || 0;
    const collectedCount = Number(coll.collected_count) || 0;
    const pendingTotal = Number(coll.pending_total) || 0;

    return {
      numberOfCandidates,
      isNewAffiliate,
      projected: {
        affiliation_fee: affiliationFee,
        exam_fee: examFee,
        total: projectedTotal,
      },
      collected: {
        affiliation_fee: collectedAffiliation,
        examination_fee: collectedExamination,
        total: collectedTotal,
        payment_count: collectedCount,
      },
      pending: { total: pendingTotal },
      outstanding: Math.max(0, projectedTotal - collectedTotal),
      outstanding_by_fee: {
        affiliation_fee: Math.max(0, affiliationFee - collectedAffiliation),
        examination_fee: Math.max(0, examFee - collectedExamination),
      },
    };
  }

  async institutionOverview(query: AnalyticsQueryDto, userId: string) {
    const universityId = await this.scopeService.effectiveUniversityId(userId, query.university_id);
    if (!universityId) throw new UnprocessableEntityException('university_id required');

    const sessionId = query.session_id;
    let session: any = null;
    if (sessionId) {
      session = await this.sessionRepo.findById(sessionId);
    }
    if (!session) {
      session = await this.sessionRepo.findActiveOrLatest();
    }
    if (!session) {
      const allSessions = await this.dataSource.query(
        `SELECT * FROM jupeb_registration_sessions ORDER BY opens_at DESC LIMIT 1`,
      );
      session = allSessions[0] || null;
    }
    if (!session) throw new NotFoundException('Registration session not found');

    const current = await this.resolveInstitutionFeeDetails(universityId, session);

    // Previous session comparison if available
    let prev: any = null;
    let previousSession: any = null;
    const opensAt = session.opensAt || session.opens_at;
    if (opensAt) {
      const prevRows = await this.dataSource.query(
        `SELECT id, academic_year, opens_at, closes_at FROM jupeb_registration_sessions
         WHERE opens_at < $1 ORDER BY opens_at DESC LIMIT 1`,
        [opensAt],
      );
      previousSession = prevRows[0] || null;
      if (previousSession) {
        prev = await this.resolveInstitutionFeeDetails(universityId, previousSession);
      }
    }

    return {
      session_id: session.id,
      university_id: universityId,
      number_of_candidates: this._growthCard(
        current.numberOfCandidates,
        prev?.numberOfCandidates,
      ),
      total_expected_affiliation_fee: this._growthCard(
        current.projected.affiliation_fee,
        prev?.projected.affiliation_fee,
      ),
      total_expected_examination_fee: this._growthCard(
        current.projected.exam_fee,
        prev?.projected.exam_fee,
      ),
      total_amount_paid: this._growthCard(current.collected.total, prev?.collected.total),
      compared_to: previousSession
        ? { session_id: previousSession.id, label: previousSession.academic_year || previousSession.academicYear }
        : null,

      // Flat compatibility fields
      candidates_count: current.numberOfCandidates,
      total_projected: current.projected.total,
      total_collected: current.collected.total,
      outstanding_balance: current.outstanding,
    };
  }

  async institutionFees(query: AnalyticsQueryDto, userId: string) {
    const universityId = await this.scopeService.effectiveUniversityId(userId, query.university_id);
    if (!universityId) throw new UnprocessableEntityException('university_id required');

    let session: any = query.session_id ? await this.sessionRepo.findById(query.session_id) : null;
    if (!session) session = await this.sessionRepo.findActiveOrLatest();
    if (!session) throw new NotFoundException('Registration session not found');

    const itemRef = (query as any).payment_item || (query as any).payment_item_id;
    if (!itemRef) {
      return this.institutionOverview(query, userId);
    }

    const itemRows = await this.dataSource.query(
      `SELECT * FROM payment_items WHERE (id::text = $1 OR code = $1) AND is_active = true LIMIT 1`,
      [itemRef],
    );
    const item = itemRows[0];
    if (!item) throw new NotFoundException('Payment item not found or inactive');

    const current = await this.resolveInstitutionFeeDetails(universityId, session);

    let prev: any = null;
    let previousSession: any = null;
    const opensAt = session.opensAt || session.opens_at;
    if (opensAt) {
      const prevRows = await this.dataSource.query(
        `SELECT id, academic_year, opens_at, closes_at FROM jupeb_registration_sessions
         WHERE opens_at < $1 ORDER BY opens_at DESC LIMIT 1`,
        [opensAt],
      );
      previousSession = prevRows[0] || null;
      if (previousSession) {
        prev = await this.resolveInstitutionFeeDetails(universityId, previousSession);
      }
    }

    const isAffiliation = item.fee_source === 'affiliation' || item.code.includes('affiliation');
    const expected = isAffiliation ? current.projected.affiliation_fee : current.projected.exam_fee;
    const paid = isAffiliation ? current.collected.affiliation_fee : current.collected.examination_fee;
    const outstanding = isAffiliation ? current.outstanding_by_fee.affiliation_fee : current.outstanding_by_fee.examination_fee;

    const prevExpected = prev ? (isAffiliation ? prev.projected.affiliation_fee : prev.projected.exam_fee) : null;
    const prevPaid = prev ? (isAffiliation ? prev.collected.affiliation_fee : prev.collected.examination_fee) : null;
    const prevOutstanding = prev ? (isAffiliation ? prev.outstanding_by_fee.affiliation_fee : prev.outstanding_by_fee.examination_fee) : null;

    return {
      session_id: session.id,
      university_id: universityId,
      payment_item: { id: item.id, code: item.code, name: item.name },
      total_payment_count: this._growthCard(current.collected.payment_count, prev?.collected.payment_count),
      total_expected: this._growthCard(expected, prevExpected),
      paid: this._growthCard(paid, prevPaid),
      outstanding: this._growthCard(outstanding, prevOutstanding),
      total_expected_payment: this._growthCard(expected, prevExpected),
      fee_paid: this._growthCard(paid, prevPaid),
      outstanding_fees: this._growthCard(outstanding, prevOutstanding),
      compared_to: previousSession
        ? { session_id: previousSession.id, label: previousSession.academic_year || previousSession.academicYear }
        : null,
    };
  }

  async institutionFeePreview(query: AnalyticsQueryDto, userId: string) {
    const universityId = await this.scopeService.effectiveUniversityId(userId, query.university_id);
    if (!universityId) throw new UnprocessableEntityException('university_id required');

    let session: any = query.session_id ? await this.sessionRepo.findById(query.session_id) : null;
    if (!session) session = await this.sessionRepo.findActiveOrLatest();
    if (!session) throw new NotFoundException('Registration session not found');

    const itemRef = (query as any).payment_item || (query as any).payment_item_id;
    if (!itemRef) throw new UnprocessableEntityException('payment_item is required');

    const itemRows = await this.dataSource.query(
      `SELECT * FROM payment_items WHERE (id::text = $1 OR code = $1) AND is_active = true LIMIT 1`,
      [itemRef],
    );
    const item = itemRows[0];
    if (!item) throw new NotFoundException('Payment item not found or inactive');

    const current = await this.resolveInstitutionFeeDetails(universityId, session);
    const isAffiliation = item.fee_source === 'affiliation' || item.code.includes('affiliation');
    const fullFee = isAffiliation ? current.projected.affiliation_fee : current.projected.exam_fee;
    const alreadyPaid = isAffiliation ? current.collected.affiliation_fee : current.collected.examination_fee;
    const outstanding = Math.max(0, fullFee - alreadyPaid);

    return {
      session_id: session.id,
      university_id: universityId,
      currency: session.registrationFeeCurrency || (session as any).registration_fee_currency || 'NGN',
      payment_item: { id: item.id, code: item.code, name: item.name },
      full_fee: fullFee,
      already_paid: alreadyPaid,
      outstanding,
      fully_paid: outstanding <= 0,
    };
  }

  async createInstitutionCheckout(userId: string, dto: CreateInstitutionCheckoutDto) {
    await this.scopeService.assertUniversityAccess(userId, dto.university_id);

    const paymentId = generatePaymentId();
    const transactionRef = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const amount = dto.amount || 500000;

    const rawPaymentItemKey = (dto.payment_item_id || '').trim();
    let paymentItem: any = null;
    if (rawPaymentItemKey) {
      if (UUID_REGEX.test(rawPaymentItemKey)) {
        paymentItem = await this.paymentItemRepo.findById(rawPaymentItemKey);
      }
      if (!paymentItem) {
        paymentItem = await this.paymentItemRepo.findByCode(rawPaymentItemKey);
      }
    }

    const rawPaymentStructureKey = (dto.payment_structure_id || '').trim();
    let paymentStructure: any = null;
    if (rawPaymentStructureKey) {
      if (UUID_REGEX.test(rawPaymentStructureKey)) {
        paymentStructure = await this.paymentStructureRepo.findById(rawPaymentStructureKey);
      }
      if (!paymentStructure) {
        paymentStructure = await this.paymentStructureRepo.findByCode(rawPaymentStructureKey);
      }
    }

    const resolvedPaymentItemId =
      paymentItem?.id ||
      (rawPaymentItemKey && UUID_REGEX.test(rawPaymentItemKey) ? rawPaymentItemKey : null);
    const resolvedPaymentStructureId =
      paymentStructure?.id ||
      (rawPaymentStructureKey && UUID_REGEX.test(rawPaymentStructureKey)
        ? rawPaymentStructureKey
        : null);

    const payment = await this.paymentRepo.create({
      paymentId,
      amount,
      currency: Currency.NGN,
      type: PaymentType.INSTITUTION_BULK_FEE,
      paymentType: paymentItem?.code || PaymentType.INSTITUTION_FEE,
      status: PaymentStatus.PENDING,
      paymentMethod: (dto.payment_method as PaymentMethod) || PaymentMethod.DIRECT_TRANSFER,
      paymentMethodId: dto.payment_method_id || null,
      transactionRef,
      userId,
      paymentItemId: resolvedPaymentItemId,
      paymentStructureId: resolvedPaymentStructureId,
      jupebUniversityId: dto.university_id,
      jupebSessionId: dto.session_id || null,
      metadata: {
        processor: dto.processor || 'direct_transfer',
        payment_item_key: rawPaymentItemKey || null,
        payment_item_code: paymentItem?.code || rawPaymentItemKey || null,
        payment_structure_key: rawPaymentStructureKey || null,
        payment_structure_code: paymentStructure?.code || rawPaymentStructureKey || null,
      },
    });

    return {
      id: payment.id,
      payment_id: payment.paymentId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      transaction_ref: payment.transactionRef,
      account_number: '0123456789',
      bank_name: 'Wema Bank (JUPEB Central)',
    };
  }

  async cancelInstitutionPayment(paymentId: string, userId: string) {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.jupebUniversityId) {
      await this.scopeService.assertUniversityAccess(userId, payment.jupebUniversityId);
    }
    return this.paymentRepo.updateById(paymentId, { status: PaymentStatus.CANCELLED });
  }

  async listInstitutionPayments(query: ListInstitutionPaymentsQueryDto, userId: string) {
    const universityId = await this.scopeService.effectiveUniversityId(userId, query.university_id);
    if (!universityId) throw new UnprocessableEntityException('university_id required');

    return this.listAdminPayments({ ...query, university_id: universityId }, userId);
  }

  async getInstitutionPaymentReceipt(paymentId: string, userId: string) {
    return this.getPaymentReceipt(paymentId, userId);
  }

  async foundationOverview(_query: AnalyticsQueryDto, _actorUserId: string) {
    const rows = await this.dataSource.query(
      `SELECT
         COUNT(DISTINCT ju.id)::int as participating_institutions_count,
         COALESCE(SUM(p.amount), 0)::numeric as total_collected,
         COUNT(DISTINCT r.id)::numeric * 25000 as total_projected
       FROM jupeb_universities ju
       LEFT JOIN jupeb_registrations r ON r.university_id = ju.id
       LEFT JOIN payments p ON p.status = 'successful'
       WHERE ju.deleted_at IS NULL`,
    );
    const data = rows[0] || {};
    const proj = Number(data.total_projected) || 0;
    const coll = Number(data.total_collected) || 0;

    return {
      participating_institutions_count: Number(data.participating_institutions_count) || 0,
      total_projected: proj,
      total_collected: coll,
      outstanding_balance: Math.max(0, proj - coll),
    };
  }

  async foundationInstitutionFees(query: AnalyticsQueryDto, actorUserId: string) {
    return this.institutionFeeRecords(query, actorUserId);
  }

  async foundationInstitutionFeesByUniversity(
    universityId: string,
    _query: AnalyticsQueryDto,
    _actorUserId: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT
         ju.id as university_id,
         ju.code as university_code,
         ju.name as university_name,
         COALESCE(SUM(p.amount), 0)::numeric as collected_amount,
         COUNT(DISTINCT r.id)::numeric * 25000 as projected_amount
       FROM jupeb_universities ju
       LEFT JOIN jupeb_registrations r ON r.university_id = ju.id
       LEFT JOIN payments p ON p.jupeb_university_id = ju.id AND p.status = 'successful'
       WHERE ju.id = $1 AND ju.deleted_at IS NULL
       GROUP BY ju.id, ju.code, ju.name`,
      [universityId],
    );
    return rows[0] || null;
  }

  async listFoundationInstitutionPayments(
    universityId: string,
    query: AnalyticsQueryDto,
    actorUserId: string,
  ) {
    return this.listAdminPayments({ ...query, university_id: universityId }, actorUserId);
  }

  /**
   * Institution endpoint: Upload payment receipt / document for fee settlement
   */
  async uploadInstitutionPaymentReceipt(
    userId: string,
    dto: UploadPaymentReceiptDto,
    file?: any,
  ) {
    const universityId = await this.scopeService.effectiveUniversityId(userId, dto.university_id);
    if (!universityId) {
      throw new UnprocessableEntityException('university_id is required or user is not associated with an institution');
    }
    await this.scopeService.assertUniversityAccess(userId, universityId);

    let sessionId = dto.session_id;
    if (!sessionId) {
      const activeSession = await this.sessionRepo.findActive();
      sessionId = activeSession?.id;
    }

    let receiptUrl = dto.receipt_url || null;
    let receiptFileId = dto.receipt_file_id || null;

    if (file && file.buffer) {
      const uploaded = await this.filesService.uploadFile(file, userId, 'payment_receipts');
      receiptUrl = uploaded.file_url;
      receiptFileId = uploaded.id;
    }

    const rawPaymentItemKey = (dto.payment_item_id || dto.payment_item || '').trim();
    let paymentItem: any = null;
    if (rawPaymentItemKey) {
      if (UUID_REGEX.test(rawPaymentItemKey)) {
        paymentItem = await this.paymentItemRepo.findById(rawPaymentItemKey);
      }
      if (!paymentItem) {
        paymentItem = await this.paymentItemRepo.findByCode(rawPaymentItemKey);
      }
    }

    const rawPaymentStructureKey = (dto.payment_structure_id || dto.payment_structure || '').trim();
    let paymentStructure: any = null;
    if (rawPaymentStructureKey) {
      if (UUID_REGEX.test(rawPaymentStructureKey)) {
        paymentStructure = await this.paymentStructureRepo.findById(rawPaymentStructureKey);
      }
      if (!paymentStructure) {
        paymentStructure = await this.paymentStructureRepo.findByCode(rawPaymentStructureKey);
      }
    }

    const paymentId = generatePaymentId();
    const transactionRef = dto.transaction_ref || `TXN-REC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const resolvedPaymentItemId =
      paymentItem?.id ||
      (rawPaymentItemKey && UUID_REGEX.test(rawPaymentItemKey) ? rawPaymentItemKey : null);
    const resolvedPaymentStructureId =
      paymentStructure?.id ||
      (rawPaymentStructureKey && UUID_REGEX.test(rawPaymentStructureKey)
        ? rawPaymentStructureKey
        : null);

    const payment = await this.paymentRepo.create({
      paymentId,
      amount: dto.amount,
      currency: Currency.NGN,
      type: PaymentType.INSTITUTION_RECEIPT_UPLOAD,
      paymentType: paymentItem?.code || PaymentType.INSTITUTION_FEE,
      status: PaymentStatus.PENDING_VERIFICATION,
      paymentMethod: PaymentMethod.OFFLINE_RECEIPT,
      transactionRef,
      userId,
      paymentItemId: resolvedPaymentItemId,
      paymentStructureId: resolvedPaymentStructureId,
      jupebUniversityId: universityId,
      jupebSessionId: sessionId || null,
      metadata: {
        receipt_url: receiptUrl,
        receipt_file_id: receiptFileId,
        description: dto.description || null,
        bank_name: dto.bank_name || null,
        payment_date: dto.payment_date || new Date().toISOString(),
        payment_item_key: rawPaymentItemKey || null,
        payment_item_code: paymentItem?.code || rawPaymentItemKey || null,
        payment_item_name: paymentItem?.name || null,
        payment_structure_key: rawPaymentStructureKey || null,
        payment_structure_code: paymentStructure?.code || rawPaymentStructureKey || null,
        payment_structure_name: paymentStructure?.name || null,
        uploaded_by: userId,
        uploaded_at: new Date().toISOString(),
      },
    });

    this.logger.log(
      `Institution uploaded payment receipt ${payment.paymentId} for university ${universityId} (amount: ₦${dto.amount})`,
    );

    return {
      success: true,
      message: 'Payment receipt uploaded successfully and submitted for finance verification',
      data: {
        id: payment.id,
        payment_id: payment.paymentId,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
        transaction_ref: payment.transactionRef,
        university_id: payment.jupebUniversityId,
        session_id: payment.jupebSessionId,
        payment_item_id: payment.paymentItemId,
        payment_item_name: paymentItem?.name || null,
        payment_structure_id: payment.paymentStructureId,
        payment_structure_name: paymentStructure?.name || null,
        receipt_url: receiptUrl,
        receipt_file_id: receiptFileId,
        description: dto.description || null,
        created_at: payment.createdAt,
      },
    };
  }

  /**
   * Finance officer endpoint: Update / Confirm payment receipt
   */
  async confirmPayment(
    paymentIdOrUuid: string,
    dto: ConfirmPaymentDto,
    actorUserId: string,
  ) {
    let payment = await this.paymentRepo.findById(paymentIdOrUuid);
    if (!payment) {
      payment = await this.paymentRepo.findByPaymentId(paymentIdOrUuid);
    }
    if (!payment) {
      throw new NotFoundException(`Payment not found for identifier: ${paymentIdOrUuid}`);
    }

    const rawStatus = dto.status || PaymentStatus.SUCCESSFUL;
    const targetStatus = rawStatus === PaymentStatus.CONFIRMED ? PaymentStatus.SUCCESSFUL : rawStatus;
    const confirmedAmount =
      dto.confirmed_amount !== undefined ? dto.confirmed_amount : Number(payment.amount);

    const actor = await this.userRepo.findById(actorUserId);
    const actorName = actor
      ? `${actor.first_name || ''} ${actor.last_name || ''}`.trim() || actor.email
      : actorUserId;

    const updatedMetadata = {
      ...(payment.metadata || {}),
      confirmed_by: actorUserId,
      confirmed_by_name: actorName,
      confirmed_at: new Date().toISOString(),
      confirmation_notes: dto.notes || null,
      reconciliation_ref: dto.reconciliation_ref || null,
      original_amount: Number(payment.amount),
      verified_amount: confirmedAmount,
    };

    const updatedPayment = await this.paymentRepo.updateById(payment.id, {
      status: targetStatus,
      amount: confirmedAmount,
      metadata: updatedMetadata,
    });

    if (targetStatus === PaymentStatus.SUCCESSFUL) {
      try {
        await this.reconRepo.create({
          registrationId: payment.registrationId || payment.jupebUniversityId || payment.id,
          paymentId: payment.id,
          statusSnapshot: targetStatus,
          capturedAmount: confirmedAmount,
          currency: payment.currency || Currency.NGN,
          gatewayReference: dto.reconciliation_ref || payment.transactionRef || payment.paymentId,
          reconciledBy: actorUserId,
          reconciledAt: new Date(),
        });
      } catch (err: any) {
        this.logger.warn(
          `Could not create reconciliation entry for payment ${payment.id}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Payment ${payment.paymentId} confirmed by finance officer ${actorName} -> status: ${targetStatus}`,
    );

    return {
      success: true,
      message: `Payment ${targetStatus === PaymentStatus.SUCCESSFUL ? 'confirmed' : targetStatus} successfully`,
      data: {
        id: updatedPayment?.id || payment.id,
        payment_id: updatedPayment?.paymentId || payment.paymentId,
        amount: Number(updatedPayment?.amount || confirmedAmount),
        currency: updatedPayment?.currency || payment.currency,
        status: targetStatus,
        transaction_ref: updatedPayment?.transactionRef || payment.transactionRef,
        notes: dto.notes || null,
        reconciliation_ref: dto.reconciliation_ref || null,
        confirmed_by: actorName,
        confirmed_at: updatedMetadata.confirmed_at,
        updated_at: updatedPayment?.updatedAt || new Date(),
      },
    };
  }
}

