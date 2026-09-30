import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PasswordResetEntity } from '../entities/password-reset.entity';

@Injectable()
export class PasswordResetRepository {
  private readonly repo: Repository<PasswordResetEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = this.dataSource.getRepository(PasswordResetEntity);
  }

  async createReset(data: {
    userId: string;
    tokenHash: string;
    email?: string | null;
    phone?: string | null;
    method: string;
    kind: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    expiresAt: Date;
  }): Promise<PasswordResetEntity> {
    const reset = this.repo.create(data);
    return this.repo.save(reset);
  }

  async invalidateActiveOtpResets(userId: string): Promise<void> {
    await this.repo.update(
      {
        userId,
        kind: 'otp',
        usedAt: undefined as any,
      },
      { usedAt: new Date() }
    );
  }

  async findActiveTokenReset(tokenHash: string): Promise<PasswordResetEntity | null> {
    return this.repo
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.user', 'user')
      .where('pr.token_hash = :tokenHash', { tokenHash })
      .andWhere("pr.kind = 'token'")
      .andWhere('pr.expires_at > NOW()')
      .andWhere('pr.used_at IS NULL')
      .getOne();
  }

  async findLatestActiveOtpReset(userId: string): Promise<PasswordResetEntity | null> {
    return this.repo
      .createQueryBuilder('pr')
      .where('pr.user_id = :userId', { userId })
      .andWhere("pr.kind = 'otp'")
      .andWhere('pr.used_at IS NULL')
      .orderBy('pr.created_at', 'DESC')
      .getOne();
  }

  async incrementAttemptCount(id: string): Promise<void> {
    await this.repo.increment({ id }, 'attemptCount', 1);
  }

  async markUsed(id: string): Promise<void> {
    await this.repo.update({ id }, { usedAt: new Date() });
  }
}
