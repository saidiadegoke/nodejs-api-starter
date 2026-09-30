import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserSessionEntity } from '../entities/user-session.entity';

@Injectable()
export class UserSessionRepository {
  private readonly repo: Repository<UserSessionEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = this.dataSource.getRepository(UserSessionEntity);
  }

  async createSession(
    userId: string,
    refreshTokenHash: string,
    deviceInfo: { ip_address?: string; user_agent?: string; source?: string } = {}
  ): Promise<{ id: string; created_at: Date; expires_at: Date }> {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = this.repo.create({
      userId,
      refreshTokenHash,
      deviceInfo,
      expiresAt,
      ipAddress: deviceInfo.ip_address || null,
      userAgent: deviceInfo.user_agent || null,
    });

    const saved = await this.repo.save(session);
    return {
      id: saved.id,
      created_at: saved.createdAt,
      expires_at: saved.expiresAt,
    };
  }

  async findSession(sessionId: string): Promise<UserSessionEntity | null> {
    return this.repo
      .createQueryBuilder('s')
      .where('s.id = :sessionId', { sessionId })
      .andWhere('s.is_revoked = false')
      .andWhere('s.expires_at > NOW()')
      .getOne();
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.repo.update(
      { id: sessionId },
      {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'user_logout',
      }
    );
  }
}
