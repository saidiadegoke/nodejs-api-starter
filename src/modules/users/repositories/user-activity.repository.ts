import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserActivityEntity } from '../entities/user-activity.entity';

@Injectable()
export class UserActivityRepository {
  constructor(
    @InjectRepository(UserActivityEntity)
    private readonly repo: Repository<UserActivityEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(data: {
    user_id: string;
    activity_type: string;
    target_user_id?: string | null;
    title: string;
    description?: string | null;
    metadata?: Record<string, any>;
  }) {
    const entity = this.repo.create({
      userId: data.user_id,
      activityType: data.activity_type,
      targetUserId: data.target_user_id || null,
      title: data.title,
      description: data.description || null,
      metadata: data.metadata || {},
    });
    return await this.repo.save(entity);
  }

  async getByUser(
    userId: string,
    { page = 1, limit = 20, activity_type = null }: { page?: number; limit?: number; activity_type?: string | null } = {},
  ) {
    const offset = (page - 1) * limit;
    let whereClause = 'ua.user_id = $1';
    const params: any[] = [userId, limit, offset];

    if (activity_type) {
      whereClause += ' AND ua.activity_type = $4';
      params.push(activity_type);
    }

    const query = `
      SELECT
        ua.*,
        target_user.email as target_user_email,
        target_prof.first_name as target_user_first_name,
        target_prof.last_name as target_user_last_name
      FROM user_activities ua
      LEFT JOIN users target_user ON ua.target_user_id = target_user.id
      LEFT JOIN profiles target_prof ON target_user.id = target_prof.user_id
      WHERE ${whereClause}
      ORDER BY ua.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    return await this.dataSource.query(query, params);
  }

  async getCountByUser(userId: string, activityType: string | null = null): Promise<number> {
    let whereClause = 'user_id = $1';
    const params: any[] = [userId];

    if (activityType) {
      whereClause += ' AND activity_type = $2';
      params.push(activityType);
    }

    const query = `
      SELECT COUNT(*) as count
      FROM user_activities
      WHERE ${whereClause}
    `;
    const res = await this.dataSource.query(query, params);
    return parseInt(res[0]?.count || '0', 10);
  }

  async delete(activityId: string, userId: string): Promise<boolean> {
    const res = await this.repo.delete({ id: activityId, userId });
    return (res.affected || 0) > 0;
  }
}
