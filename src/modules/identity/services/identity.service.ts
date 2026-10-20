import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoggerFactory } from '../../../logger';
import { NinVerificationRepository } from '../repositories/nin-verification.repository';
import { BiometricCaptureRepository } from '../repositories/biometric-capture.repository';
import { NinAdapterService } from './nin-adapter.service';
import { NinEventsService } from './nin-events.service';
import { NinWriteThroughService } from './nin-write-through.service';
import { NinVerificationStatus } from '../entities/nin-verification.entity';
import { BiometricCaptureEntity, BiometricCaptureType } from '../entities/biometric-capture.entity';
import { RegistrationEvent } from '../../registration/constants/registration-events.enum';
import { InstitutionRegistrationLockService } from '../../sessions/services/institution-registration-lock.service';
import { SyncEvent } from '../../sync/constants/sync-events.enum';
import {
  VerifyNinDto,
  PatchNinIntakeDto,
  CreateBiometricDto,
  ReplaceBiometricDto,
  SkipBiometricDto,
  NinVerificationResponseDto,
  BiometricResponseDto,
} from '../dto';
import {
  normalizeNin,
  hashNin,
  ninLast4,
  validateBiometricPayload,
} from '../utils/identity-crypto.util';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(id?: string | null): boolean {
  if (!id) return false;
  return UUID_REGEX.test(String(id).trim());
}

const PRIVILEGED_ROLES = new Set([
  'super_admin',
  'admin',
  'registrar',
  'program_director',
  'institution_admin',
]);

const SKIPPABLE_TYPES = new Set(['face', 'fingerprint']);

@Injectable()
export class IdentityService {
  private readonly logger;

  constructor(
    private readonly ninRepo: NinVerificationRepository,
    private readonly biometricRepo: BiometricCaptureRepository,
    private readonly ninAdapter: NinAdapterService,
    private readonly ninEvents: NinEventsService,
    private readonly ninWriteThrough: NinWriteThroughService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
    private readonly registrationLock: InstitutionRegistrationLockService,
  ) {
    this.logger = this.loggerFactory.create(IdentityService.name);
  }

  private async getUserRoles(userId: string): Promise<string[]> {
    if (!userId) return [];
    try {
      const rows = await this.dataSource.query(
        `SELECT r.name
         FROM roles r
         JOIN user_roles ur ON ur.role_id = r.id
         WHERE ur.user_id = $1`,
        [userId],
      );
      return rows.map((r: { name: string }) => r.name);
    } catch {
      return [];
    }
  }

