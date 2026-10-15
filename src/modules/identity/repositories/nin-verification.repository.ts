import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NinVerificationEntity, NinVerificationStatus } from '../entities/nin-verification.entity';

@Injectable()
export class NinVerificationRepository {
  constructor(
    @InjectRepository(NinVerificationEntity)
    private readonly repo: Repository<NinVerificationEntity>,
  ) {}

  async findById(id: string): Promise<NinVerificationEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByIdempotencyKey(key: string): Promise<NinVerificationEntity | null> {
    if (!key) return null;
    return this.repo.findOne({
      where: { idempotencyKey: key },
      order: { createdAt: 'DESC' },
    });
  }

  async findActiveCacheByNinHash(ninHash: string): Promise<NinVerificationEntity | null> {
    if (!ninHash) return null;
    return this.repo
      .createQueryBuilder('n')
      .where('n.nin_hash = :ninHash', { ninHash })
      .andWhere('n.status = :status', { status: NinVerificationStatus.VERIFIED })
      .andWhere('n.cleared_at IS NULL')
      .orderBy('n.created_at', 'DESC')
      .getOne();
  }

  async findActiveCacheByNinHashBatch(hashes: string[]): Promise<NinVerificationEntity[]> {
    if (!Array.isArray(hashes) || !hashes.length) return [];
    return this.repo
      .createQueryBuilder('n')
      .distinctOn(['n.nin_hash'])
      .where('n.nin_hash IN (:...hashes)', { hashes })
      .andWhere('n.status = :status', { status: NinVerificationStatus.VERIFIED })
      .andWhere('n.cleared_at IS NULL')
      .orderBy('n.nin_hash')
      .addOrderBy('n.created_at', 'DESC')
      .getMany();
  }

  async create(data: Partial<NinVerificationEntity>): Promise<NinVerificationEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async mergeIntakePayload(
    id: string,
    partial: Record<string, any>,
  ): Promise<NinVerificationEntity | null> {
    if (!id || !partial || typeof partial !== 'object') return null;
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(partial)) {
      if (v !== undefined && v !== null && v !== '') cleaned[k] = v;
    }
    if (!Object.keys(cleaned).length) return this.findById(id);

    const existing = await this.findById(id);
    if (!existing) return null;

    const currentIntake = (existing.intakePayload && typeof existing.intakePayload === 'object')
      ? existing.intakePayload
      : {};
    existing.intakePayload = { ...currentIntake, ...cleaned };
    return this.repo.save(existing);
  }

  async markVerified(
    id: string,
    params: { response_payload: Record<string, any>; provider_reference?: string | null },
  ): Promise<NinVerificationEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    existing.status = NinVerificationStatus.VERIFIED;
    existing.responsePayload = params.response_payload;
    if (params.provider_reference) existing.providerReference = params.provider_reference;
    existing.errorPayload = {};
    existing.verifiedAt = new Date();
    existing.retryAfter = null;
    existing.lastErrorCode = null;
    existing.lastAttemptAt = new Date();
    existing.attemptCount = (existing.attemptCount || 0) + 1;

    return this.repo.save(existing);
  }

  async markFailed(
    id: string,
    params: { error_payload: Record<string, any>; last_error_code?: string | null },
  ): Promise<NinVerificationEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    existing.status = NinVerificationStatus.FAILED;
    existing.errorPayload = params.error_payload;
    existing.retryAfter = null;
    existing.lastErrorCode = params.last_error_code || null;
    existing.lastAttemptAt = new Date();
    existing.attemptCount = (existing.attemptCount || 0) + 1;

    return this.repo.save(existing);
  }

  /**
   * Transition any row (e.g. a previously failed one being retried under the
   * same idempotency key) back to pending with a fresh attempt recorded.
   * Unlike incrementAttempt, this is not restricted to pending rows.
   */
  async markPending(
    id: string,
    params: { retry_after?: Date | null; last_error_code?: string | null; error_payload?: Record<string, any> },
  ): Promise<NinVerificationEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    existing.status = NinVerificationStatus.PENDING;
    if (params.retry_after !== undefined) existing.retryAfter = params.retry_after;
    if (params.last_error_code !== undefined) existing.lastErrorCode = params.last_error_code;
    if (params.error_payload !== undefined) existing.errorPayload = params.error_payload;
    existing.lastAttemptAt = new Date();
    existing.attemptCount = (existing.attemptCount || 0) + 1;

    return this.repo.save(existing);
  }

  async incrementAttempt(
    id: string,
    params: { retry_after?: Date | null; last_error_code?: string | null; error_payload?: Record<string, any> },
  ): Promise<NinVerificationEntity | null> {
    const existing = await this.findById(id);
    if (!existing || existing.status !== NinVerificationStatus.PENDING) return null;

    if (params.retry_after !== undefined) existing.retryAfter = params.retry_after;
    if (params.last_error_code !== undefined) existing.lastErrorCode = params.last_error_code;
    if (params.error_payload !== undefined) existing.errorPayload = params.error_payload;
    existing.lastAttemptAt = new Date();
    existing.attemptCount = (existing.attemptCount || 0) + 1;

    return this.repo.save(existing);
  }

  async clearById(id: string): Promise<NinVerificationEntity | null> {
    const existing = await this.findById(id);
    if (!existing || existing.clearedAt) return existing;

    existing.responsePayload = {};
    existing.clearedAt = new Date();
    return this.repo.save(existing);
  }

  async findDuePending(options: { now?: Date; limit?: number } = {}): Promise<NinVerificationEntity[]> {
    const limit = Math.max(1, Math.min(500, options.limit || 50));
    const cutoff = options.now || new Date();

    return this.repo
      .createQueryBuilder('n')
      .where('n.status = :status', { status: NinVerificationStatus.PENDING })
      .andWhere('n.retry_after IS NOT NULL AND n.retry_after <= :cutoff', { cutoff })
      .orderBy('n.retry_after', 'ASC')
      .limit(limit)
      .getMany();
  }
}
