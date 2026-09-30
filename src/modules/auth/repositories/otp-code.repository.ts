import { Injectable } from '@nestjs/common';
import { DataSource, Repository, IsNull } from 'typeorm';
import { OtpCodeEntity } from '../entities/otp-code.entity';

@Injectable()
export class OtpCodeRepository {
  private readonly repo: Repository<OtpCodeEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = this.dataSource.getRepository(OtpCodeEntity);
  }

  async purgeAndCreate(data: {
    userId: string;
    codeHash: string;
    channel: string;
    email?: string | null;
    phone?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    expiresAt: Date;
  }): Promise<OtpCodeEntity> {
    // Invalidate/delete unverified rows for this user
    await this.repo.delete({
      userId: data.userId,
      verifiedAt: IsNull(),
    });

    const otp = this.repo.create(data);
    return this.repo.save(otp);
  }

  async findLatestActiveOtp(userId: string): Promise<OtpCodeEntity | null> {
    return this.repo
      .createQueryBuilder('o')
      .where('o.user_id = :userId', { userId })
      .andWhere('o.verified_at IS NULL')
      .orderBy('o.created_at', 'DESC')
      .getOne();
  }

  async incrementAttemptCount(id: string): Promise<void> {
    await this.repo.increment({ id }, 'attemptCount', 1);
  }

  async markVerified(id: string): Promise<void> {
    await this.repo.update({ id }, { verifiedAt: new Date() });
  }
}
