import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { NinVerificationRepository } from '../repositories/nin-verification.repository';
import { BiometricCaptureRepository } from '../repositories/biometric-capture.repository';
import { NinAdapterService } from './nin-adapter.service';
import { NinEventsService } from './nin-events.service';
import { NinVerificationStatus } from '../entities/nin-verification.entity';
import { BiometricCaptureEntity, BiometricCaptureType } from '../entities/biometric-capture.entity';
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
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(IdentityService.name);
  }

  private async getUserRoles(userId: string): Promise<string[]> {
    if (!userId) return [];
    try {
      const rows = await this.dataSource.query(
        `SELECT r.slug
         FROM roles r
         JOIN user_roles ur ON ur.role_id = r.id
         WHERE ur.user_id = $1`,
        [userId],
      );
      return rows.map((r: { slug: string }) => r.slug);
    } catch {
      return [];
    }
  }

  private async userHasPrivilegedRole(userId: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId);
    return roles.some((r) => PRIVILEGED_ROLES.has(r));
  }

  private sanitizeVerification(row: any): NinVerificationResponseDto | null {
    if (!row) return null;
    return {
      id: row.id,
      nin_last4: row.ninLast4 ?? row.nin_last4,
      provider: row.provider,
      provider_reference: row.providerReference ?? row.provider_reference,
      status: row.status,
      response_payload: row.responsePayload ?? row.response_payload,
      error: row.errorPayload ?? row.error_payload,
      error_message: (row.errorPayload ?? row.error_payload)?.message || null,
      verified_at: (row.verifiedAt ?? row.verified_at)?.toISOString?.() || row.verifiedAt || row.verified_at,
      retry_after: (row.retryAfter ?? row.retry_after)?.toISOString?.() || row.retryAfter || row.retry_after,
      intake_payload: row.intakePayload ?? row.intake_payload,
      created_at: (row.createdAt ?? row.created_at)?.toISOString?.() || row.createdAt || row.created_at,
    };
  }

  async verifyNin(
    dto: VerifyNinDto,
    userId?: string | null,
  ): Promise<NinVerificationResponseDto> {
    const normalized = normalizeNin(dto.nin);
    if (normalized.length !== 11) {
      throw new UnprocessableEntityException('NIN must be an 11-digit number');
    }

    const hashed = hashNin(normalized);
    const last4 = ninLast4(normalized);
    const intakePayload = dto.intake_payload || {};

    if (dto.idempotency_key) {
      const existing = await this.ninRepo.findByIdempotencyKey(dto.idempotency_key);
      if (existing) {
        if (Object.keys(intakePayload).length) {
          const merged = await this.ninRepo.mergeIntakePayload(existing.id, intakePayload);
          return this.sanitizeVerification(merged || existing)!;
        }
        return this.sanitizeVerification(existing)!;
      }
    }

    if (!dto.force_fresh) {
      const cached = await this.ninRepo.findActiveCacheByNinHash(hashed);
      if (cached) {
        if (Object.keys(intakePayload).length) {
          const merged = await this.ninRepo.mergeIntakePayload(cached.id, intakePayload);
          return this.sanitizeVerification(merged || cached)!;
        }
        return this.sanitizeVerification(cached)!;
      }
    }

    const { provider_name, result } = await this.ninAdapter.verifyNin(normalized, {
      provider: dto.provider,
      force_fresh: dto.force_fresh,
    });

    if (result.outcome === 'verified') {
      const created = await this.ninRepo.create({
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
      });
      await this.ninEvents.emitNinResolved(created.id, 'verified');
      return this.sanitizeVerification(created)!;
    }

    if (result.outcome === 'pending') {
      const created = await this.ninRepo.create({
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
      });
      return this.sanitizeVerification(created)!;
    }

    // Failed
    const created = await this.ninRepo.create({
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
    });
    await this.ninEvents.emitNinResolved(created.id, 'failed');
    return this.sanitizeVerification(created)!;
  }

  async retryVerification(verificationId: string, _userId?: string | null): Promise<NinVerificationResponseDto> {
    const row = await this.ninRepo.findById(verificationId);
    if (!row) throw new NotFoundException('Verification not found');
    if (row.status === NinVerificationStatus.VERIFIED) {
      return this.sanitizeVerification(row)!;
    }

    // Re-trigger adapter
    const dummyNin = `0000000${row.ninLast4}`;
    const { provider_name: _, result } = await this.ninAdapter.verifyNin(dummyNin, {
      provider: row.provider,
      force_fresh: true,
    });

    if (result.outcome === 'verified') {
      const updated = await this.ninRepo.markVerified(verificationId, {
        response_payload: result.profile || {},
        provider_reference: result.provider_reference,
      });
      await this.ninEvents.emitNinResolved(verificationId, 'verified');
      return this.sanitizeVerification(updated)!;
    }

    if (result.outcome === 'pending') {
      const updated = await this.ninRepo.incrementAttempt(verificationId, {
        retry_after: result.retry_after ? new Date(result.retry_after) : null,
        last_error_code: result.error?.code || null,
        error_payload: (result.error as Record<string, unknown>) || {},
      });
      return this.sanitizeVerification(updated || row)!;
    }

    const updated = await this.ninRepo.markFailed(verificationId, {
      error_payload: (result.error as Record<string, unknown>) || {},
      last_error_code: result.error?.code || null,
    });
    await this.ninEvents.emitNinResolved(verificationId, 'failed');
    return this.sanitizeVerification(updated || row)!;
  }

  async getVerification(verificationId: string, _userId?: string | null): Promise<NinVerificationResponseDto> {
    const row = await this.ninRepo.findById(verificationId);
    if (!row) throw new NotFoundException('Verification not found');
    return this.sanitizeVerification(row)!;
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
    const merged = await this.ninRepo.mergeIntakePayload(verificationId, mergedToPersist);
    return this.sanitizeVerification(merged || row)!;
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
