import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  HttpException,
  HttpStatus,
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
import { InstitutionUserScopeService } from './institution-user-scope.service';
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

import { EventEmitter2 } from '@nestjs/event-emitter';
import { CandidateSyncQueueService } from '../../sync/services/candidate-sync-queue.service';
import { SyncEvent } from '../../sync/constants/sync-events.enum';
import { RegistrationEvent } from '../constants/registration-events.enum';
import {
  formatProvisionalCandidateCode,
  generateUniqueInstitutionCode,
  institutionCodeExpiresAt,
} from '../utils/registration-numbering';


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
  const middleName = row.middle_name ? String(row.middle_name).trim() : '';
  const lastName = row.last_name ? String(row.last_name).trim() : '';
  let displayName = row.display_name ? String(row.display_name).trim() : '';

  if (middleName && firstName && lastName) {
    if (!displayName || displayName.toLowerCase() === `${firstName} ${lastName}`.toLowerCase()) {
      displayName = `${firstName} ${middleName} ${lastName}`;
    } else if (!displayName.toLowerCase().includes(middleName.toLowerCase())) {
      displayName = [firstName, middleName, lastName].filter(Boolean).join(' ');
    }
  } else if (!displayName) {
    displayName = [firstName, middleName, lastName].filter(Boolean).join(' ');
  }

  const fullName = displayName || [firstName, middleName, lastName].filter(Boolean).join(' ') || row.email || 'N/A';

  const hasBiometrics = Boolean(row.has_biometrics);
  const biometricStatus = hasBiometrics ? 'captured' : 'pending';

  const candidateId =
    row.jupeb_candidate_number ||
    row.provisional_candidate_code ||
    row.institution_issued_code ||
    null;

  let nextOfKin: any = null;
  if (row.next_of_kin) {
    if (typeof row.next_of_kin === 'string') {
      try {
        nextOfKin = JSON.parse(row.next_of_kin);
      } catch {
        nextOfKin = null;
      }
    } else if (typeof row.next_of_kin === 'object') {
      nextOfKin = row.next_of_kin;
    }
  }
  if (nextOfKin && !nextOfKin.name && !nextOfKin.phone && !nextOfKin.email && !nextOfKin.address) {
    nextOfKin = null;
  }
  if (!nextOfKin) {
    const ninNok = row.nin_nok || (row.nin_payload && (row.nin_payload.next_of_kin || row.nin_payload.next_of_kin_record)) || null;
    const intakeNok = row.intake_nok || (row.nin_intake && row.nin_intake.next_of_kin) || null;
    const nokObj = (ninNok && typeof ninNok === 'object' ? ninNok : null) || (intakeNok && typeof intakeNok === 'object' ? intakeNok : null);
    if (nokObj) {
      const resolvedName =
        [nokObj.firstname, nokObj.middlename, nokObj.surname, nokObj.first_name, nokObj.middle_name, nokObj.last_name].filter(Boolean).join(' ') ||
        nokObj.name ||
        nokObj.full_name ||
        null;
      const resolvedPhone = nokObj.telephoneno || nokObj.phone || nokObj.nok_phone || nokObj.contact || null;
      const resolvedEmail = nokObj.email || nokObj.nok_email || null;
      const resolvedAddress =
        [nokObj.address1, nokObj.address2, nokObj.lga, nokObj.state].filter(Boolean).join(', ') ||
        nokObj.address ||
        nokObj.nok_address ||
        null;
      if (resolvedName || resolvedPhone || resolvedEmail || resolvedAddress) {
        nextOfKin = {
          name: resolvedName,
          relationship: nokObj.relationship || nokObj.nok_relationship || null,
          phone: resolvedPhone,
          email: resolvedEmail,
          address: resolvedAddress,
          source: 'nin',
        };
      }
    }
  }

  const capturedPhotoUrl =
    row.captured_photo_url ||
    row.face_photo_url ||
    row.captured_photo ||
    null;
  const photoUrl = capturedPhotoUrl || row.profile_photo_url || row.photo_url || null;

  const candidate = {
    id: row.user_id || null,
    candidate_id: candidateId,
    name: fullName,
    full_name: fullName,
    first_name: firstName || null,
    middle_name: middleName || null,
    last_name: lastName || null,
    display_name: displayName || null,
    email: row.email || null,
    phone: row.phone || null,
    photo_url: photoUrl,
    profile_photo_url: photoUrl,
    face_photo_url: capturedPhotoUrl,
    captured_photo: capturedPhotoUrl,
    captured_photo_url: capturedPhotoUrl,
    next_of_kin: nextOfKin,
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
    first_name: firstName || null,
    middle_name: middleName || null,
    last_name: lastName || null,
    display_name: displayName || null,
    full_name: fullName,
    name: fullName,
    candidate_id: candidateId,
    biometric_status: biometricStatus,
    biometricStatus: biometricStatus,
    has_biometrics: hasBiometrics,
    photo_url: photoUrl,
    profile_photo_url: photoUrl,
    face_photo_url: capturedPhotoUrl,
    captured_photo: capturedPhotoUrl,
    captured_photo_url: capturedPhotoUrl,
    next_of_kin: nextOfKin,
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
    private readonly scopeService: InstitutionUserScopeService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(RegistrationService.name);
  }

  async cleanupStudentByEmail(
    rawEmail?: string,
    rawRegistrationId?: string,
  ): Promise<void> {
    let email = String(rawEmail || '').trim().toLowerCase();
    const registrationId = String(rawRegistrationId || '').trim();
    if (Boolean(email) === Boolean(registrationId)) {
      throw new BadRequestException('Provide either email or registration_id');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email is required');
    }
    if (registrationId && !UUID_REGEX.test(registrationId)) {
      throw new BadRequestException('registration_id must be a valid UUID');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const requestedRegistrations: {
        id: string;
        user_id: string | null;
        nin_verification_id: string | null;
        email: string | null;
      }[] = registrationId
        ? await queryRunner.query(
            `SELECT r.id, r.user_id, r.nin_verification_id, u.email
             FROM jupeb_registrations r
             LEFT JOIN users u ON u.id = r.user_id
             WHERE r.id = $1`,
            [registrationId],
          )
        : [];
      if (!email && requestedRegistrations[0]?.email) {
        email = requestedRegistrations[0].email.trim().toLowerCase();
      }
      const requestedRegistrationIds = requestedRegistrations.map((row) => row.id);
      const requestedUserIds = requestedRegistrations
        .map((row) => row.user_id)
        .filter(Boolean);
      const requestedNinIds = requestedRegistrations
        .map((row) => row.nin_verification_id)
        .filter(Boolean);

      const users: { id: string; phone: string | null }[] = await queryRunner.query(
        `SELECT u.id, u.phone
         FROM users u
         WHERE (LOWER(u.email) = NULLIF($1, '') OR u.id = ANY($2::uuid[]))
           AND EXISTS (
             SELECT 1
             FROM jupeb_registrations r
             WHERE r.user_id = u.id
             UNION ALL
             SELECT 1
             FROM jupeb_nin_verifications nv
             WHERE nv.requested_by = u.id
               OR LOWER(nv.intake_payload->>'email') = NULLIF($1, '')
               OR LOWER(nv.response_payload->>'email') = NULLIF($1, '')
             UNION ALL
             SELECT 1
             FROM user_roles ur_s
             JOIN roles r_s ON r_s.id = ur_s.role_id
             WHERE ur_s.user_id = u.id
               AND r_s.name = 'student'
               AND (ur_s.expires_at IS NULL OR ur_s.expires_at > NOW())
           )
           AND NOT EXISTS (
             SELECT 1
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id
               AND r.name IN ('admin', 'super_admin', 'registrar', 'institution_admin', 'financial_admin')
               AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
           )`,
          [email, requestedUserIds],
      );
      const userIds = users.map((user) => user.id);
      const phoneNumbers = users.map((user) => user.phone).filter(Boolean);

      const ninRows: { id: string }[] = await queryRunner.query(
        `SELECT id
         FROM jupeb_nin_verifications
         WHERE LOWER(intake_payload->>'email') = NULLIF($1, '')
            OR LOWER(response_payload->>'email') = NULLIF($1, '')
            OR requested_by = ANY($2::uuid[])
            OR id = ANY($3::uuid[])`,
        [email, userIds, requestedNinIds],
      );
      const ninIds = ninRows.map((row) => row.id);

      const registrationRows: { id: string }[] = await queryRunner.query(
        `SELECT id
         FROM jupeb_registrations
         WHERE id = ANY($1::uuid[])
          OR user_id = ANY($2::uuid[])
          OR nin_verification_id = ANY($3::uuid[])`,
        [requestedRegistrationIds, userIds, ninIds],
      );
      const registrationIds = registrationRows.map((row) => row.id);
      const registrationIdStrings = registrationIds.map(String);

      const ticketRows: { id: string }[] = await queryRunner.query(
        `SELECT id
         FROM support_tickets
         WHERE user_id = ANY($1::uuid[])
            OR registration_id = ANY($2::uuid[])`,
        [userIds, registrationIds],
      );
      const ticketIds = ticketRows.map((row) => row.id);

      await queryRunner.query(
        `DELETE FROM jupeb_payment_reconciliations
         WHERE registration_id = ANY($1::uuid[])
            OR payment_id IN (
              SELECT id FROM payments
              WHERE registration_id = ANY($1::uuid[]) OR user_id = ANY($2::uuid[])
            )`,
        [registrationIds, userIds],
      );
      await queryRunner.query(
        `DELETE FROM payments
         WHERE registration_id = ANY($1::uuid[]) OR user_id = ANY($2::uuid[])`,
        [registrationIds, userIds],
      );

      if (ticketIds.length || userIds.length) {
        await queryRunner.query(
          `DELETE FROM support_ticket_messages
           WHERE ticket_id = ANY($1::uuid[]) OR sender_id = ANY($2::uuid[])`,
          [ticketIds, userIds],
        );
      }
      if (ticketIds.length) {
        await queryRunner.query(
          `DELETE FROM support_tickets WHERE id = ANY($1::uuid[])`,
          [ticketIds],
        );
      }

      if (registrationIds.length) {
        await queryRunner.query(
          `DELETE FROM jupeb_biometric_captures WHERE registration_id = ANY($1::uuid[])`,
          [registrationIds],
        );
        await queryRunner.query(
          `DELETE FROM jupeb_registration_documents WHERE registration_id = ANY($1::uuid[])`,
          [registrationIds],
        );
        await queryRunner.query(
          `DELETE FROM jupeb_registration_status_history WHERE registration_id = ANY($1::uuid[])`,
          [registrationIds],
        );
        await queryRunner.query(
          `DELETE FROM jupeb_registration_results WHERE registration_id = ANY($1::uuid[])`,
          [registrationIds],
        );
        await queryRunner.query(
          `DELETE FROM jupeb_registration_scores WHERE registration_id = ANY($1::uuid[])`,
          [registrationIds],
        );
        await queryRunner.query(
          `DELETE FROM jupeb_result_entries WHERE registration_id = ANY($1::uuid[])`,
          [registrationIds],
        );
        await queryRunner.query(
          `DELETE FROM jupeb_next_of_kin WHERE registration_id = ANY($1::uuid[])`,
          [registrationIds],
        );
        await queryRunner.query(
          `DELETE FROM ocr_results
           WHERE job_id IN (
             SELECT id FROM ocr_jobs WHERE metadata->>'registration_id' = ANY($1::text[])
           )`,
          [registrationIdStrings],
        );
        await queryRunner.query(
          `DELETE FROM ocr_jobs WHERE metadata->>'registration_id' = ANY($1::text[])`,
          [registrationIdStrings],
        );
        await queryRunner.query(
          `DELETE FROM jupeb_registrations WHERE id = ANY($1::uuid[])`,
          [registrationIds],
        );
      }

      if (userIds.length) {
        await queryRunner.query(
          `DELETE FROM jupeb_registration_status_history WHERE changed_by = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM jupeb_result_entries WHERE created_by = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM jupeb_nin_verifications WHERE requested_by = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM user_universities WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM user_permissions WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM user_preferences WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM social_accounts WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM password_resets WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM verification_tokens WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM otp_codes WHERE LOWER(email) = $1 OR phone = ANY($2::text[])`,
          [email, phoneNumbers],
        );
        await queryRunner.query(
          `DELETE FROM notifications WHERE user_id = ANY($1::uuid[]) OR actor_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM api_keys WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM webhooks WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM admin_audit_logs WHERE admin_user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM files WHERE uploaded_by = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM post_comment_likes WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM post_comments WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM post_likes WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM post_media
           WHERE post_id IN (
             SELECT id FROM posts WHERE user_id = ANY($1::uuid[])
           )`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM posts WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM profiles WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        );
        await queryRunner.query(
          `DELETE FROM users WHERE id = ANY($1::uuid[])`,
          [userIds],
        );
      }

      await queryRunner.query(
        `DELETE FROM jupeb_nin_verifications
         WHERE ($1 <> '' AND (
           LOWER(intake_payload->>'email') = $1
           OR LOWER(response_payload->>'email') = $1
         ))
            OR id = ANY($2::uuid[])
            OR id = ANY($3::uuid[])`,
        [email, ninIds, requestedNinIds],
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async resolveEffectiveUniversityId(
    userId?: string | null,
    rawUniversityId?: string | null,
  ): Promise<string | null> {
    if (!userId) return rawUniversityId || null;
    return this.scopeService.effectiveUniversityId(userId, rawUniversityId || null);
  }

  private async assertUniversityAccess(
    userId: string | null | undefined,
    universityId: string,
  ): Promise<void> {
    if (!userId) return;
    return this.scopeService.assertUniversityAccess(userId, universityId);
  }

  // ─────────────────────────────── Institution / Admin Operations ───────────────────────────────

  /**
   * List candidate registrations with filtering and pagination.
   */
  async listRegistrations(query: ListRegistrationsQueryDto, userId?: string | null) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const searchTerm = query.q || query.search || query.query || query.keyword;
    const scopedUniversityId = await this.resolveEffectiveUniversityId(userId, query.university_id);

    const { rows, total } = await this.regRepo.findAllPaginated({
      sessionId: query.session_id,
      universityId: scopedUniversityId || undefined,
      status: query.status,
      bucket: query.bucket,
      biometrics: query.biometrics,
      q: searchTerm,
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
  async getRegistrationById(registrationId: string, userId?: string | null) {
    if (!UUID_REGEX.test(registrationId)) throw new UnprocessableEntityException('Invalid registration ID');
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    await this.assertUniversityAccess(userId, reg.universityId || (reg as any).university_id);

    const [detailsRows, nokRows, resultRows, docRows, bioRows, historyRows, subjectItemRows] = await Promise.all([
      this.dataSource.query(
        `SELECT r.*,
                u.name AS university_name, u.code AS university_code, u.short_name AS university_short_name,
                u.jupeb_prefix AS university_jupeb_prefix,
                s.academic_year AS session_academic_year, s.year_short AS session_year_short,
                p.first_name, p.last_name, p.display_name, p.gender, p.date_of_birth, p.profile_photo_url,
                p.residential_address, p.state_of_origin, p.lga, p.place_of_birth,
                c.name AS country,
                usr.email, usr.phone, usr.email_verified, usr.phone_verified, usr.last_login_at,
                nv.id AS nin_id,
                nv.nin_last4, nv.status AS nin_status, nv.response_payload AS nin_payload, nv.intake_payload AS nin_intake,
                sc.code AS subject_combination_code, sc.title AS subject_combination_title
         FROM jupeb_registrations r
         LEFT JOIN jupeb_universities u ON u.id = r.university_id
         LEFT JOIN jupeb_registration_sessions s ON s.id = r.session_id
         LEFT JOIN users usr ON usr.id = r.user_id
         LEFT JOIN profiles p ON p.user_id = r.user_id
         LEFT JOIN countries c ON p.country_id = c.id
         LEFT JOIN jupeb_nin_verifications nv ON nv.id = r.nin_verification_id
         LEFT JOIN jupeb_subject_combinations sc ON sc.id = r.subject_combination_id
         WHERE r.id = $1`,
        [registrationId],
      ),
      this.dataSource.query(
        `SELECT id, registration_id, name, relationship, phone, email, address, source, created_at, updated_at
         FROM jupeb_next_of_kin
         WHERE registration_id = $1
          AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [registrationId],
      ).catch(() => []),
      this.dataSource.query(
        `SELECT id, registration_id, source, sitting, serial, subject, grade, grade_normalized, score, origin, created_at, updated_at
         FROM jupeb_result_entries
         WHERE registration_id = $1
         ORDER BY sitting ASC, serial ASC`,
        [registrationId],
      ).catch(() => []),
      this.docRepo.findByRegistrationId(registrationId).catch(() => []),
      this.dataSource.query(
        `SELECT b.id, b.registration_id, b.capture_type, b.file_id, b.external_reference, b.quality_score, b.device_metadata, b.captured_at, b.created_at, f.file_url
         FROM jupeb_biometric_captures b
         LEFT JOIN files f ON f.id = b.file_id OR f.id::text = b.external_reference
         WHERE b.registration_id = $1 AND b.replaced_at IS NULL
         ORDER BY b.created_at DESC`,
        [registrationId],
      ).catch(() => []),
      this.historyRepo.findByRegistrationId(registrationId).catch(() => []),
      this.dataSource
        .query(
          `SELECT i.id, i.position, i.subject_id, s.code, s.name
             FROM jupeb_subject_combination_items i
             JOIN jupeb_subjects s ON s.id = i.subject_id
            WHERE i.combination_id = $1
            ORDER BY i.position ASC`,
          [reg.subjectCombinationId],
        )
        .catch(() => []),
    ]);

    const row = detailsRows[0] || {};
    const ninPayload = row.nin_payload || {};
    const ninIntake = row.nin_intake || {};
    const ninStatus = row.nin_status || null;

    // Resolve signed/public file URLs for submitted documents so reviewers can preview them.
    const documentFileIds = (docRows as any[]).map((d) => d.fileId || d.file_id).filter(Boolean);
    const documentUrlMap = new Map<string, string>();
    if (documentFileIds.length) {
      const fileRows = await this.dataSource
        .query(`SELECT id, file_url FROM files WHERE id = ANY($1::uuid[])`, [documentFileIds])
        .catch(() => []);
      for (const f of fileRows) documentUrlMap.set(f.id, f.file_url);
    }
    const documents = (docRows as any[]).map((d) => ({
      id: d.id,
      requirement_id: d.requirementId ?? d.requirement_id ?? null,
      status: d.status,
      file_id: d.fileId ?? d.file_id ?? null,
      source: d.source ?? null,
      sitting: d.sitting ?? null,
      download_url: documentUrlMap.get(d.fileId || d.file_id) || null,
      review_note: d.reviewNote ?? d.review_note ?? null,
      reviewed_at: d.reviewedAt ?? d.reviewed_at ?? null,
      reviewed_by: d.reviewedBy ?? d.reviewed_by ?? null,
      created_at: d.createdAt ?? d.created_at ?? null,
      updated_at: d.updatedAt ?? d.updated_at ?? null,
    }));

    // Demographic resolution with NIN fallback. Names honor the verified-vs-pending
    // precedence used by `resolveCandidateDisplayName`: when NIN is verified the
    // provider response is authoritative, otherwise fall back to the institution-typed
    // intake payload (the only place names exist before the candidate claims the code).
    const residentialAddress =
      row.residential_address ||
      ninIntake.residential_address ||
      ninIntake.address ||
      ninPayload.residence_address ||
      ninPayload.residential_address ||
      ninPayload.address ||
      null;
    const stateOfOrigin =
      row.state_of_origin || ninPayload.state_of_origin || ninPayload.origin_state || ninIntake.state_of_origin || ninIntake.state || null;
    const lga = row.lga || ninPayload.lga || ninPayload.lga_of_origin || ninPayload.origin_lga || ninIntake.lga || null;
    const placeOfBirth =
      row.place_of_birth || ninPayload.place_of_birth || ninPayload.birth_place || ninIntake.place_of_birth || null;
    const middleName =
      ninStatus === 'verified' && (ninPayload.middle_name || ninPayload.middlename || ninPayload.middleName)
        ? String(ninPayload.middle_name || ninPayload.middlename || ninPayload.middleName).trim()
        : ninPayload.middle_name || ninPayload.middlename || ninPayload.middleName || ninIntake.middle_name || ninIntake.middlename || null;

    const firstName =
      ninStatus === 'verified' && ninPayload.first_name
        ? String(ninPayload.first_name).trim()
        : row.first_name || ninIntake.first_name || ninPayload.first_name || ninPayload.firstname || null;
    const lastName =
      ninStatus === 'verified' && ninPayload.last_name
        ? String(ninPayload.last_name).trim()
        : row.last_name || ninIntake.last_name || ninPayload.last_name || ninPayload.surname || null;
    let displayName: string | null = null;
    try {
      const { resolveCandidateDisplayName } = require('../../jupeb/utils/candidate-name');
      displayName = resolveCandidateDisplayName({
        ninPayload,
        intake: ninIntake,
        profile: {
          first_name: row.first_name,
          middle_name: middleName,
          last_name: row.last_name,
          display_name: row.display_name,
        },
        ninStatus,
      });
    } catch {
      displayName =
        row.display_name ||
        [firstName, middleName, lastName].filter(Boolean).join(' ') ||
        ninIntake.name ||
        null;
    }
    const gender = row.gender || ninPayload.gender || ninIntake.gender || null;
    const dateOfBirth = row.date_of_birth || ninPayload.date_of_birth || ninPayload.birthdate || ninIntake.date_of_birth || ninIntake.birthdate || null;
    const email = row.email || ninIntake.email || null;
    const phone = row.phone || ninIntake.phone || ninPayload.phone || null;
    const faceBio = bioRows.find((b: any) => b.capture_type === 'face');
    let facePhotoUrl = faceBio?.file_url || null;
    if (!facePhotoUrl && faceBio?.external_reference) {
      if (faceBio.external_reference.startsWith('http://') || faceBio.external_reference.startsWith('https://')) {
        facePhotoUrl = faceBio.external_reference;
      }
    }
    const profilePhotoUrl =
      facePhotoUrl ||
      row.profile_photo_url ||
      ninPayload.photo_url ||
      null;

    // Next of kin resolution
    let nextOfKin = nokRows[0] || null;
    if (nextOfKin && !nextOfKin.name && !nextOfKin.phone && !nextOfKin.email && !nextOfKin.address) {
      nextOfKin = null;
    }
    if (!nextOfKin) {
      const nok =
        (ninPayload.next_of_kin && typeof ninPayload.next_of_kin === 'object' ? ninPayload.next_of_kin : null) ||
        (ninPayload.next_of_kin_record && typeof ninPayload.next_of_kin_record === 'object' ? ninPayload.next_of_kin_record : null) ||
        (ninIntake.next_of_kin && typeof ninIntake.next_of_kin === 'object' ? ninIntake.next_of_kin : null);

      if (nok) {
        const resolvedName =
          [nok.firstname, nok.middlename, nok.surname, nok.first_name, nok.middle_name, nok.last_name].filter(Boolean).join(' ') ||
          nok.name ||
          nok.full_name ||
          null;
        const resolvedPhone = nok.telephoneno || nok.phone || nok.nok_phone || nok.contact || null;
        const resolvedEmail = nok.email || nok.nok_email || null;
        const resolvedAddress =
          [nok.address1, nok.address2, nok.lga, nok.state].filter(Boolean).join(', ') ||
          nok.address ||
          nok.nok_address ||
          null;

        if (resolvedName || resolvedPhone || resolvedEmail || resolvedAddress) {
          nextOfKin = {
            registration_id: registrationId,
            name: resolvedName,
            relationship: nok.relationship || nok.nok_relationship || null,
            phone: resolvedPhone,
            email: resolvedEmail,
            address: resolvedAddress,
            source: 'nin',
          };

          this.dataSource
            .query(
              `INSERT INTO jupeb_next_of_kin (registration_id, name, relationship, phone, email, address, source, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, 'nin', NOW(), NOW())
               ON CONFLICT (registration_id) WHERE (deleted_at IS NULL) DO NOTHING`,
              [
                registrationId,
                nextOfKin.name || 'Next of Kin',
                nextOfKin.relationship || 'Guardian',
                nextOfKin.phone,
                nextOfKin.email,
                nextOfKin.address,
              ],
            )
            .catch(() => {});
        }
      }
    }

    // Group result entries by examination type (e.g. WAEC, NECO, NABTEB) & sitting
    const resultsByExam: Record<string, any[]> = {};
    for (const r of resultRows) {
      const key = `${r.source || 'O-Level'}${r.sitting ? ` Sitting ${r.sitting}` : ''}`;
      if (!resultsByExam[key]) resultsByExam[key] = [];
      resultsByExam[key].push(r);
    }

    const candidateId =
      row.jupeb_candidate_number ||
      row.provisional_candidate_code ||
      row.institution_issued_code ||
      null;

    const candidateObj = {
      id: row.user_id || null,
      name: displayName,
      candidate_id: candidateId,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      display_name: displayName,
      full_name: displayName,
      gender,
      date_of_birth: dateOfBirth,
      email,
      phone,
      email_verified: row.email_verified ?? null,
      phone_verified: row.phone_verified ?? null,
      last_login_at: row.last_login_at || null,
      profile_photo_url: profilePhotoUrl,
      photo_url: profilePhotoUrl,
      face_photo_url: facePhotoUrl,
      captured_photo: facePhotoUrl,
      captured_photo_url: facePhotoUrl,
      nin_photo_url: ninPayload.photo_url || null,
      residential_address: residentialAddress,
      state_of_origin: stateOfOrigin,
      lga,
      place_of_birth: placeOfBirth,
      country: row.country || 'Nigeria',
      next_of_kin: nextOfKin,
    };

    const hasFace = bioRows.some((b: any) => b.capture_type === 'face') || Boolean(row.face_skipped_at);
    const hasFingerprint =
      bioRows.some((b: any) => b.capture_type === 'fingerprint') || Boolean(row.fingerprint_skipped_at);
    const biometricSkips = {
      face: Boolean(row.face_skipped_at),
      fingerprint: Boolean(row.fingerprint_skipped_at),
    };

    const subjectCombination = row.subject_combination_id
      ? {
          id: row.subject_combination_id,
          code: row.subject_combination_code || '-',
          title: row.subject_combination_title || row.subject_combination_code || '-',
          subject_items: subjectItemRows,
        }
      : null;

    // Never expose the raw NIN provider/intake payloads (contain the NIN and other
    // PII) on the detail response — only the resolved fields above.
    const rawBase: Record<string, any> = { ...(detailsRows[0] || reg) };
    delete rawBase.nin_payload;
    delete rawBase.nin_intake;

    return {
      ...rawBase,
      // Flat properties for direct access
      residential_address: residentialAddress,
      state_of_origin: stateOfOrigin,
      lga,
      place_of_birth: placeOfBirth,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      display_name: displayName,
      full_name: displayName,
      name: displayName,
      gender,
      date_of_birth: dateOfBirth,
      email,
      phone,
      profile_photo_url: profilePhotoUrl,
      photo_url: profilePhotoUrl,
      face_photo_url: facePhotoUrl,
      captured_photo: facePhotoUrl,
      captured_photo_url: facePhotoUrl,
      // Only the onboarding (institution-issued) code belongs on `code`; the
      // provisional code is internal and must not masquerade as it.
      code: row.institution_issued_code || null,
      institution_issued_code: row.institution_issued_code || null,
      institution_code_expires_at: row.institution_code_expires_at || null,
      provisional_candidate_code: row.provisional_candidate_code || reg.provisionalCandidateCode,
      provisional_code: row.provisional_candidate_code || reg.provisionalCandidateCode,
      generated_code: row.provisional_candidate_code || reg.provisionalCandidateCode,
      // Structured objects
      candidate: candidateObj,
      basic_information: candidateObj,
      demographics: candidateObj,
      nin_verification: row.nin_id ? { id: row.nin_id, status: ninStatus } : null,
      university: row.university_id
        ? {
            id: row.university_id,
            name: row.university_name || null,
            short_name: row.university_short_name || null,
            code: row.university_code || null,
            jupeb_prefix: row.university_jupeb_prefix || null,
          }
        : null,
      session: row.session_id
        ? {
            id: row.session_id,
            academic_year: row.session_academic_year || null,
            year_short: row.session_year_short || null,
          }
        : null,
      subject_combination: subjectCombination,
      subjectCombination,
      subject_combination_id: row.subject_combination_id || null,
      biometric_status: hasFace || hasFingerprint ? 'yes' : 'no',
      has_biometrics: hasFace || hasFingerprint,
      biometric_skips: biometricSkips,
      bucket: statusBucket(row.status),
      status_reason: row.status_reason || null,
      next_of_kin: nextOfKin,
      result_entries: resultRows,
      results_by_examination: resultsByExam,
      documents,
      biometrics: bioRows.map((b: any) => ({ ...b, preview_url: b.file_url || null })),
      status_history: historyRows,
    };
  }

  /**
   * Create an individual candidate registration record.
   */
  async createRegistration(dto: CreateRegistrationDto, userId?: string | null): Promise<any> {
    const scopedUniversityId = await this.resolveEffectiveUniversityId(userId, dto.university_id);
    if (!scopedUniversityId) {
      throw new UnprocessableEntityException('university_id is required');
    }
    dto.university_id = scopedUniversityId;

    if (dto.nin_verification_id) {
      const ninRows = await this.dataSource.query(
        `SELECT id, status, nin_hash FROM jupeb_nin_verifications WHERE id = $1`,
        [dto.nin_verification_id],
      );
      const nin = ninRows[0];
      if (!nin) {
        throw new NotFoundException('NIN verification record not found');
      }
      if (nin.status !== 'verified') {
        throw new UnprocessableEntityException('NIN verification must be completed and in verified status to create candidate registration');
      }
      const existing = await this.dataSource.query(
        `SELECT id FROM jupeb_registrations WHERE nin_verification_id = $1 AND status NOT IN ('rejected', 'withdrawn') AND session_id = $2 LIMIT 1`,
        [dto.nin_verification_id, dto.session_id],
      );
      if (existing.length > 0) {
        throw new ConflictException('This NIN is already registered for this academic session');
      }
    } else {
      throw new UnprocessableEntityException('nin_verification_id is required to create a candidate registration');
    }

    const serialRows = await this.dataSource.query(
      `SELECT COALESCE(MAX(provisional_serial), 0) + 1 AS next_serial
       FROM jupeb_registrations WHERE session_id = $1`,
      [dto.session_id],
    );
    const nextSerial = serialRows[0].next_serial;

    const prefixRows = await this.dataSource.query(
      `SELECT jupeb_prefix FROM jupeb_universities WHERE id = $1 LIMIT 1`,
      [dto.university_id],
    );
    const jupebPrefix = prefixRows[0]?.jupeb_prefix || '';

    // Onboarding code: institution-supplied or auto-allocated (legacy parity).
    const institutionIssuedCode =
      dto.institution_issued_code || (await generateUniqueInstitutionCode(this.dataSource));
    const code = formatProvisionalCandidateCode(jupebPrefix, nextSerial);

    // The unique index `idx_jupeb_reg_session_uni_nin` (session + university + NIN)
    // is the last line of defence behind the pre-check above — e.g. when the only
    // existing row is rejected/withdrawn and therefore skipped by the pre-check.
    // Surface it as a 409 rather than a 500, matching the legacy create path.
    let entity: RegistrationEntity;
    try {
      entity = await this.regRepo.create({
        sessionId: dto.session_id,
        universityId: dto.university_id,
        subjectCombinationId: dto.subject_combination_id || null,
        ninVerificationId: dto.nin_verification_id || null,
        userId: dto.user_id || null,
        institutionIssuedCode,
        institutionCodeExpiresAt: institutionCodeExpiresAt(),
        provisionalSerial: nextSerial,
        provisionalCandidateCode: code,
        status: RegistrationStatus.CODE_ISSUED,
        createdBy: userId || null,
      });
    } catch (err: any) {
      if ((err?.code || err?.driverError?.code) === '23505') {
        throw new ConflictException('Duplicate NIN registration for this session and university');
      }
      throw err;
    }

    await this.historyRepo.create({
      registrationId: entity.id,
      fromStatus: null,
      toStatus: RegistrationStatus.CODE_ISSUED,
      reason: 'Created by institution admin',
      changedBy: userId || entity.id,
    });

    // Notify the candidate (email) and push an instant CRMS/Attendance sync.
    this.eventEmitter.emit(RegistrationEvent.CODE_ISSUED, {
      registrationId: entity.id,
      userId,
    });
    this.eventEmitter.emit(SyncEvent.CANDIDATE_UPDATED, {
      registrationId: entity.id,
      userId,
      data: { status: RegistrationStatus.CODE_ISSUED },
    });

    return {
      id: entity.id,
      sessionId: entity.sessionId,
      session_id: entity.sessionId,
      universityId: entity.universityId,
      university_id: entity.universityId,
      subjectCombinationId: entity.subjectCombinationId,
      subject_combination_id: entity.subjectCombinationId,
      ninVerificationId: entity.ninVerificationId,
      nin_verification_id: entity.ninVerificationId,
      userId: entity.userId,
      user_id: entity.userId,
      institutionIssuedCode: entity.institutionIssuedCode,
      institution_issued_code: entity.institutionIssuedCode,
      institutionCodeExpiresAt: entity.institutionCodeExpiresAt,
      institution_code_expires_at: entity.institutionCodeExpiresAt,
      provisionalSerial: entity.provisionalSerial,
      provisional_serial: entity.provisionalSerial,
      provisionalCandidateCode: entity.provisionalCandidateCode,
      provisional_candidate_code: entity.provisionalCandidateCode,
      code: entity.institutionIssuedCode,
      generated_code: entity.provisionalCandidateCode,
      provisional_code: entity.provisionalCandidateCode,
      status: entity.status,
      createdAt: entity.createdAt,
      created_at: entity.createdAt,
      updatedAt: entity.updatedAt,
      updated_at: entity.updatedAt,
    };
  }

  /**
   * Update registration fields (subject combination, institution code, status, status reason).
   */
  async updateRegistration(
    registrationId: string,
    dto: PatchRegistrationDto,
    userId?: string | null,
  ): Promise<any> {
    const existing = await this.regRepo.findById(registrationId);
    if (!existing) throw new NotFoundException('Registration not found');

    await this.assertUniversityAccess(userId, existing.universityId || (existing as any).university_id);

    const subjectCombId = dto.subject_combination_id || dto.subjectCombinationId;
    const instCode = dto.institution_issued_code || dto.institutionIssuedCode;
    const reason = dto.status_reason || dto.statusReason;
    const targetStatus = dto.status ? String(dto.status).toLowerCase().trim() : undefined;

    if (targetStatus && targetStatus !== existing.status) {
      await this.regRepo.setStatus(registrationId, targetStatus, reason, userId);
      await this.historyRepo.create({
        registrationId,
        fromStatus: existing.status,
        toStatus: targetStatus,
        reason: reason || 'Updated by admin',
        changedBy: userId || registrationId,
      });
    }

    const fields: Partial<RegistrationEntity> = {};
    if (subjectCombId !== undefined) fields.subjectCombinationId = subjectCombId;
    if (instCode !== undefined) fields.institutionIssuedCode = instCode;
    if (reason !== undefined) fields.statusReason = reason;

    if (Object.keys(fields).length) {
      await this.regRepo.updateById(registrationId, fields);
    }

    // Emit in-memory event for instant single candidate sync to CRMS & Attendance
    this.eventEmitter.emit(SyncEvent.CANDIDATE_UPDATED, {
      registrationId,
      userId,
      data: { ...fields, status: targetStatus },
    });

    const enriched = await this.getRegistrationById(registrationId, userId).catch(() => existing);
    return enriched;
  }

  /**
   * Update candidate profile details (names, gender, contact information, subject combination, NoK, documents).
   */
  async updateCandidateProfile(
    registrationId: string,
    dto: PatchCandidateDto,
    userId?: string | null,
  ) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    await this.assertUniversityAccess(userId, reg.universityId || (reg as any).university_id);

    const info = dto.info && typeof dto.info === 'object' ? dto.info : {};
    const subjectCombId =
      dto.subject_combination_id ||
      dto.subjectCombinationId ||
      info.subject_combination_id ||
      info.subjectCombinationId;
    const instCode =
      dto.institution_issued_code ||
      dto.institutionIssuedCode ||
      info.institution_issued_code ||
      info.institutionIssuedCode;

    const firstName = dto.first_name || dto.firstName || info.first_name || info.firstName;
    const lastName = dto.last_name || dto.lastName || info.last_name || info.lastName;
    const middleName = dto.middle_name || dto.middleName || info.middle_name || info.middleName;
    const title = dto.title || info.title;
    const gender = dto.gender || info.gender;
    const dateOfBirth = dto.date_of_birth || dto.dateOfBirth || dto.dob || info.date_of_birth || info.dateOfBirth || info.dob;
    const stateOfOrigin = dto.state_of_origin || dto.stateOfOrigin || info.state_of_origin || info.stateOfOrigin;
    const lga = dto.lga || info.lga;
    const residentialAddress = dto.residential_address || dto.residentialAddress || dto.address || info.residential_address || info.residentialAddress || info.address;
    const placeOfBirth = dto.place_of_birth || dto.placeOfBirth || info.place_of_birth || info.placeOfBirth;
    const email = dto.email || info.email ? String(dto.email || info.email).trim() : undefined;
    const phone = dto.phone || info.phone ? String(dto.phone || info.phone).trim() : undefined;
    const nok = dto.next_of_kin || dto.nextOfKin || info.next_of_kin || info.nextOfKin;
    const docs = dto.documents || info.documents;

    // 1. Update registration record fields (e.g. subject_combination_id, institution_issued_code)
    const regSets: string[] = [];
    const regVals: any[] = [];
    if (subjectCombId) {
      regVals.push(subjectCombId);
      regSets.push(`subject_combination_id = $${regVals.length}`);
    }
    if (instCode) {
      regVals.push(instCode);
      regSets.push(`institution_issued_code = $${regVals.length}`);
    }
    if (regSets.length) {
      regVals.push(registrationId);
      await this.dataSource.query(
        `UPDATE jupeb_registrations SET ${regSets.join(', ')}, updated_at = NOW() WHERE id = $${regVals.length}`,
        regVals,
      );
    }

    // 2. Update user profile and contact details
    if (reg.userId) {
      const profileFields: Record<string, any> = {};
      if (firstName) profileFields.first_name = String(firstName).trim();
      if (lastName) profileFields.last_name = String(lastName).trim();
      if (firstName || lastName || middleName) {
        const curProfile = (await this.dataSource.query('SELECT first_name, last_name, display_name FROM profiles WHERE user_id = $1', [reg.userId]))[0] || {};
        const effFirst = firstName ? String(firstName).trim() : (curProfile.first_name || '');
        const effLast = lastName ? String(lastName).trim() : (curProfile.last_name || '');
        const effMiddle = middleName ? String(middleName).trim() : '';
        const constructed = [effFirst, effMiddle, effLast].filter(Boolean).join(' ').trim();
        if (constructed) profileFields.display_name = constructed;
      }
      if (title) profileFields.title = String(title).trim();
      if (gender) profileFields.gender = String(gender).trim();
      if (dateOfBirth) profileFields.date_of_birth = dateOfBirth;
      if (stateOfOrigin) profileFields.state_of_origin = String(stateOfOrigin).trim();
      if (lga) profileFields.lga = String(lga).trim();
      if (residentialAddress) profileFields.residential_address = String(residentialAddress).trim();
      if (placeOfBirth) profileFields.place_of_birth = String(placeOfBirth).trim();

      if (Object.keys(profileFields).length) {
        const sets = Object.keys(profileFields).map((k, i) => `${k} = $${i + 2}`).join(', ');
        await this.dataSource.query(
          `UPDATE profiles SET ${sets}, updated_at = NOW() WHERE user_id = $1`,
          [reg.userId, ...Object.values(profileFields)],
        );
      }

      if (reg.ninVerificationId && middleName) {
        await this.dataSource.query(
          `UPDATE jupeb_nin_verifications
           SET intake_payload = COALESCE(intake_payload, '{}'::jsonb) || jsonb_build_object('middle_name', $2::text),
               updated_at = NOW()
           WHERE id = $1`,
          [reg.ninVerificationId, String(middleName).trim()],
        ).catch(() => {});
      }

      if (email || phone) {
        const userSets: string[] = [];
        const userVals: any[] = [reg.userId];
        if (email) {
          userSets.push(`email = $${userVals.length + 1}`);
          userVals.push(email);
        }
        if (phone) {
          userSets.push(`phone = $${userVals.length + 1}`);
          userVals.push(phone);
        }
        await this.dataSource.query(
          `UPDATE users SET ${userSets.join(', ')}, updated_at = NOW() WHERE id = $1`,
          userVals,
        );
      }
    }

    // 3. Update Next of Kin
    if (nok && typeof nok === 'object') {
      const nokName =
        nok.name ||
        [nok.first_name || nok.firstName, nok.last_name || nok.lastName].filter(Boolean).join(' ') ||
        nok.full_name;
      const nokRel = nok.relationship || nok.relation || 'Guardian';
      const nokPhone = nok.phone || nok.telephone || nok.contact || nok.nok_phone;
      const nokEmail = nok.email || nok.nok_email;
      const nokAddress = nok.address || nok.nok_address;

      const nokSource = nok.source || 'institution';

      if (nokName || nokPhone || nokEmail || nokAddress) {
        await this.dataSource
          .query(
            `INSERT INTO jupeb_next_of_kin (registration_id, name, relationship, phone, email, address, source, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
             ON CONFLICT (registration_id) WHERE (deleted_at IS NULL) DO UPDATE
             SET name = EXCLUDED.name, relationship = EXCLUDED.relationship, phone = EXCLUDED.phone, email = EXCLUDED.email, address = EXCLUDED.address, source = EXCLUDED.source, updated_at = NOW()`,
            [registrationId, nokName || 'Next of Kin', nokRel, nokPhone || null, nokEmail || null, nokAddress || null, nokSource],
          )
          .catch(async () => {
            const existing = await this.dataSource
              .query(
                `SELECT id FROM jupeb_next_of_kin WHERE registration_id = $1 AND deleted_at IS NULL LIMIT 1`,
                [registrationId],
              )
              .catch(() => []);
            if (existing && existing.length > 0) {
              await this.dataSource
                .query(
                  `UPDATE jupeb_next_of_kin SET name = $2, relationship = $3, phone = $4, email = $5, address = $6, source = $7, updated_at = NOW() WHERE id = $1`,
                  [existing[0].id, nokName || 'Next of Kin', nokRel, nokPhone || null, nokEmail || null, nokAddress || null, nokSource],
                )
                .catch(() => {});
            } else {
              await this.dataSource
                .query(
                  `INSERT INTO jupeb_next_of_kin (registration_id, name, relationship, phone, email, address, source, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
                  [registrationId, nokName || 'Next of Kin', nokRel, nokPhone || null, nokEmail || null, nokAddress || null, nokSource],
                )
                .catch(() => {});
            }
          });
      }
    }

    // 4. Update documents if attached
    if (Array.isArray(docs) && docs.length) {
      for (const d of docs) {
        if (d && (d.requirement_id || d.requirementId || d.file_id || d.fileId)) {
          await this.docRepo
            .create({
              registrationId,
              requirementId: d.requirement_id || d.requirementId,
              fileId: d.file_id || d.fileId,
              source: d.source || 'institution',
              sitting: d.sitting || 1,
            })
            .catch(() => {});
        }
      }
    }

    // Emit in-memory event for instant single candidate sync to CRMS & Attendance
    this.eventEmitter.emit(SyncEvent.CANDIDATE_UPDATED, {
      registrationId: reg.id,
      userId,
      data: dto,
    });

    return this.getRegistrationById(registrationId, userId);
  }

  /**
   * Resend the institution-issued onboarding code to the candidate.
   */
  async resendProvisionalCode(registrationId: string, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    await this.assertUniversityAccess(userId, reg.universityId || (reg as any).university_id);

    if (reg.status !== RegistrationStatus.CODE_ISSUED) {
      throw new UnprocessableEntityException(
        'Registration code can only be resent while the registration is awaiting claim',
      );
    }
    if (reg.userId) {
      throw new UnprocessableEntityException('Registration code was already claimed');
    }
    const expiresAt = reg.institutionCodeExpiresAt;
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      throw new HttpException(
        {
          message: 'This institution code has expired',
          error_code: 'code_expired',
          details: { error_code: 'code_expired', expires_at: expiresAt },
        },
        HttpStatus.GONE,
      );
    }

    // Re-dispatch the code-issued email to the candidate.
    this.eventEmitter.emit(RegistrationEvent.CODE_ISSUED, {
      registrationId,
      userId,
    });

    return {
      id: reg.id,
      institution_issued_code: reg.institutionIssuedCode,
      institution_code_expires_at: expiresAt || null,
      resent: true,
    };
  }

  /**
   * Withdraw / delete candidate registration.
   */
  async withdrawRegistration(registrationId: string, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    await this.assertUniversityAccess(userId, reg.universityId || (reg as any).university_id);

    if (reg.status === RegistrationStatus.APPROVED) {
      throw new ConflictException('Approved registration cannot be deleted');
    }

    const updated = await this.regRepo.setStatus(registrationId, RegistrationStatus.WITHDRAWN, 'Deleted by admin', userId);
    await this.historyRepo.create({
      registrationId,
      fromStatus: reg.status,
      toStatus: RegistrationStatus.WITHDRAWN,
      reason: 'Deleted by institution admin',
      changedBy: userId || registrationId,
    });

    try {
      this.eventEmitter.emit(RegistrationEvent.WITHDRAWN, {
        registrationId,
        userId,
        reason: 'Deleted by institution admin',
      });
    } catch (e: any) {
      this.logger.warn(`Failed to emit WITHDRAWN event for ${registrationId}: ${e?.message}`);
    }

    const enriched = await this.getRegistrationById(registrationId, userId).catch(() => updated || reg);

    return {
      success: true,
      message: 'Registration withdrawn',
      data: enriched,
      registration: enriched,
      status: RegistrationStatus.WITHDRAWN,
      id: registrationId,
      ...enriched,
    };
  }

  /**
   * Get registration overview KPIs / statistics.
   */
  async getOverviewStats(query: { session_id?: string; university_id?: string }, userId?: string | null) {
    const scopedUniversityId = await this.resolveEffectiveUniversityId(userId, query.university_id);
    return this.kpiService.kpiCounts(scopedUniversityId || undefined, query.session_id);
  }

  /**
   * Get registration breakdown aggregated by university.
   */
  async getRegistrationsByUniversity(
    query: { session_id?: string; university_id?: string; limit?: number },
    userId?: string | null,
  ) {
    const scopedUniversityId = await this.resolveEffectiveUniversityId(userId, query.university_id);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 12));
    const params: any[] = [];
    const universityFilters: string[] = ['u.deleted_at IS NULL'];
    let sessionJoinClause = '';

    if (query.session_id) {
      params.push(query.session_id);
      sessionJoinClause = ` AND r.session_id = $${params.length}`;
    }

    if (scopedUniversityId) {
      params.push(scopedUniversityId);
      universityFilters.push(`u.id = $${params.length}`);
    }

    params.push(limit);
    const limitIdx = params.length;

    const rows = await this.dataSource.query(
      `SELECT
        u.id,
        u.id AS university_id,
        u.name,
        u.name AS university_name,
        u.code,
        u.code AS university_code,
        u.code AS institutionId,
        u.name AS institutionName,
        u.short_name,
        COALESCE(u.short_name, u.code) AS university_short_name,
        u.university_type,
        u.email,
        u.phone,
        u.phone AS phoneNumber,
        u.jupeb_prefix,
        u.status,
        COALESCE(u.expected_candidate_count, 0) AS expected_candidate_count,
        COUNT(r.id)::int AS total_candidates,
        COUNT(r.id)::int AS registered_count,
        COUNT(r.id)::int AS enrolled_count,
        COUNT(CASE WHEN r.status = 'approved' THEN 1 END)::int AS approved_candidates
       FROM jupeb_universities u
       LEFT JOIN jupeb_registrations r ON r.university_id = u.id${sessionJoinClause}
       WHERE ${universityFilters.join(' AND ')}
       GROUP BY u.id, u.name, u.code, u.short_name, u.university_type, u.email, u.phone, u.jupeb_prefix, u.status, u.expected_candidate_count
       ORDER BY total_candidates DESC, u.name ASC
       LIMIT $${limitIdx}`,
      params,
    );

    return rows;
  }

  /**
   * Perform batch status transitions on multiple registrations.
   */
  async batchUpdateRegistrationStatus(dto: BatchRegistrationActionDto, userId?: string | null) {
    const rawIds = dto.registration_ids || dto.ids || [];
    const ids = Array.isArray(rawIds)
      ? rawIds.map((i: any) => String(i || '').trim()).filter((id) => Boolean(id) && UUID_REGEX.test(id))
      : [];
    const rawAction = dto.action ? String(dto.action).toLowerCase().trim() : 'approve';
    const reason = dto.reason ? String(dto.reason).trim() : undefined;

    if (!ids.length) {
      throw new UnprocessableEntityException('registration_ids array is required');
    }
    if (rawAction === 'reject' && !reason) {
      throw new UnprocessableEntityException('reason is required when action is reject');
    }

    const accepted: Array<{ id: string; status: string }> = [];
    const rejected: Array<{ id: string; error_code: string; message: string; http_status: number }> = [];

    for (const id of ids) {
      try {
        const reg = await this.regRepo.findById(id);
        if (!reg) {
          rejected.push({ id, error_code: 'not_found', message: 'Registration not found', http_status: 404 });
          continue;
        }

        if (userId) {
          try {
            await this.assertUniversityAccess(userId, reg.universityId || (reg as any).university_id);
          } catch (scopeErr: any) {
            rejected.push({
              id,
              error_code: 'forbidden',
              message: scopeErr.message || 'University is outside your institution scope',
              http_status: 403,
            });
            continue;
          }
        }

        if (rawAction === 'delete') {
          const deletable =
            reg.status === RegistrationStatus.REJECTED ||
            reg.status === RegistrationStatus.WITHDRAWN ||
            (reg.status === RegistrationStatus.CODE_ISSUED && !reg.userId);
          if (!deletable) {
            rejected.push({
              id,
              error_code: 'invalid_status_transition',
              message: `Cannot delete registration in status ${reg.status}`,
              http_status: 422,
            });
            continue;
          }
          const delRecipientRows = await this.dataSource.query(
            `SELECT u.email, p.first_name, uni.name AS university_name
               FROM jupeb_registrations r
               LEFT JOIN users u ON u.id = r.user_id
               LEFT JOIN profiles p ON p.user_id = r.user_id
               LEFT JOIN jupeb_universities uni ON uni.id = r.university_id
              WHERE r.id = $1`,
            [id],
          );
          const delRecipient = delRecipientRows[0];
          await this.dataSource.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [id]);
          try {
            this.eventEmitter.emit(RegistrationEvent.DELETED, {
              registrationId: id,
              userId,
              email: delRecipient?.email,
              firstName: delRecipient?.first_name,
              universityName: delRecipient?.university_name,
              reason,
            });
          } catch (e: any) {
            this.logger.warn(`Failed to emit DELETED event for ${id}: ${e?.message}`);
          }
          accepted.push({ id, status: 'deleted' });
          continue;
        }

        if (rawAction === 'unlock') {
          await this.dataSource.query(
            `UPDATE jupeb_registrations SET dashboard_unlocked_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [id],
          );
          try {
            this.eventEmitter.emit(RegistrationEvent.UNLOCKED, {
              registrationId: id,
              userId,
            });
          } catch (e: any) {
            this.logger.warn(`Failed to emit UNLOCKED event for ${id}: ${e?.message}`);
          }
          accepted.push({ id, status: reg.status });
          continue;
        }

        if (rawAction === 'lock') {
          await this.dataSource.query(
            `UPDATE jupeb_registrations SET dashboard_unlocked_at = NULL, updated_at = NOW() WHERE id = $1`,
            [id],
          );
          try {
            this.eventEmitter.emit(RegistrationEvent.LOCKED, {
              registrationId: id,
              userId,
              reason,
            });
          } catch (e: any) {
            this.logger.warn(`Failed to emit LOCKED event for ${id}: ${e?.message}`);
          }
          accepted.push({ id, status: reg.status });
          continue;
        }

        if (rawAction === 'approve') {
          if (!this.stateService.canTransition(reg.status, RegistrationStatus.APPROVED)) {
            rejected.push({
              id,
              error_code: 'invalid_status_transition',
              message: `Registration cannot be approved from status ${reg.status}`,
              http_status: 422,
            });
            continue;
          }

          // Check biometric completion
          const bioRows = await this.dataSource.query(
            `SELECT COUNT(*)::int AS count FROM jupeb_biometric_captures WHERE registration_id = $1 AND replaced_at IS NULL`,
            [id],
          );
          const bioCount = Number(bioRows[0]?.count) || 0;
          const skipped = Boolean(
            (reg as any).face_skipped_at ||
              (reg as any).fingerprint_skipped_at ||
              (reg as any).faceSkippedAt ||
              (reg as any).fingerprintSkippedAt,
          );
          if (bioCount === 0 && !skipped) {
            rejected.push({
              id,
              error_code: 'biometrics_incomplete',
              message: 'Biometric capture must be completed or explicitly skipped before approval',
              http_status: 422,
            });
            continue;
          }

          await this.regRepo.setStatus(id, RegistrationStatus.APPROVED, reason, userId);
          await this.dataSource.query(
            `UPDATE jupeb_registrations SET status = 'approved', approved_at = NOW(), approved_by = $1, dashboard_unlocked_at = NOW(), updated_at = NOW() WHERE id = $2`,
            [userId || id, id],
          );
          await this.historyRepo.create({
            registrationId: id,
            fromStatus: reg.status,
            toStatus: RegistrationStatus.APPROVED,
            reason: reason || 'Batch approved by institution admin',
            changedBy: userId || id,
          });
          const fresh = await this.regRepo.findById(id);
          if (fresh) {
            await this.eventsService.emitRegistrationApproved(fresh, userId);
          }
          try {
            this.eventEmitter.emit(RegistrationEvent.APPROVED, {
              registrationId: id,
              userId,
              candidateNumber: fresh?.jupebCandidateNumber,
              reason,
            });
          } catch (e: any) {
            this.logger.warn(`Failed to emit APPROVED event for ${id}: ${e?.message}`);
          }
          accepted.push({ id, status: RegistrationStatus.APPROVED });
        } else if (rawAction === 'reject') {
          if (!this.stateService.canTransition(reg.status, RegistrationStatus.REJECTED)) {
            rejected.push({
              id,
              error_code: 'invalid_status_transition',
              message: `Registration cannot be rejected from status ${reg.status}`,
              http_status: 422,
            });
            continue;
          }
          await this.regRepo.setStatus(id, RegistrationStatus.REJECTED, reason || 'Rejected in batch', userId);
          await this.historyRepo.create({
            registrationId: id,
            fromStatus: reg.status,
            toStatus: RegistrationStatus.REJECTED,
            reason: reason || 'Batch rejected by institution admin',
            changedBy: userId || id,
          });
          try {
            this.eventEmitter.emit(RegistrationEvent.REJECTED, {
              registrationId: id,
              userId,
              reason,
            });
          } catch (e: any) {
            this.logger.warn(`Failed to emit REJECTED event for ${id}: ${e?.message}`);
          }
          accepted.push({ id, status: RegistrationStatus.REJECTED });
        } else if (rawAction === 'withdraw') {
          if (!this.stateService.canTransition(reg.status, RegistrationStatus.WITHDRAWN)) {
            rejected.push({
              id,
              error_code: 'invalid_status_transition',
              message: `Registration cannot be withdrawn from status ${reg.status}`,
              http_status: 422,
            });
            continue;
          }
          await this.regRepo.setStatus(id, RegistrationStatus.WITHDRAWN, reason || 'Withdrawn in batch', userId);
          await this.historyRepo.create({
            registrationId: id,
            fromStatus: reg.status,
            toStatus: RegistrationStatus.WITHDRAWN,
            reason: reason || 'Batch withdrawn by institution admin',
            changedBy: userId || id,
          });
          try {
            this.eventEmitter.emit(RegistrationEvent.WITHDRAWN, {
              registrationId: id,
              userId,
              reason,
            });
          } catch (e: any) {
            this.logger.warn(`Failed to emit WITHDRAWN event for ${id}: ${e?.message}`);
          }
          accepted.push({ id, status: RegistrationStatus.WITHDRAWN });
        }
      } catch (err: any) {
        rejected.push({
          id,
          error_code: 'batch_error',
          message: err.message || 'Operation failed',
          http_status: 500,
        });
      }
    }

    return {
      action: rawAction,
      total: ids.length,
      total_requested: ids.length,
      updated_count: accepted.length,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      accepted,
      rejected,
      results: accepted,
    };
  }

  /**
   * Approve an individual candidate registration.
   */
  async approveRegistration(registrationId: string, body: { reason?: string }, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    await this.assertUniversityAccess(userId, reg.universityId || (reg as any).university_id);

    if (!this.stateService.canTransition(reg.status, RegistrationStatus.APPROVED)) {
      if (reg.status === RegistrationStatus.APPROVED) {
        const enriched = await this.getRegistrationById(registrationId, userId).catch(() => reg);
        return {
          success: true,
          message: 'Registration already approved',
          data: enriched,
          registration: enriched,
          status: RegistrationStatus.APPROVED,
          id: registrationId,
          ...enriched,
        };
      }
      throw new UnprocessableEntityException(`Cannot approve registration in status ${reg.status}`);
    }

    // Biometric completion check
    const bioRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM jupeb_biometric_captures WHERE registration_id = $1 AND replaced_at IS NULL`,
      [registrationId],
    );
    const bioCount = Number(bioRows[0]?.count) || 0;
    const skipped = Boolean(
      (reg as any).face_skipped_at ||
        (reg as any).fingerprint_skipped_at ||
        (reg as any).faceSkippedAt ||
        (reg as any).fingerprintSkippedAt,
    );
    if (bioCount === 0 && !skipped) {
      throw new UnprocessableEntityException('Biometric capture must be completed or explicitly skipped before approving candidate registration');
    }

    const updated = await this.regRepo.setStatus(registrationId, RegistrationStatus.APPROVED, body?.reason, userId);
    await this.dataSource.query(
      `UPDATE jupeb_registrations SET status = 'approved', approved_at = NOW(), approved_by = $1, dashboard_unlocked_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [userId || registrationId, registrationId],
    );
    await this.historyRepo.create({
      registrationId,
      fromStatus: reg.status,
      toStatus: RegistrationStatus.APPROVED,
      reason: body?.reason || 'Approved by institution admin',
      changedBy: userId || registrationId,
    });

    if (updated) {
      await this.eventsService.emitRegistrationApproved(updated, userId);
    }

    try {
      this.eventEmitter.emit(RegistrationEvent.APPROVED, {
        registrationId,
        userId,
        candidateNumber: updated?.jupebCandidateNumber,
        reason: body?.reason,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to emit APPROVED event for ${registrationId}: ${e?.message}`);
    }

    const enriched = await this.getRegistrationById(registrationId, userId).catch(() => updated || reg);

    return {
      success: true,
      message: 'Registration approved',
      data: enriched,
      registration: enriched,
      status: RegistrationStatus.APPROVED,
      id: registrationId,
      ...enriched,
    };
  }

  /**
   * Reject an individual candidate registration.
   */
  async rejectRegistration(registrationId: string, body: { reason?: string }, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    await this.assertUniversityAccess(userId, reg.universityId || (reg as any).university_id);

    if (!this.stateService.canTransition(reg.status, RegistrationStatus.REJECTED)) {
      if (reg.status === RegistrationStatus.REJECTED) {
        const enriched = await this.getRegistrationById(registrationId, userId).catch(() => reg);
        return {
          success: true,
          message: 'Registration already rejected',
          data: enriched,
          registration: enriched,
          status: RegistrationStatus.REJECTED,
          id: registrationId,
          ...enriched,
        };
      }
      throw new UnprocessableEntityException(`Cannot reject registration in status ${reg.status}`);
    }

    const reason = body?.reason || 'Rejected by institution admin';
    const updated = await this.regRepo.setStatus(registrationId, RegistrationStatus.REJECTED, reason, userId);
    await this.historyRepo.create({
      registrationId,
      fromStatus: reg.status,
      toStatus: RegistrationStatus.REJECTED,
      reason,
      changedBy: userId || registrationId,
    });

    try {
      this.eventEmitter.emit(RegistrationEvent.REJECTED, {
        registrationId,
        userId,
        reason,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to emit REJECTED event for ${registrationId}: ${e?.message}`);
    }

    const enriched = await this.getRegistrationById(registrationId, userId).catch(() => updated || reg);

    return {
      success: true,
      message: 'Registration rejected',
      data: enriched,
      registration: enriched,
      status: RegistrationStatus.REJECTED,
      id: registrationId,
      ...enriched,
    };
  }

  /**
   * Withdraw an individual candidate registration directly.
   */
  async withdrawRegistrationDirect(registrationId: string, body: { reason?: string }, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');

    const reason = body?.reason || 'Withdrawn by institution admin';
    const updated = await this.regRepo.setStatus(registrationId, RegistrationStatus.WITHDRAWN, reason, userId);
    await this.historyRepo.create({
      registrationId,
      fromStatus: reg.status,
      toStatus: RegistrationStatus.WITHDRAWN,
      reason,
      changedBy: userId || registrationId,
    });

    try {
      this.eventEmitter.emit(RegistrationEvent.WITHDRAWN, {
        registrationId,
        userId,
        reason,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to emit WITHDRAWN event for ${registrationId}: ${e?.message}`);
    }

    const enriched = await this.getRegistrationById(registrationId, userId).catch(() => updated || reg);

    return {
      success: true,
      message: 'Registration withdrawn',
      data: enriched,
      registration: enriched,
      status: RegistrationStatus.WITHDRAWN,
      id: registrationId,
      ...enriched,
    };
  }

  /**
   * Unlock candidate dashboard features for editing.
   */
  async unlockRegistration(registrationId: string, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');
    await this.assertUniversityAccess(userId, reg.universityId || (reg as any).university_id);

    await this.dataSource.query(
      `UPDATE jupeb_registrations SET dashboard_unlocked_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [registrationId],
    );

    try {
      this.eventEmitter.emit(RegistrationEvent.UNLOCKED, {
        registrationId,
        userId,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to emit UNLOCKED event for ${registrationId}: ${e?.message}`);
    }

    const enriched = await this.getRegistrationById(registrationId, userId).catch(() => reg);
    return {
      success: true,
      message: 'Candidate dashboard unlocked',
      data: enriched,
      registration: enriched,
      id: registrationId,
      ...enriched,
    };
  }

  /**
   * Lock candidate dashboard features against further editing.
   */
  async lockRegistration(registrationId: string, body?: { reason?: string }, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');
    await this.assertUniversityAccess(userId, reg.universityId || (reg as any).university_id);

    await this.dataSource.query(
      `UPDATE jupeb_registrations SET dashboard_unlocked_at = NULL, updated_at = NOW() WHERE id = $1`,
      [registrationId],
    );

    try {
      this.eventEmitter.emit(RegistrationEvent.LOCKED, {
        registrationId,
        userId,
        reason: body?.reason,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to emit LOCKED event for ${registrationId}: ${e?.message}`);
    }

    const enriched = await this.getRegistrationById(registrationId, userId).catch(() => reg);
    return {
      success: true,
      message: 'Candidate dashboard locked',
      data: enriched,
      registration: enriched,
      id: registrationId,
      ...enriched,
    };
  }

  /**
   * Hard-delete a candidate registration.
   */
  async deleteRegistration(registrationId: string, body?: { reason?: string }, userId?: string | null) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');
    await this.assertUniversityAccess(userId, reg.universityId || (reg as any).university_id);

    const deletable =
      reg.status === RegistrationStatus.REJECTED ||
      reg.status === RegistrationStatus.WITHDRAWN ||
      (reg.status === RegistrationStatus.CODE_ISSUED && !reg.userId);
    if (!deletable) {
      throw new UnprocessableEntityException(`Cannot delete registration in status ${reg.status}`);
    }

    const recipientRows = await this.dataSource.query(
      `SELECT u.email, p.first_name, uni.name AS university_name
         FROM jupeb_registrations r
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN profiles p ON p.user_id = r.user_id
         LEFT JOIN jupeb_universities uni ON uni.id = r.university_id
        WHERE r.id = $1`,
      [registrationId],
    );
    const delRecipient = recipientRows[0];

    await this.dataSource.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [registrationId]);

    try {
      this.eventEmitter.emit(RegistrationEvent.DELETED, {
        registrationId,
        userId,
        email: delRecipient?.email,
        firstName: delRecipient?.first_name,
        universityName: delRecipient?.university_name,
        reason: body?.reason,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to emit DELETED event for ${registrationId}: ${e?.message}`);
    }

    return {
      success: true,
      message: 'Registration deleted successfully',
      id: registrationId,
    };
  }

  /**
   * Export candidate registrations to CSV format.
   */
  async exportRegistrationsCsv(query: ListRegistrationsQueryDto, userId?: string | null): Promise<string> {
    const scopedUniversityId = await this.resolveEffectiveUniversityId(userId, query.university_id);
    const { rows } = await this.regRepo.findAllPaginated({
      sessionId: query.session_id,
      universityId: scopedUniversityId || undefined,
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
      let serial = Number(u.seq) || 1;
      let candidateNumber = `${u.year_short}${u.jupeb_prefix}${String(serial).padStart(4, '0')}`;

      while (true) {
        const existing = await this.dataSource.query(
          `SELECT id
           FROM jupeb_registrations
           WHERE jupeb_candidate_number = $1 AND id <> $2
           LIMIT 1`,
          [candidateNumber, u.id],
        );

        if (!existing.length) break;
        serial += 1;
        candidateNumber = `${u.year_short}${u.jupeb_prefix}${String(serial).padStart(4, '0')}`;
      }

      await this.regRepo.updateById(u.id, {
        jupebCandidateNumber: candidateNumber,
        updatedBy: userId || null,
      } as any);

      try {
        this.eventEmitter.emit(RegistrationEvent.MATRIC_ASSIGNED, {
          registrationId: u.id,
          candidateNumber,
          userId,
        });
      } catch (e: any) {
        this.logger.warn(`Failed to emit MATRIC_ASSIGNED event for ${u.id}: ${e?.message}`);
      }
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

  private async restoreSubjectCombinationFromNinIntake(reg: RegistrationEntity): Promise<void> {
    if (reg.subjectCombinationId || !reg.ninVerificationId || !reg.universityId) return;

    const intakeRows = await this.dataSource.query(
      `SELECT COALESCE(
                intake_payload->>'subject_combination_id',
                intake_payload->>'subjectCombinationId'
              ) AS subject_combination_id
         FROM jupeb_nin_verifications
        WHERE id = $1`,
      [reg.ninVerificationId],
    );
    const subjectCombinationId = intakeRows[0]?.subject_combination_id;
    if (!subjectCombinationId || !UUID_REGEX.test(subjectCombinationId)) return;

    const validRows = await this.dataSource.query(
      `SELECT id
         FROM jupeb_subject_combinations
        WHERE id = $1
          AND status = 'active'
          AND deleted_at IS NULL
          AND (is_global = true OR university_id = $2)
        LIMIT 1`,
      [subjectCombinationId, reg.universityId],
    );
    if (!validRows.length) return;

    await this.regRepo.updateById(reg.id, { subjectCombinationId });
    reg.subjectCombinationId = subjectCombinationId;
  }

  /**
   * Build complete candidate profile for mobile and web self-service.
   */
  async buildStudentProfile(userId: string) {
    const reg = await this.regRepo.findByUserId(userId);
    if (!reg) throw new NotFoundException('No registration found for current user');
    await this.restoreSubjectCombinationFromNinIntake(reg);

    const [userRows, ninRows, nokRows, bioRows, uniRows, sessionRows, scRows] = await Promise.all([
      this.dataSource.query(
        `SELECT u.id, u.email, u.phone, p.title, p.first_name, p.last_name, p.display_name,
                p.date_of_birth, p.gender, p.profile_photo_url,
                p.residential_address, p.state_of_origin, p.lga, p.place_of_birth,
                c.name as country
           FROM users u
           LEFT JOIN profiles p ON p.user_id = u.id
           LEFT JOIN countries c ON p.country_id = c.id
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
            AND deleted_at IS NULL
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
            `SELECT id, name, short_name, jupeb_prefix, university_type AS institution_type
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
        name: fullName,
        display_name: fullName,
        first_name: u.first_name || ninPayload.first_name || intake.first_name || null,
        middle_name: ninPayload.middle_name || ninPayload.middlename || intake.middle_name || null,
        last_name: u.last_name || ninPayload.last_name || intake.last_name || null,
        provisional_candidate_code: reg.provisionalCandidateCode || null,
        jupeb_candidate_number: reg.jupebCandidateNumber || null,
        photo_url: resolvedPhoto,
        profile_photo_url: resolvedPhoto,
        face_photo_url: facePhotoUrl,
        captured_photo_url: facePhotoUrl,
        captured_photo: facePhotoUrl,
        status: reg.status,
      },
      photo_url: resolvedPhoto,
      profile_photo_url: resolvedPhoto,
      face_photo_url: facePhotoUrl,
      captured_photo_url: facePhotoUrl,
      captured_photo: facePhotoUrl,
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
    await this.restoreSubjectCombinationFromNinIntake(reg);

    const details: any = await this.getRegistrationById(reg.id, userId);
    const docs =
      Array.isArray(details.documents) && details.documents.length
        ? details.documents
        : await this.docRepo.findByRegistrationId(reg.id);

    const fullName =
      details.display_name ||
      details.candidate?.display_name ||
      details.candidate?.name ||
      [details.first_name, details.last_name].filter(Boolean).join(' ') ||
      null;
    const email = details.email || details.candidate?.email || details.contact_information?.email || null;
    const profileCompleted = Boolean(fullName && email);

    // Candidates can satisfy documentation either by uploading files or by manual entry of examination results
    const resultEntriesRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM jupeb_result_entries WHERE registration_id = $1`,
      [reg.id],
    );
    const hasResultEntries = (Number(resultEntriesRows[0]?.count) || 0) > 0;
    const documentsCompleted = docs.length > 0 || hasResultEntries;

    const bioRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM jupeb_biometric_captures WHERE registration_id = $1 AND replaced_at IS NULL`,
      [reg.id],
    );
    const bioCount = Number(bioRows[0]?.count) || 0;
    const biometricsSkipped = Boolean(
      (reg as any).face_skipped_at ||
      (reg as any).fingerprint_skipped_at ||
      (reg as any).faceSkippedAt ||
      (reg as any).fingerprintSkippedAt,
    );
    const biometricsCompleted =
      Boolean((details as any).has_biometrics) ||
      Boolean(details.candidate?.photo_url) ||
      bioCount > 0 ||
      biometricsSkipped;

    const subjectsConfirmed = Boolean(
      details.subject_combination?.id ||
      (details as any).subject_combination_id ||
      reg.subjectCombinationId,
    );

    const missing: string[] = [];
    if (!profileCompleted) missing.push('Profile details');
    if (!documentsCompleted) missing.push('Supporting documents');
    if (!biometricsCompleted) missing.push('Biometric capture');
    if (!subjectsConfirmed) missing.push('Subject combination');

    return {
      ...details,
      registration_id: reg.id,
      candidate: details.candidate,
      basic_information: details.basic_information,
      contact_information: details.contact_information,
      next_of_kin: details.next_of_kin || null,
      subject_combination: details.subject_combination,
      documents: details.documents,
      biometrics: details.biometrics,
      biometric_status: details.biometric_status,
      photo_url: details.photo_url || details.profile_photo_url || details.candidate?.photo_url || null,
      profile_photo_url: details.profile_photo_url || details.candidate?.photo_url || null,
      face_photo_url: details.face_photo_url || details.candidate?.face_photo_url || null,
      captured_photo: details.captured_photo || details.candidate?.captured_photo || null,
      captured_photo_url: details.captured_photo_url || details.candidate?.captured_photo_url || null,
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

    const supportedSources = new Set(['waec', 'neco', 'nabteb', 'gce']);
    const source = query?.source ? String(query.source).toLowerCase().trim() : null;
    if (source && !supportedSources.has(source)) {
      throw new UnprocessableEntityException('source must be waec|neco|nabteb|gce');
    }
    const sitting = query?.sitting !== undefined && query?.sitting !== null
      ? Number(query.sitting)
      : null;
    if (sitting !== null && ![1, 2].includes(sitting)) {
      throw new UnprocessableEntityException('sitting must be 1 or 2');
    }

    let sql = `
      SELECT e.*, ores.confidence AS ocr_confidence, ores.exam_type_detected AS ocr_exam_type
      FROM jupeb_result_entries e
      LEFT JOIN ocr_results ores ON ores.job_id = e.ocr_job_id
      WHERE e.registration_id = $1
    `;
    const params: any[] = [reg.id];
    if (source) {
      params.push(source);
      sql += ` AND LOWER(e.source) = $${params.length}`;
    }
    if (sitting !== null) {
      params.push(sitting);
      sql += ` AND e.sitting = $${params.length}`;
    }
    sql += ` ORDER BY e.source ASC, e.sitting ASC, e.serial ASC`;

    const rows = await this.dataSource.query(sql, params);
    const documents = (await this.docRepo.findByRegistrationId(reg.id)).filter(
      (document) =>
        ['submitted', 'accepted'].includes(document.status) &&
        Boolean(document.source) &&
        Boolean(document.sitting) &&
        (!source || document.source.toLowerCase() === source) &&
        (sitting === null || Number(document.sitting) === sitting),
    );
    const fileIds = Array.from(new Set(documents.map((document) => document.fileId).filter(Boolean)));
    const ocrRows = fileIds.length
      ? await this.dataSource.query(
          `SELECT DISTINCT ON (oj.file_id)
                  oj.file_id,
                  oj.id AS ocr_job_id,
                  oj.status AS ocr_status,
                  ores.confidence AS ocr_confidence,
                  ores.exam_type_detected AS ocr_exam_type
             FROM ocr_jobs oj
             LEFT JOIN ocr_results ores ON ores.job_id = oj.id
            WHERE oj.file_id = ANY($1::uuid[])
            ORDER BY oj.file_id, oj.created_at DESC`,
          [fileIds],
        )
      : [];
    const ocrByFile = new Map(ocrRows.map((row: any) => [row.file_id, row]));

    // Seed groups from uploaded documents so mobile can render pending/failed OCR.
    const groups: Record<string, any> = {};
    for (const document of documents) {
      const key = `${document.source}-${document.sitting}`;
      const ocr = ocrByFile.get(document.fileId) as any;
      groups[key] = {
        source: document.source,
        sitting: document.sitting,
        document_id: document.id,
        document_status: document.status,
        institution_type: document.institutionType || null,
        file_id: document.fileId,
        ocr_job_id: ocr?.ocr_job_id || null,
        ocr_status: ocr?.ocr_status || null,
        ocr_confidence:
          ocr?.ocr_confidence !== null && ocr?.ocr_confidence !== undefined
            ? Number(ocr.ocr_confidence)
            : null,
        ocr_exam_type: ocr?.ocr_exam_type || null,
        grades: [],
        subjects: [],
        origins: new Set<string>(),
      };
    }

    for (const row of rows) {
      const key = `${row.source}-${row.sitting}`;
      if (!groups[key]) {
        groups[key] = {
          source: row.source,
          sitting: row.sitting,
          document_id: null,
          document_status: null,
          institution_type: null,
          file_id: null,
          ocr_job_id: null,
          ocr_status: null,
          ocr_confidence: null,
          ocr_exam_type: null,
          grades: [],
          subjects: [],
          origins: new Set<string>(),
        };
      }
      groups[key].origins.add(row.origin);
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

    const results = Object.values(groups).map((group: any) => {
      const grades = group.grades.sort((a: any, b: any) => a.sn - b.sn);
      let parseStatus = grades.length > 0 ? 'complete' : 'empty';
      if (group.ocr_status === 'queued' || group.ocr_status === 'processing') {
        parseStatus = 'processing';
      } else if (group.ocr_status === 'failed') {
        parseStatus = 'failed';
      }
      return { ...group, grades, parse_status: parseStatus, origins: Array.from(group.origins) };
    });
    results.sort((a, b) =>
      a.source === b.source
        ? a.sitting - b.sitting
        : String(a.source).localeCompare(String(b.source)),
    );

    return {
      registration_id: reg.id,
      results,
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
    if (!dto?.subject_combination_id) return reg;

    const updated = await this.regRepo.updateById(reg.id, {
      subjectCombinationId: dto.subject_combination_id,
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
