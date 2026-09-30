import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../entities/notification.entity';

export interface ListNotificationsOptions {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

@Injectable()
export class NotificationRepository {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repo: Repository<NotificationEntity>,
  ) {}

  async create(data: Partial<NotificationEntity>): Promise<NotificationEntity> {
    const notification = this.repo.create({
      ...data,
      metadata: data.metadata || {},
    });
    return this.repo.save(notification);
  }

  async findByIdAndUser(id: string, userId: string): Promise<NotificationEntity | null> {
    return this.repo.findOne({
      where: { id, userId },
    });
  }

  async getByUserWithActor(userId: string, options: ListNotificationsOptions = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const qb = this.repo
      .createQueryBuilder('n')
      .leftJoin('users', 'actor', 'n.actor_id = actor.id')
      .leftJoin('profiles', 'actor_prof', 'actor.id = actor_prof.user_id')
      .select([
        'n.id AS id',
        'n.user_id AS user_id',
        'n.actor_id AS actor_id',
        'n.type AS type',
        'n.message AS message',
        'n.metadata AS metadata',
        'n.read AS read',
        'n.created_at AS created_at',
        'n.updated_at AS updated_at',
        'actor.email AS actor_email',
        'actor_prof.first_name AS actor_first_name',
        'actor_prof.last_name AS actor_last_name',
        'actor_prof.profile_photo_url AS actor_photo',
      ])
      .where('n.user_id = :userId', { userId });

    if (options.unreadOnly) {
      qb.andWhere('n.read = false');
    }

    qb.orderBy('n.created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    return qb.getRawMany();
  }

  async countByUser(userId: string, unreadOnly = false): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId });

    if (unreadOnly) {
      qb.andWhere('n.read = false');
    }

    return qb.getCount();
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.repo.count({
      where: { userId, read: false },
    });
  }

  async markAsRead(id: string, userId: string, isRead = true): Promise<NotificationEntity | null> {
    const row = await this.findByIdAndUser(id, userId);
    if (!row) return null;
    row.read = isRead;
    row.readAt = isRead ? new Date() : null;
    return this.repo.save(row);
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ read: true, readAt: new Date() })
      .where('user_id = :userId AND read = false', { userId })
      .execute();
    return result.affected || 0;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.repo.delete({ id, userId });
    return (result.affected || 0) > 0;
  }

  async deleteAll(userId: string): Promise<number> {
    const result = await this.repo.delete({ userId });
    return result.affected || 0;
  }
}
