import { Injectable, NotFoundException } from '@nestjs/common';
import { UserActivityRepository } from '../repositories/user-activity.repository';

@Injectable()
export class UserActivityService {
  constructor(private readonly activityRepo: UserActivityRepository) {}

  async getUserActivities(
    userId: string,
    options: { page?: number; limit?: number; activity_type?: string | null } = {},
  ) {
    const page = options.page || 1;
    const limit = options.limit || 20;

    const activities = await this.activityRepo.getByUser(userId, options);
    const total = await this.activityRepo.getCountByUser(userId, options.activity_type);

    return {
      activities,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async deleteActivity(activityId: string, userId: string): Promise<void> {
    const deleted = await this.activityRepo.delete(activityId, userId);
    if (!deleted) {
      throw new NotFoundException('Activity not found');
    }
  }

  async logActivity(data: {
    user_id: string;
    activity_type: string;
    target_user_id?: string | null;
    title: string;
    description?: string | null;
    metadata?: Record<string, any>;
  }) {
    return await this.activityRepo.create(data);
  }
}
