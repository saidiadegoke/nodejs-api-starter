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

  async examFeeByInstitution(query: AnalyticsQueryDto, _actorUserId: string) {
    const session = query.session_id
      ? await this.sessionRepo.findById(query.session_id)
      : await this.sessionRepo.findActive();

    const sessionId = session?.id;
    const rows = await this.dataSource.query(
      `SELECT
         ju.id as university_id,
         ju.code as university_code,
         ju.name as university_name,
         COUNT(r.id)::int as candidate_count,
         COUNT(r.id)::numeric * COALESCE(s.exam_fee_per_candidate, 25000) as projected_exam_fee
       FROM jupeb_universities ju
       LEFT JOIN jupeb_registrations r ON r.university_id = ju.id AND ($1::uuid IS NULL OR r.session_id = $1)
       LEFT JOIN jupeb_registration_sessions s ON s.id = r.session_id
       WHERE ju.deleted_at IS NULL
       GROUP BY ju.id, ju.code, ju.name, s.exam_fee_per_candidate
       ORDER BY candidate_count DESC`,
      [sessionId || null],
    );
    return rows;
  }

  async paymentTrends(_query: AnalyticsQueryDto, _actorUserId: string) {
    const rows = await this.dataSource.query(
      `SELECT
         DATE_TRUNC('day', created_at)::date as date,
         SUM(amount)::numeric as total_amount,
         COUNT(id)::int as transaction_count
       FROM payments
       WHERE status = 'successful' AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE_TRUNC('day', created_at)
       ORDER BY date ASC`,
    );
    return { trends: rows };
  }

  async institutionFeeRecords(query: AnalyticsQueryDto, _actorUserId: string) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const countRes = await this.dataSource.query(
      `SELECT COUNT(*)::int as total FROM jupeb_universities WHERE deleted_at IS NULL`,
    );
    const total = countRes[0]?.total || 0;

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
       WHERE ju.deleted_at IS NULL
       GROUP BY ju.id, ju.code, ju.name
       ORDER BY collected_amount DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return { rows, page, limit, total };
  }

  async institutionOverview(query: AnalyticsQueryDto, userId: string) {
    const universityId = await this.scopeService.effectiveUniversityId(userId, query.university_id);
    if (!universityId) throw new UnprocessableEntityException('university_id required');

    const rows = await this.dataSource.query(
      `SELECT
         COUNT(DISTINCT r.id)::int as candidates_count,
         COALESCE(SUM(p.amount), 0)::numeric as total_collected,
         COUNT(DISTINCT r.id)::numeric * 25000 as total_projected
       FROM jupeb_registrations r
       LEFT JOIN payments p ON p.jupeb_university_id = r.university_id AND p.status = 'successful'
       WHERE r.university_id = $1`,
      [universityId],
    );

    const data = rows[0] || {};
    const proj = Number(data.total_projected) || 0;
    const coll = Number(data.total_collected) || 0;

    return {
      university_id: universityId,
      total_projected: proj,
      total_collected: coll,
      outstanding_balance: Math.max(0, proj - coll),
      candidates_count: Number(data.candidates_count) || 0,
    };
  }

  async institutionFees(query: AnalyticsQueryDto, userId: string) {
    return this.institutionOverview(query, userId);
  }

  async institutionFeePreview(query: AnalyticsQueryDto, userId: string) {
    return this.institutionOverview(query, userId);
  }

  async createInstitutionCheckout(userId: string, dto: CreateInstitutionCheckoutDto) {
    await this.scopeService.assertUniversityAccess(userId, dto.university_id);

    const paymentId = generatePaymentId();
    const transactionRef = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const amount = dto.amount || 500000;

    const payment = await this.paymentRepo.create({
      paymentId,
      amount,
      currency: Currency.NGN,
      type: PaymentType.INSTITUTION_BULK_FEE,
      paymentType: PaymentType.INSTITUTION_FEE,
      status: PaymentStatus.PENDING,
      paymentMethod: (dto.payment_method as PaymentMethod) || PaymentMethod.DIRECT_TRANSFER,
      paymentMethodId: dto.payment_method_id || null,
      transactionRef,
      userId,
      paymentItemId: dto.payment_item_id || null,
      paymentStructureId: dto.payment_structure_id || null,
      jupebUniversityId: dto.university_id,
      jupebSessionId: dto.session_id || null,
      metadata: {
        processor: dto.processor || 'direct_transfer',
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

    let paymentItem: any = null;
    if (dto.payment_item_id) {
      paymentItem = await this.paymentItemRepo.findById(dto.payment_item_id);
      if (!paymentItem) {
        paymentItem = await this.paymentItemRepo.findByCode(dto.payment_item_id);
      }
    }

    let paymentStructure: any = null;
    if (dto.payment_structure_id) {
      paymentStructure = await this.paymentStructureRepo.findById(dto.payment_structure_id);
      if (!paymentStructure) {
        paymentStructure = await this.paymentStructureRepo.findByCode(dto.payment_structure_id);
      }
    }

    const paymentId = generatePaymentId();
    const transactionRef = dto.transaction_ref || `TXN-REC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

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
      paymentItemId: paymentItem?.id || dto.payment_item_id || null,
      paymentStructureId: paymentStructure?.id || dto.payment_structure_id || null,
      jupebUniversityId: universityId,
      jupebSessionId: sessionId || null,
      metadata: {
        receipt_url: receiptUrl,
        receipt_file_id: receiptFileId,
        description: dto.description || null,
        bank_name: dto.bank_name || null,
        payment_date: dto.payment_date || new Date().toISOString(),
        payment_item_name: paymentItem?.name || null,
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

