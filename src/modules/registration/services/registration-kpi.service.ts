import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RegistrationStatus, getActiveStudentStatusCondition } from '../../../shared/enums';
import { SessionStatus } from '../../sessions/entities/academic-session.entity';

export const PENDING_STATUSES: RegistrationStatus[] = [
  RegistrationStatus.PROVISIONAL,
  RegistrationStatus.CODE_ISSUED,
  RegistrationStatus.CLAIMED,
  RegistrationStatus.PENDING_STUDENT_CONFIRM,
  RegistrationStatus.PENDING_DOCUMENTS,
  RegistrationStatus.PENDING_INSTITUTION_REVIEW,
];

export function deltaPct(current: number, previous?: number | null): number | null {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

export function growthTrend(curVal: number, prevVal?: number | null): string | null {
  if (prevVal === null || prevVal === undefined) return null;
  if (prevVal === 0 && curVal > 0) return 'new';
  if (curVal > prevVal) return 'up';
  if (curVal < prevVal) return 'down';
  return 'flat';
}

@Injectable()
export class RegistrationKpiService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Centralized KPI counts for a given university and/or session.
   * Per business rules, total student counts and biometric coverage MUST NOT
   * include rejected or withdrawn registrations.
   */
  async kpiCounts(universityId?: string | null, sessionId?: string | null) {
    const filters: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (universityId) {
      filters.push(`r.university_id = $${i++}`);
      params.push(universityId);
    }
    if (sessionId) {
      filters.push(`r.session_id = $${i++}`);
      params.push(sessionId);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const pendingIdx = i;
    params.push(PENDING_STATUSES);

    const activeFilter = getActiveStudentStatusCondition('r');

    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE ${activeFilter})::int AS total,
        COUNT(*) FILTER (WHERE r.status = '${RegistrationStatus.APPROVED}')::int AS approved,
        COUNT(*) FILTER (WHERE r.status = ANY($${pendingIdx}::text[]))::int AS pending,
        COUNT(*) FILTER (WHERE r.status = '${RegistrationStatus.REJECTED}')::int AS rejected,
        COUNT(*) FILTER (
          WHERE ${activeFilter} AND EXISTS (
            SELECT 1 FROM jupeb_biometric_captures bc
            WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL
          )
        )::int AS biometric,
        COUNT(*) FILTER (
          WHERE ${activeFilter} AND NOT EXISTS (
            SELECT 1 FROM jupeb_biometric_captures bc
            WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL
          )
        )::int AS without_biometric,
        COUNT(DISTINCT CASE
          WHEN ${activeFilter} AND r.subject_combination_id IS NOT NULL
          THEN r.subject_combination_id
        END)::int AS total_subject_combinations
      FROM jupeb_registrations r
      ${where}`;

    const r = await this.dataSource.query(sql, params);
    return r[0] || {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      biometric: 0,
      without_biometric: 0,
      total_subject_combinations: 0,
    };
  }

  /**
   * Centralized query to get the total active student registrations count.
   * Excludes rejected and withdrawn registrations.
   */
  async getActiveStudentCount(options: {
    universityId?: string | null;
    sessionId?: string | null;
    distinctUser?: boolean;
  } = {}): Promise<number> {
    const filters = [getActiveStudentStatusCondition('r')];
    const params: any[] = [];
    let idx = 1;

    if (options.universityId) {
      filters.push(`r.university_id = $${idx++}`);
      params.push(options.universityId);
    }
    if (options.sessionId) {
      filters.push(`r.session_id = $${idx++}`);
      params.push(options.sessionId);
    }

    const selectExpr = options.distinctUser ? 'COUNT(DISTINCT r.user_id)::int' : 'COUNT(r.id)::int';
    const sql = `SELECT ${selectExpr} AS count FROM jupeb_registrations r WHERE ${filters.join(' AND ')}`;
    const rows = await this.dataSource.query(sql, params);
    return Number(rows[0]?.count) || 0;
  }

  /**
   * Centralized enrolled student counts per university for a given session.
   * Excludes rejected and withdrawn registrations.
   */
  async getEnrolledCountsForUniversities(
    universityIds: string[],
    sessionId?: string | null,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!universityIds || !universityIds.length || !sessionId) return map;

    const result = await this.dataSource.query(
      `SELECT university_id, COUNT(*)::int AS c
       FROM jupeb_registrations
       WHERE university_id = ANY($1::uuid[])
         AND session_id = $2
         AND ${getActiveStudentStatusCondition('')}
       GROUP BY university_id`,
      [universityIds, sessionId],
    );

    for (const row of result) {
      map.set(row.university_id, row.c);
    }
    return map;
  }

  async resolveRegistrationSession(rawSessionId?: string | null) {
    if (rawSessionId) {
      const r = await this.dataSource.query(
        `SELECT * FROM jupeb_registration_sessions WHERE id = $1`,
        [rawSessionId],
      );
      return r[0] || null;
    }
    const open = await this.dataSource.query(
      `SELECT * FROM jupeb_registration_sessions WHERE status = '${SessionStatus.OPEN}' ORDER BY opens_at DESC LIMIT 1`,
    );
    if (open[0]) return open[0];
    const fallback = await this.dataSource.query(
      `SELECT * FROM jupeb_registration_sessions ORDER BY opens_at DESC LIMIT 1`,
    );
    return fallback[0] || null;
  }
}