  private async userHasPrivilegedRole(userId: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId);
    return roles.some((r) => PRIVILEGED_ROLES.has(r));
  }

  private async hasBlockingRegistration(ninHash: string, sessionId?: string | null): Promise<boolean> {
    if (!ninHash) return false;
    const params: any[] = [ninHash];
    let query = `
      SELECT 1 FROM jupeb_registrations r
      JOIN jupeb_nin_verifications nv ON nv.id = r.nin_verification_id
      WHERE nv.nin_hash = $1
        AND r.status NOT IN ('rejected', 'withdrawn')
    `;
    if (sessionId) {
      params.push(sessionId);
      query += ` AND r.session_id = $2`;
    }
    query += ` LIMIT 1`;
    const rows = await this.dataSource.query(query, params).catch(() => []);
    return rows.length > 0;
  }

  private async enrichVerifyContext(rowId: string, userId?: string | null): Promise<Record<string, any>> {
    const extra: Record<string, any> = {};
    if (!userId || !isUuid(userId)) return extra;
    try {
      const [callerRows, regRows] = await Promise.all([
        this.dataSource.query(
          `SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.last_login_at,
                  p.title AS profile_title, p.first_name, p.last_name, p.display_name,
                  p.date_of_birth, p.gender, p.profile_photo_url, p.residential_address,
                  p.state_of_origin, p.lga, p.place_of_birth
             FROM users u
             LEFT JOIN profiles p ON p.user_id = u.id
            WHERE u.id = $1
            LIMIT 1`,
          [userId],
        ),
        this.dataSource.query(
          `SELECT r.id, r.status, r.session_id, r.university_id, r.subject_combination_id,
                  r.user_id, r.nin_verification_id, r.institution_issued_code,
                  r.provisional_candidate_code, r.jupeb_candidate_number,
                  r.claimed_at, r.submitted_at, r.approved_at, r.created_at, r.updated_at
             FROM jupeb_registrations r
            WHERE r.nin_verification_id = $1
            ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC
            LIMIT 1`,
          [rowId],
        ),
      ]);

      const c = callerRows[0];
      if (c) {
        extra.caller_user = {
          id: c.id,
          email: c.email,
          phone: c.phone,
          email_verified: c.email_verified,
          phone_verified: c.phone_verified,
          last_login_at: c.last_login_at,
          profile: {
            title: c.profile_title,
            first_name: c.first_name,
            last_name: c.last_name,
            display_name: c.display_name,
            date_of_birth: c.date_of_birth,
            gender: c.gender,
            profile_photo_url: c.profile_photo_url,
            residential_address: c.residential_address,
            state_of_origin: c.state_of_origin,
            lga: c.lga,
            place_of_birth: c.place_of_birth,
          },
        };
      }
      if (regRows[0]) {
        extra.registration = regRows[0];
      }
    } catch {
      // non-fatal
    }
    return extra;
  }

  private async resolveSubjectCombination(
    intakePayload?: any,
    extraReg?: any,
  ): Promise<any> {
    const intakeCombId =
      intakePayload?.subject_combination_id ||
      intakePayload?.subjectCombinationId;
    const regCombId = extraReg?.subject_combination_id;
    const targetId = intakeCombId || regCombId;

    if (!targetId || !isUuid(String(targetId))) return null;

    try {
      const rows = await this.dataSource.query(
        `SELECT sc.id, sc.code, sc.title, sc.status, sc.university_id, sc.created_at, sc.updated_at,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', s.id,
                      'code', s.code,
                      'name', s.name,
                      'position', sci.position
                    ) ORDER BY sci.position ASC
                  ) FILTER (WHERE s.id IS NOT NULL),
                  '[]'::json
                ) AS subject_items
         FROM jupeb_subject_combinations sc
         LEFT JOIN jupeb_subject_combination_items sci ON sci.combination_id = sc.id
         LEFT JOIN jupeb_subjects s ON s.id = sci.subject_id AND s.deleted_at IS NULL
         WHERE sc.id = $1 AND sc.deleted_at IS NULL
         GROUP BY sc.id`,
        [targetId],
      );
      if (rows[0]) {
        return rows[0];
      }
    } catch {
      // non-fatal
    }
    return null;
  }

  private async sanitizeVerification(row: any, userId?: string | null): Promise<any> {
    if (!row) return null;
    const rawPayload =
      (row.responsePayload ?? row.response_payload) &&
      typeof (row.responsePayload ?? row.response_payload) === 'object'
        ? (row.responsePayload ?? row.response_payload)
        : {};
    const intakePayloadObj =
      (row.intakePayload ?? row.intake_payload) &&
      typeof (row.intakePayload ?? row.intake_payload) === 'object'
        ? (row.intakePayload ?? row.intake_payload)
        : {};
    const errorPayload =
      (row.errorPayload ?? row.error_payload) &&
      typeof (row.errorPayload ?? row.error_payload) === 'object'
        ? (row.errorPayload ?? row.error_payload)
        : {};
    const ninLast4Val = row.ninLast4 ?? row.nin_last4;

    const profile = {
      ...rawPayload,
      nin_last4: ninLast4Val,
    };

    const out: any = {
      id: row.id,
      verification_id: row.id,
      status: row.status,
      nin_last4: ninLast4Val,
      provider: row.provider,
      provider_reference: row.providerReference ?? row.provider_reference ?? null,
      profile,
      response_payload: rawPayload,
      intake_payload: intakePayloadObj,
      error: errorPayload,
      error_message: (row.errorPayload ?? row.error_payload)?.message || null,
      verified_at: (row.verifiedAt ?? row.verified_at)?.toISOString?.() || row.verifiedAt || row.verified_at || null,
      retry_after: (row.retryAfter ?? row.retry_after)?.toISOString?.() || row.retryAfter || row.retry_after || null,
      last_error_code: row.lastErrorCode ?? row.last_error_code ?? null,
      created_at: (row.createdAt ?? row.created_at)?.toISOString?.() || row.createdAt || row.created_at,
    };

    if (row.status === 'pending') {
      if (errorPayload?.message || errorPayload?.error_message) {
        out.error_message = errorPayload.message || errorPayload.error_message;
      }
    }

    const extra = await this.enrichVerifyContext(row.id, userId);
    const subjectCombination = await this.resolveSubjectCombination(intakePayloadObj, extra.registration);
    if (subjectCombination) {
      out.subject_combination = subjectCombination;
    }
    Object.assign(out, extra);
    return out;
  }

  async verifyNin(
    dto: VerifyNinDto,
    userId?: string | null,
  ): Promise<any> {
    const normalized = normalizeNin(dto.nin);
    if (normalized.length !== 11) {
      throw new UnprocessableEntityException('NIN must be an 11-digit number');
    }

    const hashed = hashNin(normalized);
    const last4 = ninLast4(normalized);
    const intakePayload = dto.intake_payload || {};
    const intakeEmail = typeof intakePayload.email === 'string'
      ? intakePayload.email.trim().toLowerCase()
      : '';

    // A locked institution (or session) must not be able to run new NIN
    // verifications — the lock is enforced before the provider is called so a
    // blocked attempt is never billed.
    await this.registrationLock.assertRegistrationAllowed({
      sessionId: dto.session_id || (intakePayload as any)?.session_id || null,
      universityId: (intakePayload as any)?.university_id || null,
      actorUserId: userId,
    });

    if (intakeEmail) {
      const existingUsers = await this.dataSource.query(
        `SELECT id
         FROM users
         WHERE LOWER(email) = $1
           AND deleted_at IS NULL
         LIMIT 1`,
        [intakeEmail],
      );
      if (existingUsers.length) {
        throw new ConflictException({
          message: 'Email already in use',
          error_code: 'email_in_use',
        });
      }
    }

    const targetSessionId = dto.session_id || (intakePayload as any)?.session_id || null;
    if (targetSessionId) {
      const blockedInSession = await this.hasBlockingRegistration(hashed, targetSessionId);
      if (blockedInSession) {
        throw new ConflictException({
          message: 'This NIN is already registered for this academic session. Duplicate NINs cannot be registered.',
          error_code: 'duplicate_nin_session',
          session_id: targetSessionId,
          nin_last4: last4,
        });
      }
    }

    const blockedGlobally = await this.hasBlockingRegistration(hashed);
    if (blockedGlobally) {
      throw new ConflictException({
        message: 'This NIN is already registered with an active candidate in the system. Duplicate NINs cannot be registered.',
        error_code: 'duplicate_nin',
        nin_last4: last4,
      });
    }

    // Idempotency: replay the in-flight or resolved row for a reused key —
    // except terminal failures, which must never be replayed. A failed row
    // falls through for a fresh upstream attempt and is updated in place
    // below (preserves the unique idempotency key and the attempt history).
    let idempotentFailedRow: any = null;
    if (dto.idempotency_key) {
      const existing = await this.ninRepo.findByIdempotencyKey(dto.idempotency_key);
      if (existing) {
        if (existing.status === NinVerificationStatus.FAILED) {
          idempotentFailedRow = existing;
        } else {
          if (Object.keys(intakePayload).length) {
            const merged = await this.ninRepo.mergeIntakePayload(existing.id, intakePayload);
            return this.sanitizeVerification(merged || existing, userId);
          }
          return this.sanitizeVerification(existing, userId);
        }
      }
    }

    if (!dto.force_fresh) {
      const cached = await this.ninRepo.findActiveCacheByNinHash(hashed);
      if (cached) {
        if (Object.keys(intakePayload).length) {
          const merged = await this.ninRepo.mergeIntakePayload(cached.id, intakePayload);
          return this.sanitizeVerification(merged || cached, userId);
        }
        return this.sanitizeVerification(cached, userId);
      }
    }

    const { provider_name, result } = await this.ninAdapter.verifyNin(normalized, {
      provider: dto.provider,
      force_fresh: dto.force_fresh,
    });

    if (result.outcome === 'verified') {
      let row: any = null;
      if (idempotentFailedRow) {
        if (Object.keys(intakePayload).length) {
          await this.ninRepo.mergeIntakePayload(idempotentFailedRow.id, intakePayload);
        }
        row = await this.ninRepo.markVerified(idempotentFailedRow.id, {
          response_payload: result.profile || {},
          provider_reference: result.provider_reference || null,
        });
      }
      const created =
        row ||
        (await this.ninRepo.create({
          ninHash: hashed,
          ninLast4: last4,
          provider: provider_name,
          providerReference: result.provider_reference || null,
          idempotencyKey: dto.idempotency_key || null,
          status: NinVerificationStatus.VERIFIED,
          responsePayload: result.profile || {},
          errorPayload: {},
          verifiedAt: new Date(),
          requestedBy: userId || null,
          intakePayload,
        }));
      await this.ninEvents.emitNinResolved(created.id, 'verified');
      return this.sanitizeVerification(created, userId);
    }

    if (result.outcome === 'pending') {
      let row: any = null;
      if (idempotentFailedRow) {
        if (Object.keys(intakePayload).length) {
          await this.ninRepo.mergeIntakePayload(idempotentFailedRow.id, intakePayload);
        }
        row = await this.ninRepo.markPending(idempotentFailedRow.id, {
          retry_after: result.retry_after ? new Date(result.retry_after) : null,
          last_error_code: result.error?.code || null,
          error_payload: (result.error as Record<string, unknown>) || {},
        });
      }
      const created =
        row ||
        (await this.ninRepo.create({
          ninHash: hashed,
          ninLast4: last4,
          provider: provider_name,
          idempotencyKey: dto.idempotency_key || null,
          status: NinVerificationStatus.PENDING,
          responsePayload: {},
          errorPayload: (result.error as Record<string, unknown>) || {},
          requestedBy: userId || null,
          intakePayload,
          retryAfter: result.retry_after ? new Date(result.retry_after) : null,
          lastErrorCode: result.error?.code || null,
          attemptCount: 1,
          lastAttemptAt: new Date(),
        }));
      return this.sanitizeVerification(created, userId);
    }

    // Failed
    let failedRow: any = null;
    if (idempotentFailedRow) {
      if (Object.keys(intakePayload).length) {
        await this.ninRepo.mergeIntakePayload(idempotentFailedRow.id, intakePayload);
      }
      failedRow = await this.ninRepo.markFailed(idempotentFailedRow.id, {
        error_payload: (result.error as Record<string, unknown>) || {},
        last_error_code: result.error?.code || null,
      });
    }
    const created =
      failedRow ||
      (await this.ninRepo.create({
        ninHash: hashed,
        ninLast4: last4,
        provider: provider_name,
        idempotencyKey: dto.idempotency_key || null,
        status: NinVerificationStatus.FAILED,
        responsePayload: {},
        errorPayload: (result.error as Record<string, unknown>) || {},
        requestedBy: userId || null,
        intakePayload,
        lastErrorCode: result.error?.code || null,
        attemptCount: 1,
        lastAttemptAt: new Date(),
      }));
    await this.ninEvents.emitNinResolved(created.id, 'failed');
    return this.sanitizeVerification(created, userId);
  }

  async retryVerification(verificationId: string, userId?: string | null): Promise<any> {
    const row = await this.ninRepo.findById(verificationId);
    if (!row) throw new NotFoundException('Verification not found');

    await this.registrationLock.assertRegistrationAllowed({
      sessionId: (row.intakePayload as any)?.session_id || null,
      universityId: (row.intakePayload as any)?.university_id || null,
      actorUserId: userId,
    });

    if (row.status === NinVerificationStatus.VERIFIED) {
      // Idempotent: the record is already resolved, but the institution pressed
      // retry to repair a candidate — re-apply the payload and re-issue the code.
      await this.applyVerificationSideEffects(
        verificationId,
        (row.responsePayload as Record<string, any>) || {},
        userId,
      );
      return this.sanitizeVerification(row, userId);
    }

    // Re-trigger adapter
    const dummyNin = `0000000${row.ninLast4}`;
    const { provider_name: _, result } = await this.ninAdapter.verifyNin(dummyNin, {
      provider: row.provider,
      force_fresh: true,
    });

    if (result.outcome === 'verified') {
      const payload = (result.profile as Record<string, any>) || {};
      const updated = await this.ninRepo.markVerified(verificationId, {
        response_payload: payload,
        provider_reference: result.provider_reference,
      });
      await this.ninEvents.emitNinResolved(verificationId, 'verified');
      await this.applyVerificationSideEffects(verificationId, payload, userId);
      return this.sanitizeVerification(updated, userId);
    }

    if (result.outcome === 'pending') {
      const updated = await this.ninRepo.incrementAttempt(verificationId, {
        retry_after: result.retry_after ? new Date(result.retry_after) : null,
        last_error_code: result.error?.code || null,
        error_payload: (result.error as Record<string, unknown>) || {},
      });
      return this.sanitizeVerification(updated || row, userId);
    }

    const updated = await this.ninRepo.markFailed(verificationId, {
      error_payload: (result.error as Record<string, unknown>) || {},
      last_error_code: result.error?.code || null,
    });
    await this.ninEvents.emitNinResolved(verificationId, 'failed');
    return this.sanitizeVerification(updated || row, userId);
  }

  /**
   * Post-verification side effects for every registration linked to a resolved
   * NIN verification (legacy M.12 write-through + onboarding code re-issue):
   *
   *  - push the NIM-issued demographics into `profiles` / `jupeb_next_of_kin`
   *    (non-destructive: existing values win), and
   *  - re-send the institution-issued onboarding code to candidates who have
   *    not claimed it yet.
   *
   * Best-effort: a failure here must never fail the verification response.
   */
  private async applyVerificationSideEffects(
    verificationId: string,
    ninPayload: Record<string, any>,
    userId?: string | null,
  ): Promise<void> {
    let linked: Array<{ id: string }> = [];
    try {
      linked = await this.dataSource.query(
        `SELECT id FROM jupeb_registrations WHERE nin_verification_id = $1`,
        [verificationId],
      );
    } catch (err: any) {
      this.logger.warn(`[retry] linked-registration lookup failed: ${err?.message}`);
      return;
    }
    if (!linked.length) return;

    for (const reg of linked) {
      try {
        await this.ninWriteThrough.applyNinPayloadToRegistration({
          registrationId: reg.id,
          ninPayload,
          userId: userId || null,
        });
      } catch (err: any) {
        this.logger.warn(`[retry] NIN write-through failed for ${reg.id}: ${err?.message}`);
      }

      // Instant CRMS/Attendance sync for the repaired candidate.
      this.eventEmitter.emit(SyncEvent.CANDIDATE_UPDATED, {
        registrationId: reg.id,
        userId,
        data: { reason: 'nin_verification_retry' },
      });
    }

    // Re-issue the onboarding code only for registrations still awaiting claim —
    // once claimed the code is spent and the email is meaningless.
    try {
      const awaitingClaim = await this.dataSource.query(
        `SELECT id FROM jupeb_registrations
          WHERE nin_verification_id = $1
            AND user_id IS NULL
            AND status = 'code_issued'
            AND institution_issued_code IS NOT NULL`,
        [verificationId],
      );
      for (const reg of awaitingClaim) {
        this.eventEmitter.emit(RegistrationEvent.CODE_ISSUED, {
          registrationId: reg.id,
          userId,
        });
      }
    } catch (err: any) {
      this.logger.warn(`[retry] code re-issue lookup failed: ${err?.message}`);
    }
  }

  async getVerification(verificationId: string, userId?: string | null): Promise<any> {
    const row = await this.ninRepo.findById(verificationId);
    if (!row) throw new NotFoundException('Verification not found');
    return this.sanitizeVerification(row, userId);
  }

  async patchNinIntake(
    verificationId: string,
    dto: PatchNinIntakeDto,
    _userId?: string | null,
  ): Promise<NinVerificationResponseDto> {
    const row = await this.ninRepo.findById(verificationId);
    if (!row) throw new NotFoundException('Verification not found');

    const rawPayload = dto || {};
    const nested =
      (rawPayload.intake_payload && typeof rawPayload.intake_payload === 'object'
        ? rawPayload.intake_payload
        : rawPayload.intakePayload && typeof rawPayload.intakePayload === 'object'
          ? rawPayload.intakePayload
          : {}) || {};

    const flat: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawPayload)) {
      if (!['intake_payload', 'intakePayload'].includes(k) && v !== undefined) {
        flat[k] = v;
      }
    }

    const mergedToPersist = { ...nested, ...flat };

    await this.registrationLock.assertRegistrationAllowed({
      sessionId:
        (mergedToPersist as any).session_id || (row.intakePayload as any)?.session_id || null,
      universityId:
        (mergedToPersist as any).university_id || (row.intakePayload as any)?.university_id || null,
      actorUserId: _userId,
    });

    const merged = await this.ninRepo.mergeIntakePayload(verificationId, mergedToPersist);
    return this.sanitizeVerification(merged || row, _userId);
  }

  private sanitizeBiometric(entity: BiometricCaptureEntity): BiometricResponseDto {
    return {
      id: entity.id,
      registration_id: entity.registrationId,
      capture_type: entity.captureType,
      file_id: entity.fileId,
      external_reference: entity.externalReference,
      quality_score: entity.qualityScore != null ? Number(entity.qualityScore) : null,
      device_metadata: entity.deviceMetadata,
      captured_at: entity.capturedAt ? entity.capturedAt.toISOString() : new Date().toISOString(),
      replaced_at: entity.replacedAt ? entity.replacedAt.toISOString() : null,
      created_at: entity.createdAt ? entity.createdAt.toISOString() : new Date().toISOString(),
    };
  }

  async createBiometric(dto: CreateBiometricDto, userId?: string | null): Promise<BiometricResponseDto> {
    if (!dto.registration_id || !UUID_REGEX.test(dto.registration_id)) {
      throw new UnprocessableEntityException('registration_id is required and must be a valid UUID');
    }

    const regRows = await this.dataSource.query(
      `SELECT id, user_id, university_id, status FROM jupeb_registrations WHERE id = $1`,
      [dto.registration_id],
    );
    const reg = regRows[0];
    if (!reg) throw new NotFoundException('Registration not found');

    const isPrivileged = userId ? await this.userHasPrivilegedRole(userId) : false;
    if (userId && !isPrivileged && reg.user_id && reg.user_id !== userId) {
      throw new ForbiddenException('You do not have access to this registration');
    }

    const val = validateBiometricPayload(dto as any);
    if (val.ok === false) {
      throw new UnprocessableEntityException(val.error);
    }

    // If an active capture of same type exists, mark it as replaced
    const existingCaptures = await this.biometricRepo.findByRegistrationId(dto.registration_id);
    const activeSameType = existingCaptures.filter(
      (c) => c.captureType === dto.capture_type && !c.replacedAt,
    );
    for (const ex of activeSameType) {
      await this.biometricRepo.markReplaced(ex.id);
    }

    const capture = await this.biometricRepo.create({
      registrationId: dto.registration_id,
      captureType: dto.capture_type as BiometricCaptureType,
      fileId: val.file_id,
      externalReference: val.external_reference,
      qualityScore: dto.quality_score != null ? Number(dto.quality_score) : null,
      deviceMetadata: dto.device_metadata || {},
      capturedAt: dto.captured_at ? new Date(dto.captured_at) : new Date(),
    });

    // If face capture has file_id, apply to profile
    if (dto.capture_type === 'face' && val.file_id && reg.user_id) {
      try {
        const fileRows = await this.dataSource.query(`SELECT file_url FROM files WHERE id = $1`, [val.file_id]);
        const fileUrl = fileRows[0]?.file_url;
        if (fileUrl) {
          await this.dataSource.query(
            `UPDATE profiles SET profile_photo_url = $2, updated_at = NOW() WHERE user_id = $1`,
            [reg.user_id, fileUrl],
          );
        }
      } catch {
        // Non-fatal profile photo sync
      }
    }

    return this.sanitizeBiometric(capture);
  }

  async skipBiometric(
    registrationId: string,
    dto: SkipBiometricDto,
    userId?: string | null,
  ) {
    if (!SKIPPABLE_TYPES.has(dto.type)) {
      throw new UnprocessableEntityException('type must be face or fingerprint');
    }

    const regRows = await this.dataSource.query(
      `SELECT id, user_id, university_id, status FROM jupeb_registrations WHERE id = $1`,
      [registrationId],
    );
    const reg = regRows[0];
    if (!reg) throw new NotFoundException('Registration not found');

    const isPrivileged = userId ? await this.userHasPrivilegedRole(userId) : false;
    if (userId && !isPrivileged && reg.user_id && reg.user_id !== userId) {
      throw new ForbiddenException('You do not have access to this registration');
    }

    const col = dto.type === 'face' ? 'face_skipped_at' : 'fingerprint_skipped_at';
    const reasonCol = dto.type === 'face' ? 'face_skipped_reason' : 'fingerprint_skipped_reason';

    try {
      await this.dataSource.query(
        `UPDATE jupeb_registrations
         SET ${col} = NOW(), ${reasonCol} = $2, updated_at = NOW()
         WHERE id = $1`,
        [registrationId, dto.reason || null],
      );
    } catch {
      // If skip columns don't exist in older schemas, gracefully ignore
    }

    return {
      registration_id: registrationId,
      skipped_type: dto.type,
      reason: dto.reason || null,
      skipped_at: new Date().toISOString(),
    };
  }

  async listBiometrics(registrationId: string, userId?: string | null): Promise<BiometricResponseDto[]> {
    const regRows = await this.dataSource.query(
      `SELECT id, user_id, university_id FROM jupeb_registrations WHERE id = $1`,
      [registrationId],
    );
    const reg = regRows[0];
    if (!reg) throw new NotFoundException('Registration not found');

    const isPrivileged = userId ? await this.userHasPrivilegedRole(userId) : false;
    if (userId && !isPrivileged && reg.user_id && reg.user_id !== userId) {
      throw new ForbiddenException('You do not have access to this registration');
    }

    const rows = await this.biometricRepo.findByRegistrationId(registrationId);
    return rows.map((r) => this.sanitizeBiometric(r));
  }

  async getRegistrationPhoto(registrationId: string, userId?: string | null): Promise<{ photo_url: string | null }> {
    const regRows = await this.dataSource.query(
      `SELECT id, user_id, university_id FROM jupeb_registrations WHERE id = $1`,
      [registrationId],
    );
    const reg = regRows[0];
    if (!reg) throw new NotFoundException('Registration not found');

    const isPrivileged = userId ? await this.userHasPrivilegedRole(userId) : false;
    if (userId && !isPrivileged && reg.user_id && reg.user_id !== userId) {
      throw new ForbiddenException('You do not have access to this registration');
    }

    // 1) Face capture file
    const captures = await this.biometricRepo.findByRegistrationId(registrationId);
    const faceCapture = captures.find((c) => c.captureType === BiometricCaptureType.FACE && !c.replacedAt);

    if (faceCapture && faceCapture.fileId) {
      try {
        const fileRows = await this.dataSource.query(`SELECT file_url FROM files WHERE id = $1`, [faceCapture.fileId]);
        if (fileRows[0]?.file_url) return { photo_url: fileRows[0].file_url };
      } catch {
        // Fall through
      }
    }

    // 2) Profile photo
    if (reg.user_id) {
      try {
        const profileRows = await this.dataSource.query(
          `SELECT profile_photo_url FROM profiles WHERE user_id = $1`,
          [reg.user_id],
        );
        if (profileRows[0]?.profile_photo_url) {
          return { photo_url: profileRows[0].profile_photo_url };
        }
      } catch {
        // Fall through
      }
    }

    return { photo_url: null };
  }

  async replaceBiometric(
    captureId: string,
    dto: ReplaceBiometricDto,
    _userId?: string | null,
  ): Promise<BiometricResponseDto> {
    const capture = await this.biometricRepo.findById(captureId);
    if (!capture) throw new NotFoundException('Biometric capture not found');

    const val = validateBiometricPayload(dto as any);
    if (val.ok === false) throw new UnprocessableEntityException(val.error);

    await this.biometricRepo.markReplaced(captureId);

    const replacement = await this.biometricRepo.create({
      registrationId: capture.registrationId,
      captureType: dto.capture_type as BiometricCaptureType,
      fileId: val.file_id,
      externalReference: val.external_reference,
      qualityScore: dto.quality_score != null ? Number(dto.quality_score) : null,
      deviceMetadata: dto.device_metadata || {},
      capturedAt: dto.captured_at ? new Date(dto.captured_at) : new Date(),
    });

    return this.sanitizeBiometric(replacement);
  }

  async deleteBiometric(captureId: string, _userId?: string | null): Promise<BiometricResponseDto> {
    const deleted = await this.biometricRepo.deleteById(captureId);
    if (!deleted) throw new NotFoundException('Biometric capture not found');
    return this.sanitizeBiometric(deleted);
  }
}
