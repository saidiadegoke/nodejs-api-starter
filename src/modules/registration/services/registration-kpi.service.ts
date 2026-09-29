import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const PENDING_STATUSES = [
  'provisional',
  'code_issued',
  'claimed',
  'pending_student_confirm',
  'pending_documents',
  'pending_institution_review',
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

    const sql = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE r.status = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE r.status = ANY($${pendingIdx}::text[]))::int AS pending,
        COUNT(*) FILTER (WHERE r.status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (
          WHERE r.status <> 'withdrawn' AND EXISTS (
            SELECT 1 FROM jupeb_biometric_captures bc
            WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL
          )
        )::int AS biometric,
        COUNT(*) FILTER (
          WHERE r.status <> 'withdrawn' AND NOT EXISTS (
            SELECT 1 FROM jupeb_biometric_captures bc
            WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL
          )
        )::int AS without_biometric,
        COUNT(DISTINCT CASE
          WHEN r.status <> 'withdrawn' AND r.subject_combination_id IS NOT NULL
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

  async resolveRegistrationSession(rawSessionId?: string | null) {
    if (rawSessionId) {
      const r = await this.dataSource.query(
        `SELECT * FROM jupeb_registration_sessions WHERE id = $1`,
        [rawSessionId],
      );
      return r[0] || null;
    }
    const open = await this.dataSource.query(
      `SELECT * FROM jupeb_registration_sessions WHERE status = 'open' ORDER BY opens_at DESC LIMIT 1`,
    );
    if (open[0]) return open[0];
    const fallback = await this.dataSource.query(
      `SELECT * FROM jupeb_registration_sessions ORDER BY opens_at DESC LIMIT 1`,
    );
    return fallback[0] || null;
  }
}
