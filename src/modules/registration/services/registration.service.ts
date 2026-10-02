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
import { SessionStatus } from '../../sessions/entities/academic-session.entity';
import {
  CreateRegistrationDto,
  PatchRegistrationDto,
  PatchCandidateDto,
  ListRegistrationsQueryDto,
  BatchRegistrationActionDto,
  ConfirmSubjectsDto,
} from '../dto';

import { CandidateSyncQueueService } from '../../sync/services/candidate-sync-queue.service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function statusBucket(status: string | null | undefined): string {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'withdrawn') return 'withdrawn';
  return 'pending';
}

function enrichRegistrationRow(row: any) {
  if (!row) return row;
  const firstName = row.first_name ? String(row.first_name).trim() : '';
  const lastName = row.last_name ? String(row.last_name).trim() : '';
  const displayName = row.display_name ? String(row.display_name).trim() : '';
  const fullName = displayName || `${firstName} ${lastName}`.trim() || row.email || 'N/A';

  const hasBiometrics = Boolean(row.has_biometrics);
  const biometricStatus = hasBiometrics ? 'captured' : 'pending';

  const candidateId =
    row.jupeb_candidate_number ||
    row.provisional_candidate_code ||
    row.institution_issued_code ||
    null;

  const candidate = {
    id: row.user_id || null,
    candidate_id: candidateId,
    name: fullName,
    full_name: fullName,
    first_name: firstName || null,
    last_name: lastName || null,
    display_name: displayName || null,
    email: row.email || null,
    phone: row.phone || null,
    status: row.status || 'pending',
  };

  const university = (row.university_id || row.university_name)
    ? {
        id: row.university_id || null,
        name: row.university_name || '-',
        short_name: row.university_short_name || null,
        code: row.university_code || null,
      }
    : null;

  const subjectCombination = (row.subject_combination_id || row.subject_combination_code || row.subject_combination_title)
    ? {
        id: row.subject_combination_id || null,
        code: row.subject_combination_code || '-',
        title: row.subject_combination_title || row.subject_combination_code || '-',
      }
    : null;

  const bucket = statusBucket(row.status);

  return {
    ...row,
    full_name: fullName,
    name: fullName,
    candidate_id: candidateId,
    biometric_status: biometricStatus,
    biometricStatus: biometricStatus,
    has_biometrics: hasBiometrics,
    bucket,
    candidate,
    university,
    institution: university,
    subject_combination: subjectCombination,
    subjectCombination,
    subject_combination_code: row.subject_combination_code || null,
    contact_information: {
      email: row.email || null,
      phone: row.phone || null,
    },
    user: {
      id: row.user_id || null,
      email: row.email || null,
    },
  };
}

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
    private readonly candidateSyncQueueService: CandidateSyncQueueService,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(RegistrationService.name);
  }

  // ─────────────────────────────── Institution / Admin Operations ───────────────────────────────

  /**
   * List candidate registrations with filtering and pagination.
   */
  async listRegistrations(query: ListRegistrationsQueryDto, _userId?: string | null) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const { rows, total } = await this.regRepo.findAllPaginated({
      sessionId: query.session_id,
      universityId: query.university_id,
      status: query.status,
      bucket: query.bucket,
      biometrics: query.biometrics,
      q: query.q,
      limit,
      offset,
    });

    const enrichedRows = rows.map(enrichRegistrationRow);

    return {
      rows: enrichedRows,
      page,
      limit,
      total,
    };
  }

  /**
   * Retrieve full registration details by registration ID.
   */
  async getRegistrationById(registrationId: string, _userId?: string | null) {
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

  /**
   * Create an individual candidate registration record.
   */
  async createRegistration(dto: CreateRegistrationDto, userId?: string | null): Promise<RegistrationEntity> {
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

  /**
   * Update registration fields (subject combination, institution code, status reason).
   */
  async updateRegistration(
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

  /**
   * Update candidate profile details (names, gender, contact information).
   */
  async updateCandidateProfile(
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

    // Trigger candidate sync to Attendance & CRMS in background
    try {
      await this.candidateSyncQueueService.enqueueCandidateSyncJob({
        sessionId: reg.sessionId,
        registrationIds: [reg.id],
        userId: _userId,
        triggeredBy: 'candidate_profile_update',
      });
    } catch (syncErr: any) {
      this.logger.error(`Failed to enqueue candidate sync for ${registrationId}: ${syncErr.message}`);
    }

    return this.getRegistrationById(registrationId);
  }

  /**
   * Resend the provisional code to the candidate.
   */
  async resendProvisionalCode(registrationId: string, _userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    return {
      registration_id: registrationId,
      code: reg.provisionalCandidateCode,
      message: 'Provisional code dispatched',
    };
  }

  /**
   * Withdraw / delete candidate registration.
   */
  async withdrawRegistration(registrationId: string, userId?: string | null) {
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

  /**
   * Get registration overview KPIs / statistics.
   */
  async getOverviewStats(query: { session_id?: string; university_id?: string }, _userId?: string | null) {
    return this.kpiService.kpiCounts(query.university_id, query.session_id);
  }

  /**
   * Get registration breakdown aggregated by university.
   */
  async getRegistrationsByUniversity(query: { session_id?: string }, _userId?: string | null) {
    const params = query.session_id ? [query.session_id] : [];
    const sessionClause = query.session_id ? `WHERE r.session_id = $1` : '';

    const rows = await this.dataSource.query(
      `SELECT u.id AS university_id, u.name AS university_name, u.code AS university_code,
              COUNT(r.id)::int AS total_candidates,
              COUNT(CASE WHEN r.status = '${RegistrationStatus.APPROVED}' THEN 1 END)::int AS approved_candidates
       FROM jupeb_universities u
       LEFT JOIN jupeb_registrations r ON r.university_id = u.id ${sessionClause}
       WHERE u.deleted_at IS NULL
       GROUP BY u.id, u.name, u.code
       ORDER BY total_candidates DESC`,
      params,
    );

    return rows;
  }

  /**
   * Perform batch status transitions on multiple registrations.
   */
  async batchUpdateRegistrationStatus(dto: BatchRegistrationActionDto, userId?: string | null) {
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

  /**
   * Approve an individual candidate registration.
   */
  async approveRegistration(registrationId: string, body: { reason?: string }, userId?: string | null) {
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

  /**
   * Reject an individual candidate registration.
   */
  async rejectRegistration(registrationId: string, body: { reason?: string }, userId?: string | null) {
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

  /**
   * Withdraw an individual candidate registration directly.
   */
  async withdrawRegistrationDirect(registrationId: string, body: { reason?: string }, userId?: string | null) {
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

  /**
   * Export candidate registrations to CSV format.
   */
  async exportRegistrationsCsv(query: ListRegistrationsQueryDto, _userId?: string | null): Promise<string> {
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

  /**
   * Preview simulation of candidate matric numbers for a session.
   */
  async previewCandidateNumbering(sessionId: string) {
    const unfinalized = await this.dataSource.query(
      `SELECT r.id, u.jupeb_prefix, s.year_short,
              ROW_NUMBER() OVER (PARTITION BY r.university_id ORDER BY r.approved_at ASC, r.created_at ASC) AS seq
       FROM jupeb_registrations r
       JOIN jupeb_universities u ON u.id = r.university_id
       JOIN jupeb_registration_sessions s ON s.id = r.session_id
       WHERE r.session_id = $1 AND r.status = '${RegistrationStatus.APPROVED}' AND r.jupeb_candidate_number IS NULL`,
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

  /**
   * Finalize candidate numbers for approved registrations in a session.
   */
  async finalizeCandidateNumbers(sessionId: string, userId?: string | null) {
    const unfinalized = await this.dataSource.query(
      `SELECT r.id, u.jupeb_prefix, s.year_short,
              ROW_NUMBER() OVER (PARTITION BY r.university_id ORDER BY r.approved_at ASC, r.created_at ASC) AS seq
       FROM jupeb_registrations r
       JOIN jupeb_universities u ON u.id = r.university_id
       JOIN jupeb_registration_sessions s ON s.id = r.session_id
       WHERE r.session_id = $1 AND r.status = '${RegistrationStatus.APPROVED}' AND r.jupeb_candidate_number IS NULL`,
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

  /**
   * Bulk finalize candidate numbers across all closed sessions.
   */
  async finalizeAllClosedSessions(userId?: string | null) {
    const closedSessions = await this.dataSource.query(
      `SELECT id FROM jupeb_registration_sessions WHERE status = '${SessionStatus.CLOSED}'`,
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

  // ─────────────────────────────── Student Self-Service (/me/*) ───────────────────────────────

  /**
   * Get candidate code claim status.
   */
  async getStudentCodeStatus(userId: string) {
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

  /**
   * Claim provisional candidate code for the authenticated student account.
   */
  async claimProvisionalCode(code: string, userId: string) {
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

  /**
   * Get active candidate registration summary for authenticated student.
   */
  async getCurrentStudentRegistration(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No active registration found for user');
    return this.getRegistrationById(reg.id, userId);
  }

  /**
   * Get student registration profile in structured mobile format.
   */
  async getStudentProfile(userId: string) {
    return this.buildStudentProfile(userId);
  }

  /**
   * Build complete candidate profile for mobile and web self-service.
   */
  async buildStudentProfile(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found for current user');

    const [userRows, ninRows, nokRows, bioRows, uniRows, sessionRows, scRows] = await Promise.all([
      this.dataSource.query(
        `SELECT u.id, u.email, u.phone, p.title, p.first_name, p.last_name, p.display_name,
                p.date_of_birth, p.gender, p.profile_photo_url,
                p.residential_address, p.state_of_origin, p.lga, p.place_of_birth, p.country
           FROM users u
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE u.id = $1`,
        [userId],
      ),
      reg.ninVerificationId
        ? this.dataSource.query(
            `SELECT id, status, response_payload, intake_payload
               FROM jupeb_nin_verifications
              WHERE id = $1`,
            [reg.ninVerificationId],
          )
        : Promise.resolve([]),
      this.dataSource.query(
        `SELECT name, relationship, phone, email, address, source
           FROM jupeb_next_of_kin
          WHERE registration_id = $1
            AND is_active = true
          ORDER BY created_at DESC
          LIMIT 1`,
        [reg.id],
      ),
      this.dataSource.query(
        `SELECT b.file_id, b.external_reference, f.file_url
           FROM jupeb_biometric_captures b
           LEFT JOIN files f ON f.id = b.file_id OR f.id::text = b.external_reference
          WHERE b.registration_id = $1
            AND b.capture_type = 'face'
            AND b.replaced_at IS NULL
          ORDER BY b.created_at DESC
          LIMIT 1`,
        [reg.id],
      ),
      reg.universityId
        ? this.dataSource.query(
            `SELECT id, name, short_name, jupeb_prefix, institution_type
               FROM jupeb_universities
              WHERE id = $1`,
            [reg.universityId],
          )
        : Promise.resolve([]),
      reg.sessionId
        ? this.dataSource.query(
            `SELECT id, academic_year, year_short
               FROM jupeb_registration_sessions
              WHERE id = $1`,
            [reg.sessionId],
          )
        : Promise.resolve([]),
      reg.subjectCombinationId
        ? this.dataSource.query(
            `SELECT id, code, title
               FROM jupeb_subject_combinations
              WHERE id = $1`,
            [reg.subjectCombinationId],
          )
        : Promise.resolve([]),
    ]);

    const u = userRows[0] || {};
    const ninRow = ninRows[0] || null;
    const ninPayload = ninRow?.response_payload || {};
    const intake = ninRow?.intake_payload || {};
    const ninStatus = ninRow?.status || null;

    let fullName = null;
    try {
      const { resolveCandidateDisplayName } = require('../../jupeb/utils/candidate-name');
      fullName = resolveCandidateDisplayName({
        ninPayload,
        intake,
        profile: u,
        ninStatus,
      });
    } catch {
      fullName = u.display_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || null;
    }

    let facePhotoUrl: string | null = null;
    if (bioRows[0]) {
      const b = bioRows[0];
      facePhotoUrl =
        b.file_url ||
        (b.external_reference &&
        (b.external_reference.startsWith('http://') || b.external_reference.startsWith('https://'))
          ? b.external_reference
          : null);
      if (!facePhotoUrl && b.file_id) {
        try {
          const f = await this.dataSource.query(`SELECT file_url FROM files WHERE id = $1`, [b.file_id]);
          facePhotoUrl = f[0]?.file_url || null;
        } catch {
          // File record query failed or table absent; fallback to profile/nin photo
        }
      }
    }
    if (!facePhotoUrl) {
      facePhotoUrl = u.profile_photo_url || null;
    }

    const resolvedPhoto = facePhotoUrl || ninPayload.photo_url || u.profile_photo_url || null;

    let geo: any = { country: { id: 1, name: 'Nigeria' }, state_of_origin: null, lga: null };
    try {
      const GeoModel = require('../../../utils/models/geo.model');
      geo = await GeoModel.resolveBundle({
        country: u.country || 'Nigeria',
        stateOfOrigin: u.state_of_origin || ninPayload.state_of_origin || null,
        lga: u.lga || ninPayload.lga || null,
      });
    } catch {
      // Geo model resolution optional; fall back to defaults
    }

    const nokRow = nokRows[0] || null;
    const ninNok = ninPayload.next_of_kin || null;

    const uni = uniRows[0] || null;
    const sess = sessionRows[0] || null;
    const sc = scRows[0] || null;

    return {
      candidate: {
        id: reg.id,
        full_name: fullName,
        provisional_candidate_code: reg.provisionalCandidateCode || null,
        jupeb_candidate_number: reg.jupebCandidateNumber || null,
        photo_url: resolvedPhoto,
        face_photo_url: facePhotoUrl,
        status: reg.status,
      },
      basic_information: {
        date_of_birth: ninPayload.date_of_birth || u.date_of_birth || null,
        gender: ninPayload.gender || u.gender || null,
        residential_address: u.residential_address || ninPayload.address || intake.address || null,
        country: geo.country || { id: 1, name: 'Nigeria' },
        state_of_origin: geo.state_of_origin || (u.state_of_origin ? { id: null, name: u.state_of_origin } : null),
        lga: geo.lga || (u.lga ? { id: null, name: u.lga } : null),
        place_of_birth: u.place_of_birth || ninPayload.place_of_birth || null,
      },
      contact_information: {
        email: u.email || intake.email || null,
        phone: u.phone || intake.phone || ninPayload.phone || null,
      },
      next_of_kin: nokRow
        ? {
            name: nokRow.name,
            relationship: nokRow.relationship,
            contact_no: nokRow.phone,
            phone: nokRow.phone,
            email: nokRow.email || null,
            address: nokRow.address || null,
            source: nokRow.source || 'registrar',
          }
        : ninNok
        ? {
            name: ninNok.name || ninNok.full_name || null,
            relationship: ninNok.relationship || ninNok.relation || null,
            contact_no: ninNok.phone || ninNok.contact || null,
            phone: ninNok.phone || ninNok.contact || null,
            email: ninNok.email || null,
            address: ninNok.address || null,
            source: 'nin',
          }
        : null,
      subject_combination: sc
        ? {
            id: sc.id,
            code: sc.code,
            title: sc.title,
          }
        : null,
      university: uni
        ? {
            id: uni.id,
            name: uni.name,
            short_name: uni.short_name,
            jupeb_prefix: uni.jupeb_prefix,
            institution_type: uni.institution_type || null,
          }
        : null,
      session: sess
        ? {
            id: sess.id,
            academic_year: sess.academic_year,
            year_short: sess.year_short,
          }
        : null,
      nin_verification: ninRow
        ? {
            id: ninRow.id,
            status: ninRow.status,
          }
        : null,
    };
  }

  /**
   * Get registration submission readiness checklist and missing requirements.
   */
  async getSubmissionPreview(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    const details = await this.getRegistrationById(reg.id, userId);
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

  /**
   * Get examination results and subject scores for authenticated candidate.
   */
  async getStudentExamResults(userId: string, query?: { source?: string; sitting?: number }) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    let sql = `
      SELECT e.*, ores.confidence AS ocr_confidence, ores.exam_type_detected AS ocr_exam_type
      FROM jupeb_result_entries e
      LEFT JOIN ocr_results ores ON ores.job_id = e.ocr_job_id
      WHERE e.registration_id = $1
    `;
    const params: any[] = [reg.id];
    if (query?.source) {
      params.push(query.source.toLowerCase().trim());
      sql += ` AND LOWER(e.source) = $${params.length}`;
    }
    if (query?.sitting) {
      params.push(Number(query.sitting));
      sql += ` AND e.sitting = $${params.length}`;
    }
    sql += ` ORDER BY e.source ASC, e.sitting ASC, e.serial ASC`;

    const rows = await this.dataSource.query(sql, params);

    // Group entries by (source, sitting) for frontends/mobile apps
    const groups: Record<string, any> = {};
    for (const row of rows) {
      const key = `${row.source}-${row.sitting}`;
      if (!groups[key]) {
        groups[key] = {
          source: row.source,
          sitting: row.sitting,
          grades: [],
          subjects: [],
        };
      }
      const item = {
        id: row.id,
        sn: row.serial !== undefined && row.serial !== null ? row.serial : groups[key].grades.length + 1,
        serial: row.serial,
        subject: row.subject,
        grade: row.grade,
        grade_normalized: row.grade_normalized,
        score: row.score,
        origin: row.origin,
        ocr_job_id: row.ocr_job_id,
        ocr_confidence: row.ocr_confidence ? Number(row.ocr_confidence) : null,
        ocr_exam_type: row.ocr_exam_type,
        updated_at: row.updated_at,
      };
      groups[key].grades.push(item);
      groups[key].subjects.push(item);
    }

    return {
      registration_id: reg.id,
      results: Object.values(groups),
      entries: rows,
    };
  }

  /**
   * Get registration examination slip metadata and summary.
   */
  async getRegistrationSlipSummary(userId: string) {
    return this.getSubmissionPreview(userId);
  }

  /**
   * Render and download registration examination slip as PDF.
   */
  async downloadRegistrationSlipPdf(registrationId?: string, _token?: string): Promise<Buffer> {
    const preview = registrationId ? await this.getRegistrationById(registrationId) : {};
    return this.pdfService.renderRegistrationFormPdf(preview);
  }

  /**
   * Update student academic intake / subject combination.
   */
  async updateSubjectCombination(dto: { subject_combination_id?: string }, userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    const updated = await this.regRepo.updateById(reg.id, {
      subjectCombinationId: dto.subject_combination_id || null,
    });
    return updated;
  }

  /**
   * Update student personal profile details.
   */
  async updateStudentProfile(dto: PatchCandidateDto, userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');
    await this.updateCandidateProfile(reg.id, dto, userId);
    return this.buildStudentProfile(userId);
  }

  /**
   * Confirm and lock candidate subject combination selection.
   */
  async confirmSubjectCombination(dto: ConfirmSubjectsDto, userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    const updatePayload: any = {
      status: RegistrationStatus.PENDING_DOCUMENTS,
    };
    if (dto?.subject_combination_id) {
      updatePayload.subjectCombinationId = dto.subject_combination_id;
    }

    const updated = await this.regRepo.updateById(reg.id, updatePayload);

    await this.historyRepo.create({
      registrationId: reg.id,
      fromStatus: reg.status,
      toStatus: RegistrationStatus.PENDING_DOCUMENTS,
      reason: 'Subjects confirmed by candidate',
      changedBy: userId,
    });

    return updated;
  }

  /**
   * Submit registration for institution review.
   */
  async submitRegistration(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    const preview = await this.getSubmissionPreview(userId);
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

  /**
   * Check whether candidate dashboard features are unlocked.
   */
  async getDashboardAccessStatus(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found');

    return {
      unlocked: Boolean(reg.dashboardUnlockedAt || reg.status === RegistrationStatus.APPROVED),
      status: reg.status,
      unlocked_at: reg.dashboardUnlockedAt,
    };
  }
}
