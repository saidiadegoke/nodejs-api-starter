import { Injectable, NotFoundException } from '@nestjs/common';
import { LoggerFactory } from '../../../logger';
import { NotificationRepository } from '../repositories/notification.repository';
import {
  NotificationQueryDto,
  CreateNotificationDto,
  NotificationResponseDto,
  NotificationListResponseDto,
} from '../dto/notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger;

  constructor(
    private readonly notificationRepo: NotificationRepository,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(NotificationsService.name);
  }

  async getUserNotifications(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<NotificationListResponseDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.per_page || query.limit) || 20));
    const unreadOnly =
      query.unread_only === true ||
      query.filter === 'unread';

    const [rows, total, unreadCount] = await Promise.all([
      this.notificationRepo.getByUserWithActor(userId, {
        page,
        limit,
        unreadOnly,
      }),
      this.notificationRepo.countByUser(userId, unreadOnly),
      this.notificationRepo.getUnreadCount(userId),
    ]);

    const items: NotificationResponseDto[] = rows.map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      actor_id: r.actor_id || null,
      type: r.type || 'general',
      message: r.message,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {},
      is_read: Boolean(r.read),
      actor: r.actor_id
        ? {
            email: r.actor_email || null,
            first_name: r.actor_first_name || null,
            last_name: r.actor_last_name || null,
            photo: r.actor_photo || null,
          }
        : null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return {
      unread_count: unreadCount,
      items,
      pagination: {
        page,
        per_page: limit,
        total,
      },
      notifications: items,
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.getUnreadCount(userId);
  }

  async markAsRead(notificationId: string, userId: string, isRead = true) {
    const updated = await this.notificationRepo.markAsRead(notificationId, userId, isRead);
    if (!updated) {
      throw new NotFoundException('Notification not found');
    }
    return {
      id: updated.id,
      is_read: updated.read,
    };
  }

  async markAllAsRead(userId: string) {
    const updatedCount = await this.notificationRepo.markAllAsRead(userId);
    return {
      updated_count: updatedCount,
    };
  }

  async deleteNotification(notificationId: string, userId: string) {
    const deleted = await this.notificationRepo.delete(notificationId, userId);
    if (!deleted) {
      throw new NotFoundException('Notification not found');
    }
    return { deleted: true };
  }

  async deleteAllNotifications(userId: string) {
    const deletedCount = await this.notificationRepo.deleteAll(userId);
    return {
      deleted_count: deletedCount,
      deleted: true,
    };
  }

  async createNotification(data: CreateNotificationDto) {
    return this.notificationRepo.create({
      userId: data.user_id,
      type: data.type || 'general',
      actorId: data.actor_id || null,
      message: data.message,
      metadata: data.metadata || {},
    });
  }
}
