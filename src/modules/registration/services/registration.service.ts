import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { RegistrationRepository } from '../repositories/registration.repository';
import { RegistrationDocumentRepository } from '../repositories/registration-document.repository';
import { RegistrationStatusHistoryRepository } from '../repositories/registration-status-history.repository';
import { RegistrationStateService } from './registration-state.service';
import { RegistrationKpiService } from './registration-kpi.service';
import { RegistrationEventsService } from './registration-events.service';
import { RegistrationFormPdfService } from './registration-form-pdf.service';
import { RegistrationEntity, RegistrationStatus } from '../entities/registration.entity';
import {
  CreateRegistrationDto,
  PatchRegistrationDto,
  PatchCandidateDto,
  ListRegistrationsQueryDto,
  BatchRegistrationActionDto,
  ConfirmSubjectsDto,
} from '../dto';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RegistrationService {
  private readonly logger;

  constructor(
    private readonly regRepo: RegistrationRepository,
    private readonly docRepo: RegistrationDocumentRepository,
    private readonly historyRepo: RegistrationStatusHistoryRepository,
    private readonly stateService: RegistrationStateService,
    private readonly kpiService: RegistrationKpiService,
    private readonly eventsService: RegistrationEventsService,
    private readonly pdfService: RegistrationFormPdfService,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(RegistrationService.name);
  }

  async institutionList(query: ListRegistrationsQueryDto, _userId?: string | null) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const { rows, total } = await this.regRepo.findAllPaginated({
      sessionId: query.session_id,
      universityId: query.university_id,
      status: query.status,
      biometrics: query.biometrics,
      q: query.q,
      limit,
      offset,
    });

    return {
      rows,
      page,
      limit,
      total,
    };
  }

  async institutionGetCandidate(registrationId: string, _userId?: string | null) {
    if (!UUID_REGEX.test(registrationId)) throw new UnprocessableEntityException('Invalid registration ID');
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    const details = await this.dataSource.query(
      `SELECT r.*,
              u.name AS university_name, u.code AS university_code,
              p.first_name, p.last_name, p.display_name, p.gender, p.date_of_birth, p.profile_photo_url,
              usr.email, usr.phone,
              nv.nin_last4, nv.response_payload AS nin_payload,
              sc.code AS subject_combination_code, sc.title AS subject_combination_title
       FROM jupeb_registrations r
       LEFT JOIN jupeb_universities u ON u.id = r.university_id
       LEFT JOIN users usr ON usr.id = r.user_id
       LEFT JOIN profiles p ON p.user_id = r.user_id
       LEFT JOIN jupeb_nin_verifications nv ON nv.id = r.nin_verification_id
       LEFT JOIN jupeb_subject_combinations sc ON sc.id = r.subject_combination_id
       WHERE r.id = $1`,
      [registrationId],
    );

    const documents = await this.docRepo.findByRegistrationId(registrationId);
    const history = await this.historyRepo.findByRegistrationId(registrationId);

    return {
      ...(details[0] || reg),
      documents,
      status_history: history,
    };
  }

  async institutionCreate(dto: CreateRegistrationDto, userId?: string | null): Promise<RegistrationEntity> {
    const serialRows = await this.dataSource.query(
      `SELECT COALESCE(MAX(provisional_serial), 0) + 1 AS next_serial
       FROM jupeb_registrations WHERE session_id = $1`,
      [dto.session_id],
    );
    const nextSerial = serialRows[0].next_serial;
    const code = String(1000000 + nextSerial).slice(-7);

    const entity = await this.regRepo.create({
      sessionId: dto.session_id,
      universityId: dto.university_id,
      subjectCombinationId: dto.subject_combination_id || null,
      ninVerificationId: dto.nin_verification_id || null,
      userId: dto.user_id || null,
      institutionIssuedCode: dto.institution_issued_code || null,
      provisionalSerial: nextSerial,
      provisionalCandidateCode: code,
      status: RegistrationStatus.CODE_ISSUED,
      createdBy: userId || null,
    });

    await this.historyRepo.create({
      registrationId: entity.id,
      fromStatus: null,
      toStatus: RegistrationStatus.CODE_ISSUED,
      reason: 'Created by institution admin',
      changedBy: userId || entity.id,
    });

    return entity;
  }

  async institutionPatch(
    registrationId: string,
    dto: PatchRegistrationDto,
    _userId?: string | null,
  ): Promise<RegistrationEntity> {
    const existing = await this.regRepo.findById(registrationId);
    if (!existing) throw new NotFoundException('Registration not found');

    const fields: Partial<RegistrationEntity> = {};
    if (dto.subject_combination_id !== undefined) fields.subjectCombinationId = dto.subject_combination_id;
    if (dto.institution_issued_code !== undefined) fields.institutionIssuedCode = dto.institution_issued_code;
    if (dto.status_reason !== undefined) fields.statusReason = dto.status_reason;

    const updated = await this.regRepo.updateById(registrationId, fields);
    return updated!;
  }

  async institutionPatchCandidate(
    registrationId: string,
    dto: PatchCandidateDto,
    _userId?: string | null,
  ) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');
    if (!reg.userId) throw new UnprocessableEntityException('Registration does not have a linked user profile yet');

    const profileFields: Record<string, any> = {};
    if (dto.first_name) profileFields.first_name = dto.first_name.trim();
    if (dto.last_name) profileFields.last_name = dto.last_name.trim();
    if (dto.gender) profileFields.gender = dto.gender.trim();
    if (dto.date_of_birth) profileFields.date_of_birth = dto.date_of_birth;
    if (dto.state_of_origin) profileFields.state_of_origin = dto.state_of_origin;
    if (dto.lga) profileFields.lga = dto.lga;
    if (dto.residential_address) profileFields.residential_address = dto.residential_address;

    if (Object.keys(profileFields).length) {
      const sets = Object.keys(profileFields).map((k, i) => `${k} = $${i + 2}`).join(', ');
      await this.dataSource.query(
        `UPDATE profiles SET ${sets}, updated_at = NOW() WHERE user_id = $1`,
        [reg.userId, ...Object.values(profileFields)],
      );
    }

    if (dto.email || dto.phone) {
      const userSets: string[] = [];
      const userVals: any[] = [reg.userId];
      if (dto.email) {
        userSets.push(`email = $${userVals.length + 1}`);
        userVals.push(dto.email.trim());
      }
      if (dto.phone) {
        userSets.push(`phone = $${userVals.length + 1}`);
        userVals.push(dto.phone.trim());
      }
      await this.dataSource.query(
        `UPDATE users SET ${userSets.join(', ')}, updated_at = NOW() WHERE id = $1`,
        userVals,
      );
    }

    return this.institutionGetCandidate(registrationId);
  }

  async institutionResendCode(registrationId: string, _userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    return {
      registration_id: registrationId,
      code: reg.provisionalCandidateCode,
      message: 'Provisional code dispatched',
    };
  }

  async institutionDelete(registrationId: string, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    if (reg.status === RegistrationStatus.APPROVED) {
      throw new ConflictException('Approved registration cannot be deleted');
    }

    await this.regRepo.setStatus(registrationId, RegistrationStatus.WITHDRAWN, 'Deleted by admin', userId);
    await this.historyRepo.create({
      registrationId,
      fromStatus: reg.status,
      toStatus: RegistrationStatus.WITHDRAWN,
      reason: 'Deleted by institution admin',
      changedBy: userId || registrationId,
    });

    return { success: true, message: 'Registration withdrawn' };
  }

  async institutionStats(query: { session_id?: string; university_id?: string }, _userId?: string | null) {
    return this.kpiService.kpiCounts(query.university_id, query.session_id);
  }

  async institutionByUniversity(query: { session_id?: string }, _userId?: string | null) {
    const params = query.session_id ? [query.session_id] : [];
    const sessionClause = query.session_id ? `WHERE r.session_id = $1` : '';

    const rows = await this.dataSource.query(
      `SELECT u.id AS university_id, u.name AS university_name, u.code AS university_code,
              COUNT(r.id)::int AS total_candidates,
              COUNT(CASE WHEN r.status = 'approved' THEN 1 END)::int AS approved_candidates
       FROM jupeb_universities u
       LEFT JOIN jupeb_registrations r ON r.university_id = u.id ${sessionClause}
       WHERE u.deleted_at IS NULL
       GROUP BY u.id, u.name, u.code
       ORDER BY total_candidates DESC`,
      params,
    );

    return rows;
  }

  async institutionBatchAction(dto: BatchRegistrationActionDto, userId?: string | null) {
    const targetStatus = dto.action === 'approve'
      ? RegistrationStatus.APPROVED
      : dto.action === 'reject'
        ? RegistrationStatus.REJECTED
        : RegistrationStatus.WITHDRAWN;

    const results = [];
    for (const id of dto.registration_ids) {
      const reg = await this.regRepo.findById(id);
      if (!reg) continue;

      if (!this.stateService.canTransition(reg.status, targetStatus)) {
        continue;
      }

      await this.regRepo.setStatus(id, targetStatus, dto.reason, userId);
      await this.historyRepo.create({
        registrationId: id,
        fromStatus: reg.status,
        toStatus: targetStatus,
        reason: dto.reason || `Batch ${dto.action}`,
        changedBy: userId || id,
      });

      if (targetStatus === RegistrationStatus.APPROVED) {
        await this.eventsService.emitRegistrationApproved(reg, userId);
      }

      results.push({ id, status: targetStatus });
    }

    return {
      action: dto.action,
      total_requested: dto.registration_ids.length,
      updated_count: results.length,
      results,
    };
  }

  async institutionApprove(registrationId: string, body: { reason?: string }, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    if (!this.stateService.canTransition(reg.status, RegistrationStatus.APPROVED)) {
      throw new UnprocessableEntityException(`Cannot approve registration in status ${reg.status}`);
    }

    const updated = await this.regRepo.setStatus(registrationId, RegistrationStatus.APPROVED, body?.reason, userId);
    await this.historyRepo.create({
      registrationId,
      fromStatus: reg.status,
      toStatus: RegistrationStatus.APPROVED,
      reason: body?.reason || 'Approved by institution admin',
      changedBy: userId || registrationId,
    });

    await this.eventsService.emitRegistrationApproved(updated!, userId);
    return updated;
  }

  async institutionReject(registrationId: string, body: { reason?: string }, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    if (!this.stateService.canTransition(reg.status, RegistrationStatus.REJECTED)) {
      throw new UnprocessableEntityException(`Cannot reject registration in status ${reg.status}`);
    }

    const updated = await this.regRepo.setStatus(registrationId, RegistrationStatus.REJECTED, body?.reason, userId);
    await this.historyRepo.create({
      registrationId,
      fromStatus: reg.status,
      toStatus: RegistrationStatus.REJECTED,
      reason: body?.reason || 'Rejected by institution admin',
      changedBy: userId || registrationId,
    });

    return updated;
  }

  async institutionWithdraw(registrationId: string, body: { reason?: string }, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    const updated = await this.regRepo.setStatus(registrationId, RegistrationStatus.WITHDRAWN, body?.reason, userId);
    await this.historyRepo.create({
      registrationId,
      fromStatus: reg.status,
      toStatus: RegistrationStatus.WITHDRAWN,
      reason: body?.reason || 'Withdrawn by institution admin',
      changedBy: userId || registrationId,
    });

    return updated;
  }

  async institutionExportCsv(query: ListRegistrationsQueryDto, _userId?: string | null): Promise<string> {
    const { rows } = await this.regRepo.findAllPaginated({
      sessionId: query.session_id,
      universityId: query.university_id,
      status: query.status,
      biometrics: query.biometrics,
      q: query.q,
      limit: 10000,
      offset: 0,
    });

    const header = [
      'id',
      'university_name',
      'university_code',
      'first_name',
      'last_name',
      'email',
      'phone',
      'nin_last4',
      'provisional_candidate_code',
      'jupeb_candidate_number',
      'status',
      'subject_combination_code',
      'has_biometrics',
      'created_at',
    ];

    const escape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(header.map((h) => escape(r[h])).join(','));
    }
    return lines.join('\n');
  }

  async numberingPreview(sessionId: string) {
    const unfinalized = await this.dataSource.query(
      `SELECT r.id, u.jupeb_prefix, s.year_short,
              ROW_NUMBER() OVER (PARTITION BY r.university_id ORDER BY r.approved_at ASC, r.created_at ASC) AS seq
       FROM jupeb_registrations r
       JOIN jupeb_universities u ON u.id = r.university_id
       JOIN jupeb_registration_sessions s ON s.id = r.session_id
       WHERE r.session_id = $1 AND r.status = 'approved' AND r.jupeb_candidate_number IS NULL`,
      [sessionId],
    );

    const previews = unfinalized.map((u: any) => {
      const serial = String(u.seq).padStart(4, '0');
      return {
        id: u.id,
        candidate_number: `${u.year_short}${u.jupeb_prefix}${serial}`,
      };
    });

    return {
      session_id: sessionId,
      total_eligible: previews.length,
      sample_previews: previews.slice(0, 10),
    };
  }

  async finalizeCandidateNumbers(sessionId: string, userId?: string | null) {
    const unfinalized = await this.dataSource.query(
      `SELECT r.id, u.jupeb_prefix, s.year_short,
              ROW_NUMBER() OVER (PARTITION BY r.university_id ORDER BY r.approved_at ASC, r.created_at ASC) AS seq
       FROM jupeb_registrations r
       JOIN jupeb_universities u ON u.id = r.university_id
       JOIN jupeb_registration_sessions s ON s.id = r.session_id
       WHERE r.session_id = $1 AND r.status = 'approved' AND r.jupeb_candidate_number IS NULL`,
      [sessionId],
    );

    for (const u of unfinalized) {
      const serial = String(u.seq).padStart(4, '0');
      const candidateNumber = `${u.year_short}${u.jupeb_prefix}${serial}`;
      await this.regRepo.updateById(u.id, {
        jupebCandidateNumber: candidateNumber,
        updatedBy: userId || null,
      } as any);
    }

    return {
      session_id: sessionId,
      assigned_count: unfinalized.length,
    };
  }

  async finalizeAllClosedSessions(userId?: string | null) {
    const closedSessions = await this.dataSource.query(
      `SELECT id FROM jupeb_registration_sessions WHERE status = 'closed'`,
    );

    let total = 0;
    for (const s of closedSessions) {
      const res = await this.finalizeCandidateNumbers(s.id, userId);
      total += res.assigned_count;
    }

    return {
      total_assigned: total,
      sessions_count: closedSessions.length,
    };
  }

  async getCodeStatus(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) return { claimed: false, status: 'none' };

    const details = await this.dataSource.query(
      `SELECT r.status, p.first_name, p.last_name, u.name AS university_name
       FROM jupeb_registrations r
       LEFT JOIN profiles p ON p.user_id = r.user_id
       LEFT JOIN jupeb_universities u ON u.id = r.university_id
       WHERE r.id = $1`,
      [reg.id],
    );

    const d = details[0] || {};
    return {
      claimed: true,
      status: reg.status,
      first_name: d.first_name || null,
      last_name: d.last_name || null,
      university_name: d.university_name || null,
    };
  }

  async claimCode(code: string, userId: string) {
    const reg = await this.regRepo.findByCandidateCode(code);
    if (!reg) throw new NotFoundException('Invalid registration code');

    if (reg.userId && reg.userId !== userId) {
      throw new ConflictException('This code has already been claimed by another user');
    }

    const updated = await this.regRepo.updateById(reg.id, {
      userId,
      claimedAt: reg.claimedAt || new Date(),
      status: reg.status === RegistrationStatus.CODE_ISSUED ? RegistrationStatus.CLAIMED : reg.status,
    });

    await this.historyRepo.create({
      registrationId: reg.id,
      fromStatus: reg.status,
      toStatus: updated!.status,
      reason: 'Claimed by student',
      changedBy: userId,
    });

    return updated;
  }

  async getMeCurrent(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No active registration found for user');
    return this.institutionGetCandidate(reg.id, userId);
  }

  async getMeProfile(userId: string) {
    return this.getMeCurrent(userId);
  }

  async getMeSubmissionPreview(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    const details = await this.institutionGetCandidate(reg.id, userId);
    const docs = await this.docRepo.findByRegistrationId(reg.id);

    const profileCompleted = Boolean(details.first_name && details.last_name && details.email);
    const documentsCompleted = docs.length > 0;
    const biometricsCompleted = Boolean(details.has_biometrics);
    const subjectsConfirmed = Boolean(details.subject_combination_id);

    const missing: string[] = [];
    if (!profileCompleted) missing.push('Profile details');
    if (!documentsCompleted) missing.push('Supporting documents');
    if (!biometricsCompleted) missing.push('Biometric capture');
    if (!subjectsConfirmed) missing.push('Subject combination');

    return {
      registration_id: reg.id,
      profile_completed: profileCompleted,
      documents_completed: documentsCompleted,
      biometrics_completed: biometricsCompleted,
      subjects_confirmed: subjectsConfirmed,
      can_submit: missing.length === 0,
      missing_items: missing,
    };
  }

  async getMeExamResults(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    const results = await this.dataSource.query(
      `SELECT * FROM jupeb_registration_results WHERE registration_id = $1`,
      [reg.id],
    );
    const scores = await this.dataSource.query(
      `SELECT * FROM jupeb_registration_scores WHERE registration_id = $1`,
      [reg.id],
    );

    return {
      registration_id: reg.id,
      results,
      scores,
    };
  }

  async getMeSlip(userId: string) {
    const preview = await this.getMeSubmissionPreview(userId);
    return preview;
  }

  async downloadMeSlip(registrationId?: string, _token?: string): Promise<Buffer> {
    const preview = registrationId ? await this.institutionGetCandidate(registrationId) : {};
    return this.pdfService.renderRegistrationFormPdf(preview);
  }

  async updateAcademicIntake(dto: { subject_combination_id?: string }, userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    const updated = await this.regRepo.updateById(reg.id, {
      subjectCombinationId: dto.subject_combination_id || null,
    });
    return updated;
  }

  async patchMeProfile(dto: PatchCandidateDto, userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');
    return this.institutionPatchCandidate(reg.id, dto, userId);
  }

  async confirmSubjects(dto: ConfirmSubjectsDto, userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    const updated = await this.regRepo.updateById(reg.id, {
      subjectCombinationId: dto.subject_combination_id,
      status: RegistrationStatus.PENDING_DOCUMENTS,
    });

    await this.historyRepo.create({
      registrationId: reg.id,
      fromStatus: reg.status,
      toStatus: RegistrationStatus.PENDING_DOCUMENTS,
      reason: 'Subjects confirmed by candidate',
      changedBy: userId,
    });

    return updated;
  }

  async submit(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    const preview = await this.getMeSubmissionPreview(userId);
    if (!preview.can_submit) {
      throw new UnprocessableEntityException({
        message: 'Cannot submit incomplete registration',
        missing_items: preview.missing_items,
      });
    }

    const updated = await this.regRepo.setStatus(
      reg.id,
      RegistrationStatus.PENDING_INSTITUTION_REVIEW,
      'Submitted by candidate',
      userId,
    );

    await this.regRepo.updateById(reg.id, {
      submittedAt: new Date(),
    });

    await this.historyRepo.create({
      registrationId: reg.id,
      fromStatus: reg.status,
      toStatus: RegistrationStatus.PENDING_INSTITUTION_REVIEW,
      reason: 'Submitted by student for institution review',
      changedBy: userId,
    });

    return updated;
  }

  async dashboardAccess(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    return {
      unlocked: Boolean(reg.dashboardUnlockedAt || reg.status === RegistrationStatus.APPROVED),
      status: reg.status,
      unlocked_at: reg.dashboardUnlockedAt,
    };
  }
}
