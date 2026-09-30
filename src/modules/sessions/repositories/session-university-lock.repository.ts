import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionUniversityLockEntity } from '../entities/session-university-lock.entity';

export interface UniversityLockRow {
  university_id: string;
  university_name: string;
  university_code: string;
  university_short_name: string | null;
  locked: boolean;
  reason: string | null;
  locked_at: string | null;
  locked_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  locked_by_name: string | null;
  locked_by_display_name: string | null;
  locked_by_email: string | null;
}

export interface UniversityLocksFilter {
  page?: number;
  limit?: number;
  q?: string;
  locked?: string | boolean | number;
}

@Injectable()
export class SessionUniversityLockRepository {
  constructor(
    @InjectRepository(SessionUniversityLockEntity)
    private readonly repo: Repository<SessionUniversityLockEntity>,
  ) {}

  async isUniversityRegistrationLocked(
    sessionId: string,
    universityId: string,
  ): Promise<boolean> {
    if (!sessionId || !universityId) return false;
    const lock = await this.repo.findOne({
      where: { sessionId, universityId },
    });
    return Boolean(lock?.locked);
  }

  async setUniversityRegistrationLocks(
    sessionId: string,
    params: {
      universityIds: string[];
      locked: boolean;
      reason?: string | null;
      userId?: string | null;
    },
  ): Promise<SessionUniversityLockEntity[]> {
    const { universityIds, locked, reason, userId } = params;
    const now = new Date();
    const results: SessionUniversityLockEntity[] = [];

    for (const universityId of universityIds) {
      let lock = await this.repo.findOne({
        where: { sessionId, universityId },
      });

      if (lock) {
        lock.locked = locked;
        if (locked) {
          lock.reason = reason || null;
          lock.lockedAt = now;
          lock.lockedBy = userId || null;
        }
        lock.updatedAt = now;
        lock.updatedBy = userId || null;
        lock = await this.repo.save(lock);
      } else {
        lock = this.repo.create({
          sessionId,
          universityId,
          locked,
          reason: locked ? (reason || null) : null,
          lockedAt: locked ? now : null,
          lockedBy: locked ? (userId || null) : null,
          updatedAt: now,
          updatedBy: userId || null,
        });
        lock = await this.repo.save(lock);
      }
      results.push(lock);
    }

    return results;
  }

  async getUniversityRegistrationLocks(
    sessionId: string,
    filter: UniversityLocksFilter = {},
  ): Promise<{
    rows: UniversityLockRow[];
    total: number;
    page: number;
    limit: number;
  }> {
    const parsedPage = Math.max(1, Number(filter.page) || 1);
    const parsedLimit = Math.min(100, Math.max(1, Number(filter.limit) || 50));
    const offset = (parsedPage - 1) * parsedLimit;

    const entityManager = this.repo.manager;

    const values: any[] = [sessionId];
    const where: string[] = ['u.deleted_at IS NULL'];
    let idx = 2;

    if (filter.locked !== undefined && filter.locked !== null && filter.locked !== '') {
      const isLocked =
        filter.locked === 'true' ||
        filter.locked === true ||
        filter.locked === 1 ||
        filter.locked === '1';
      if (isLocked) {
        where.push(`l.locked = true`);
      } else {
        where.push(`(l.locked IS NULL OR l.locked = false)`);
      }
    }

    if (filter.q && String(filter.q).trim()) {
      const term = `%${String(filter.q).trim()}%`;
      where.push(`(
        u.name ILIKE $${idx} OR
        u.code ILIKE $${idx} OR
        u.short_name ILIKE $${idx}
      )`);
      values.push(term);
      idx += 1;
    }

    const whereSql = where.join(' AND ');

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM jupeb_universities u
      LEFT JOIN jupeb_session_university_locks l
        ON l.university_id = u.id AND l.session_id = $1
      WHERE ${whereSql}
    `;

    const countResult = await entityManager.query(countSql, values);
    const total = countResult[0]?.total || 0;

    values.push(parsedLimit, offset);
    const dataSql = `
      SELECT
        u.id AS university_id,
        u.name AS university_name,
        u.code AS university_code,
        u.short_name AS university_short_name,
        COALESCE(l.locked, false) AS locked,
        l.reason,
        l.locked_at,
        l.locked_by,
        l.updated_at,
        l.updated_by,
        NULLIF(TRIM(CONCAT_WS(' ', up.first_name, up.last_name)), '') AS locked_by_name,
        up.display_name AS locked_by_display_name,
        u_user.email AS locked_by_email
      FROM jupeb_universities u
      LEFT JOIN jupeb_session_university_locks l
        ON l.university_id = u.id AND l.session_id = $1
      LEFT JOIN profiles up
        ON up.user_id = l.locked_by
      LEFT JOIN users u_user
        ON u_user.id = l.locked_by
      WHERE ${whereSql}
      ORDER BY COALESCE(l.locked, false) DESC, u.name ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const rows = await entityManager.query(dataSql, values);

    return {
      rows,
      total,
      page: parsedPage,
      limit: parsedLimit,
    };
  }
}
