import {
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { InstitutionUserScopeService } from '../../registration/services/institution-user-scope.service';
import { SessionContextService } from '../../sessions/services/session-context.service';
import { SessionRepository } from '../../sessions/repositories/session.repository';
import {
  DashboardQueryDto,
  DashboardStatCardsResponseDto,
  DashboardQuickStatsResponseDto,
  DashboardStudentsStatusResponseDto,
  DashboardRegistrationTrendsResponseDto,
  InstitutionDistributionResponseDto,
  InstitutionTrendsResponseDto,
  SubjectCombinationDistributionResponseDto,
  SubjectEnrollmentItemDto,
  SessionTimelineResponseDto,
  RecentRegistrationItemDto,
  MetricValueDto,
} from '../dto';

import { RegistrationStatus } from '../../../shared/enums';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PENDING_STATUSES = [
  RegistrationStatus.PROVISIONAL,
  RegistrationStatus.CODE_ISSUED,
  RegistrationStatus.CLAIMED,
  RegistrationStatus.PENDING_STUDENT_CONFIRM,
  RegistrationStatus.PENDING_DOCUMENTS,
  RegistrationStatus.PENDING_INSTITUTION_REVIEW,
];

function isUuid(value: any): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function assertUuid(value: any, label: string): void {
  if (value && !isUuid(value)) {
    throw new UnprocessableEntityException(`${label} must be a valid UUID`);
  }
}

function deltaPct(current: number, previous?: number | null): number | null {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function monthBuckets(start: Date, end: Date): { year: number; month: number }[] {
  const buckets: { year: number; month: number }[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    buckets.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return buckets;
}

function statusBucket(status: string): string {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'withdrawn') return 'withdrawn';
  return 'pending';
}

@Injectable()
export class DashboardService {
  private readonly logger;

  constructor(
    private readonly institutionUserScopeService: InstitutionUserScopeService,
    private readonly sessionContextService: SessionContextService,
    private readonly sessionRepo: SessionRepository,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(DashboardService.name);
  }

  private async resolveUniversityId(userId: string, rawUniversityId?: string | null): Promise<string | null> {
    assertUuid(rawUniversityId, 'university_id');
    return this.institutionUserScopeService.effectiveUniversityId(userId, rawUniversityId || null);
  }

  private async resolveSessionForUser(userId: string, querySessionId?: string | null) {
    return this.sessionContextService.resolveEffectiveSession(userId, querySessionId || null);
  }

  private async findPreviousSession(currentSession: any) {
    if (!currentSession || !currentSession.opens_at) return null;
    const rows = await this.dataSource.query(
      `SELECT id, academic_year, opens_at, closes_at FROM jupeb_registration_sessions
       WHERE opens_at < $1 ORDER BY opens_at DESC LIMIT 1`,
      [currentSession.opens_at],
    );
    return rows[0] || null;
  }

  private async kpiCounts(universityId?: string | null, sessionId?: string | null) {
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

    const rows = await this.dataSource.query(sql, params);
    const r = rows[0] || {};
    return {
      total: Number(r.total) || 0,
      approved: Number(r.approved) || 0,
      pending: Number(r.pending) || 0,
      rejected: Number(r.rejected) || 0,
      biometric: Number(r.biometric) || 0,
      without_biometric: Number(r.without_biometric) || 0,
      total_subject_combinations: Number(r.total_subject_combinations) || 0,
    };
  }

  private async institutionStatusCounts() {
    const rows = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS onboarded,
         COUNT(*) FILTER (WHERE status = 'active')::int   AS active,
         COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive
       FROM jupeb_universities
       WHERE deleted_at IS NULL`,
    );
    const r = rows[0] || {};
    return {
      onboarded: Number(r.onboarded) || 0,
      active: Number(r.active) || 0,
      inactive: Number(r.inactive) || 0,
    };
  }

  private async subjectCatalogCounts() {
    const rows = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM jupeb_subjects WHERE deleted_at IS NULL) AS total_subjects,
         (SELECT COUNT(*)::int FROM jupeb_subjects WHERE deleted_at IS NULL AND status = 'inactive') AS inactive_subjects,
         (SELECT COUNT(*)::int FROM jupeb_subject_combinations WHERE deleted_at IS NULL) AS total_subject_combinations`,
    );
    const r = rows[0] || {};
    return {
      total_subjects: Number(r.total_subjects) || 0,
      inactive_subjects: Number(r.inactive_subjects) || 0,
      total_subject_combinations: Number(r.total_subject_combinations) || 0,
    };
  }

  async getScope(query: DashboardQueryDto, userId: string) {
    const scopedUniversityId = await this.resolveUniversityId(userId, query.university_id);
    const session = await this.resolveSessionForUser(userId, query.session_id);
    const context = await this.sessionContextService.getSessionContext(userId);

    let university = null;
    if (scopedUniversityId) {
      const rows = await this.dataSource.query(
        `SELECT id, name, code, status FROM jupeb_universities WHERE id = $1`,
        [scopedUniversityId],
      );
      university = rows[0] || null;
    }

    const effective = session ? this.sessionContextService.toSessionSummary(session) : context.effective_session;
    return {
      university,
      session: effective,
      active_session: context.active_session,
      viewing_session: context.viewing_session,
      effective_session: effective,
    };
  }

  async getStatCards(query: DashboardQueryDto, userId: string): Promise<DashboardStatCardsResponseDto> {
    const scopedUniversityId = await this.resolveUniversityId(userId, query.university_id);
    const currentSession = await this.resolveSessionForUser(userId, query.session_id);
    const previousSession = await this.findPreviousSession(currentSession);

    const current = await this.kpiCounts(scopedUniversityId, currentSession?.id || null);
    const previous = previousSession
      ? await this.kpiCounts(scopedUniversityId, previousSession.id)
      : null;

    const card = (curVal: number, prevVal?: number | null): MetricValueDto => ({
      value: curVal,
      delta_pct: previous ? deltaPct(curVal, prevVal) : null,
    });

    const institutions = await this.institutionStatusCounts();
    const subjectCounts = await this.subjectCatalogCounts();

    const isLocked = Boolean(
      currentSession &&
        (currentSession.registrationLocked ?? (currentSession as any).registration_locked),
    );
    const sessionLabel =
      currentSession?.academicYear || (currentSession as any)?.academic_year || null;

    return {
      institutions_onboarded: { value: institutions.onboarded, delta_pct: null },
      active_institutions: { value: institutions.active, delta_pct: null },
      inactive_institutions: { value: institutions.inactive, delta_pct: null },
      registration_locked: isLocked,
      registration_lock: {
        locked: isLocked,
        session_id: currentSession?.id || null,
        label: sessionLabel,
      },
      total_registered: card(current.total, previous?.total),
      approved: card(current.approved, previous?.approved),
      pending: card(current.pending, previous?.pending),
      with_biometrics: card(current.biometric, previous?.biometric),
      without_biometrics: card(current.without_biometric, previous?.without_biometric),
      total_subjects: { value: subjectCounts.total_subjects, delta_pct: null },
      total_subject_combinations: { value: subjectCounts.total_subject_combinations, delta_pct: null },
      inactive_subjects: { value: subjectCounts.inactive_subjects, delta_pct: null },
      compared_to: previousSession
        ? {
            session_id: previousSession.id,
            label: previousSession.academicYear || (previousSession as any).academic_year,
          }
        : null,
    };
  }

  async getQuickStats(query: DashboardQueryDto, userId: string): Promise<DashboardQuickStatsResponseDto> {
    const scopedUniversityId = await this.resolveUniversityId(userId, query.university_id);
    const activeSession = await this.sessionContextService.getActiveSession();
    const effectiveSession = await this.resolveSessionForUser(userId, null);

    const params: any[] = [];
    let q = `SELECT COUNT(DISTINCT user_id)::int AS total
             FROM jupeb_registrations
             WHERE user_id IS NOT NULL AND status <> 'withdrawn'`;
    if (scopedUniversityId) {
      q += ` AND university_id = $1`;
      params.push(scopedUniversityId);
    }
    const r = await this.dataSource.query(q, params);
    const instRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS c FROM jupeb_universities WHERE deleted_at IS NULL AND status = 'active'`,
    );

    const toBrief = (s: any) =>
      s ? { id: s.id, label: s.academic_year, status: s.status } : null;

    return {
      total_students: Number(r[0]?.total) || 0,
      institutions_count: Number(instRows[0]?.c) || 0,
      active_session: toBrief(activeSession),
      effective_session: toBrief(effectiveSession),
    };
  }

  async getStudentsStatus(query: DashboardQueryDto, userId: string): Promise<DashboardStudentsStatusResponseDto> {
    const scopedUniversityId = await this.resolveUniversityId(userId, query.university_id);
    assertUuid(query.session_id, 'session_id');
    const session = await this.resolveSessionForUser(userId, query.session_id);

    const params: any[] = [];
    const filters: string[] = [];
    let i = 1;
    if (scopedUniversityId) {
      filters.push(`university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    if (session) {
      filters.push(`session_id = $${i++}`);
      params.push(session.id);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    params.push(PENDING_STATUSES);

    const rows = await this.dataSource.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE status = ANY($${i}::text[]))::int AS pending
       FROM jupeb_registrations
       ${where}`,
      params,
    );
    const r = rows[0] || {};
    return {
      approved: Number(r.approved) || 0,
      rejected: Number(r.rejected) || 0,
      pending: Number(r.pending) || 0,
    };
  }

  async getRegistrationTrends(
    query: DashboardQueryDto,
    userId: string,
  ): Promise<DashboardRegistrationTrendsResponseDto> {
    const scopedUniversityId = await this.resolveUniversityId(userId, query.university_id);
    const session = await this.resolveSessionForUser(userId, query.session_id);

    const opensAt = session?.opensAt ?? (session as any)?.opens_at;
    const closesAt = session?.closesAt ?? (session as any)?.closes_at;
    const academicYear = session?.academicYear ?? (session as any)?.academic_year;

    // ── Session-scoped mode: only when session_id is explicitly requested in query
    if (query.session_id && session && opensAt && closesAt) {
      const params: any[] = [session.id];
      let where = `session_id = $1 AND status <> 'withdrawn'`;
      let i = 2;
      if (scopedUniversityId) {
        where += ` AND university_id = $${i++}`;
        params.push(scopedUniversityId);
      }
      const rows = await this.dataSource.query(
        `SELECT EXTRACT(YEAR FROM created_at)::int AS y,
                EXTRACT(MONTH FROM created_at)::int AS m,
                COUNT(*)::int AS c
         FROM jupeb_registrations
         WHERE ${where}
         GROUP BY 1, 2`,
        params,
      );
      const map = new Map<string, number>(rows.map((row: any) => [`${row.y}-${row.m}`, Number(row.c)]));
      const points = monthBuckets(
        new Date(opensAt),
        new Date(closesAt),
      ).map((b) => ({
        year: b.year,
        month: b.month,
        count: map.get(`${b.year}-${b.month}`) || 0,
      }));
      return {
        session: {
          id: session.id,
          academic_year: academicYear,
          opens_at: opensAt,
          closes_at: closesAt,
        },
        series: [{ key: 'current', points }],
      };
    }

    const y = Number(query.year);
    const targetYear = Number.isFinite(y) && y > 1900 ? y : new Date().getUTCFullYear();
    const previousYear = targetYear - 1;

    const monthlyForYear = async (yy: number) => {
      const params: any[] = [yy];
      let where = `EXTRACT(YEAR FROM created_at) = $1 AND status <> 'withdrawn'`;
      let i = 2;
      if (scopedUniversityId) {
        where += ` AND university_id = $${i++}`;
        params.push(scopedUniversityId);
      }
      const rows = await this.dataSource.query(
        `SELECT EXTRACT(MONTH FROM created_at)::int AS m, COUNT(*)::int AS c
         FROM jupeb_registrations
         WHERE ${where}
         GROUP BY 1`,
        params,
      );
      const map = new Map<number, number>(rows.map((row: any) => [Number(row.m), Number(row.c)]));
      return Array.from({ length: 12 }, (_, idx) => ({
        month: idx + 1,
        count: map.get(idx + 1) || 0,
      }));
    };

    return {
      year: targetYear,
      session: null,
      series: [
        { key: 'current', year: targetYear, points: await monthlyForYear(targetYear) },
        { key: 'previous', year: previousYear, points: await monthlyForYear(previousYear) },
      ],
    };
  }

  async getInstitutionDistribution(): Promise<InstitutionDistributionResponseDto> {
    const rows = await this.dataSource.query(
      `SELECT COALESCE(university_type, 'unspecified') AS type,
              COUNT(*)::int AS count
         FROM jupeb_universities
        WHERE deleted_at IS NULL AND status = 'active'
        GROUP BY 1
        ORDER BY 2 DESC`,
    );
    const total = rows.reduce((sum: number, row: any) => sum + Number(row.count), 0);
    const slices = rows.map((row: any) => ({
      type: row.type,
      count: Number(row.count),
      pct: total ? Number(((Number(row.count) / total) * 100).toFixed(1)) : 0,
    }));
    return { total, slices };
  }

  async getInstitutionTrends(query: DashboardQueryDto): Promise<InstitutionTrendsResponseDto> {
    const y = Number(query.year);
    const targetYear = Number.isFinite(y) && y > 1900 ? y : new Date().getUTCFullYear();
    const previousYear = targetYear - 1;

    const monthlyForYear = async (yy: number) => {
      const rows = await this.dataSource.query(
        `SELECT EXTRACT(MONTH FROM created_at)::int AS m, COUNT(*)::int AS c
           FROM jupeb_universities
          WHERE deleted_at IS NULL AND EXTRACT(YEAR FROM created_at) = $1
          GROUP BY 1`,
        [yy],
      );
      const map = new Map<number, number>(rows.map((row: any) => [Number(row.m), Number(row.c)]));
      return Array.from({ length: 12 }, (_, idx) => ({
        month: idx + 1,
        count: map.get(idx + 1) || 0,
      }));
    };

    return {
      year: targetYear,
      series: [
        { key: 'current', year: targetYear, points: await monthlyForYear(targetYear) },
        { key: 'previous', year: previousYear, points: await monthlyForYear(previousYear) },
      ],
    };
  }

  async getSubjectCombinationDistribution(
    query: DashboardQueryDto,
    userId: string,
  ): Promise<SubjectCombinationDistributionResponseDto> {
    const scopedUniversityId = await this.resolveUniversityId(userId, query.university_id);
    const session = await this.resolveSessionForUser(userId, query.session_id);
    if (!session) return { session_id: null, total: 0, slices: [] };

    const params: any[] = [session.id];
    const filters = [
      `r.subject_combination_id IS NOT NULL`,
      `r.status <> 'withdrawn'`,
      `r.session_id = $1`,
    ];
    let i = 2;
    if (scopedUniversityId) {
      filters.push(`r.university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    const rows = await this.dataSource.query(
      `SELECT sc.id, sc.code, sc.title, COUNT(r.id)::int AS count
         FROM jupeb_registrations r
         JOIN jupeb_subject_combinations sc ON sc.id = r.subject_combination_id
        WHERE ${filters.join(' AND ')}
        GROUP BY sc.id, sc.code, sc.title
        ORDER BY count DESC, sc.code ASC`,
      params,
    );

    const combIds = rows.map((r: any) => r.id);
    const itemsMap = new Map<string, { code: string; name: string }[]>();
    if (combIds.length) {
      const itemRows = await this.dataSource.query(
        `SELECT i.combination_id, s.code, s.name
         FROM jupeb_subject_combination_items i
         JOIN jupeb_subjects s ON s.id = i.subject_id
         WHERE i.combination_id = ANY($1)
         ORDER BY i.position ASC, s.name ASC`,
        [combIds],
      );
      for (const item of itemRows) {
        if (!itemsMap.has(item.combination_id)) {
          itemsMap.set(item.combination_id, []);
        }
        itemsMap.get(item.combination_id)!.push({ code: item.code, name: item.name });
      }
    }

    const total = rows.reduce((sum: number, row: any) => sum + Number(row.count), 0);
    const slices = rows.map((row: any) => ({
      subject_combination_id: row.id,
      code: row.code,
      title: row.title,
      subjects: itemsMap.get(row.id) || [],
      count: Number(row.count),
      pct: total ? Number(((Number(row.count) / total) * 100).toFixed(1)) : 0,
    }));
    return { session_id: session.id, total, slices };
  }

  async getSubjectEnrollment(query: DashboardQueryDto, userId: string) {
    const scopedUniversityId = await this.resolveUniversityId(userId, query.university_id);
    const session = await this.resolveSessionForUser(userId, query.session_id);
    if (!session) return [];
    const lim = Math.min(20, Math.max(1, Number(query.limit) || 6));

    const params: any[] = [session.id];
    const filters = [
      `r.subject_combination_id IS NOT NULL`,
      `r.status <> 'withdrawn'`,
      `r.session_id = $1`,
    ];
    let i = 2;
    if (scopedUniversityId) {
      filters.push(`r.university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    params.push(lim);
    const rows = await this.dataSource.query(
      `SELECT sc.id, sc.code, sc.title, COUNT(r.id)::int AS count
       FROM jupeb_registrations r
       JOIN jupeb_subject_combinations sc ON sc.id = r.subject_combination_id
       WHERE ${filters.join(' AND ')}
       GROUP BY sc.id, sc.code, sc.title
       ORDER BY count DESC, sc.code ASC
       LIMIT $${i}`,
      params,
    );

    const combIds = rows.map((r: any) => r.id);
    const itemsMap = new Map<string, { code: string; name: string }[]>();
    if (combIds.length) {
      const itemRows = await this.dataSource.query(
        `SELECT i.combination_id, s.code, s.name
         FROM jupeb_subject_combination_items i
         JOIN jupeb_subjects s ON s.id = i.subject_id
         WHERE i.combination_id = ANY($1)
         ORDER BY i.position ASC, s.name ASC`,
        [combIds],
      );
      for (const item of itemRows) {
        if (!itemsMap.has(item.combination_id)) {
          itemsMap.set(item.combination_id, []);
        }
        itemsMap.get(item.combination_id)!.push({ code: item.code, name: item.name });
      }
    }

    return rows.map((row: any) => ({
      subject_combination_id: row.id,
      code: row.code,
      label: row.title,
      count: Number(row.count),
      subjects: itemsMap.get(row.id) || [],
    }));
  }

  async getEnrollmentBySubject(query: DashboardQueryDto, userId: string): Promise<SubjectEnrollmentItemDto[]> {
    const scopedUniversityId = await this.resolveUniversityId(userId, query.university_id);
    const session = await this.resolveSessionForUser(userId, query.session_id);
    if (!session) return [];

    const params: any[] = [session.id];
    const filters = [
      `r.status <> 'withdrawn'`,
      `r.session_id = $1`,
      `s.deleted_at IS NULL`,
    ];
    let i = 2;
    if (scopedUniversityId) {
      filters.push(`r.university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    let limitClause = '';
    if (query.limit !== undefined && query.limit !== null) {
      const lim = Math.min(50, Math.max(1, Number(query.limit) || 0));
      if (lim) {
        params.push(lim);
        limitClause = `LIMIT $${i}`;
      }
    }

    const rows = await this.dataSource.query(
      `SELECT s.id, s.code, s.name, COUNT(DISTINCT r.id)::int AS count
         FROM jupeb_subjects s
         JOIN jupeb_subject_combination_items i ON i.subject_id = s.id
         JOIN jupeb_registrations r ON r.subject_combination_id = i.combination_id
        WHERE ${filters.join(' AND ')}
        GROUP BY s.id, s.code, s.name
        ORDER BY count DESC, s.name ASC
        ${limitClause}`,
      params,
    );

    return rows.map((row: any) => ({
      subject_id: row.id,
      code: row.code,
      name: row.name,
      count: Number(row.count),
    }));
  }

  async getSessionTimeline(query: DashboardQueryDto, userId: string): Promise<SessionTimelineResponseDto | null> {
    assertUuid(query.session_id, 'session_id');
    const session = await this.resolveSessionForUser(userId, query.session_id);
    if (!session) return null;

    const rows = await this.dataSource.query(
      `SELECT id, academic_year, year_short, status, opens_at, closes_at,
              candidate_info_cutoff_at, profile_update_cutoff_at, ca_cutoff_at
         FROM jupeb_registration_sessions WHERE id = $1`,
      [session.id],
    );
    const row = rows[0];
    if (!row) return null;

    const now = new Date();
    const opens = row.opens_at ? new Date(row.opens_at) : null;
    const closes = row.closes_at ? new Date(row.closes_at) : null;
    const within = opens && closes && now >= opens && now <= closes;

    return {
      session_id: row.id,
      academic_year: row.academic_year,
      year_short: row.year_short,
      status: row.status,
      opens_at: row.opens_at,
      closes_at: row.closes_at,
      candidate_info_cutoff_at: row.candidate_info_cutoff_at,
      profile_update_cutoff_at: row.profile_update_cutoff_at,
      ca_cutoff_at: row.ca_cutoff_at,
      now: now.toISOString(),
      within_window: !!within,
    };
  }

  async getRecentRegistrations(query: DashboardQueryDto, userId: string): Promise<RecentRegistrationItemDto[]> {
    const scopedUniversityId = await this.resolveUniversityId(userId, query.university_id);
    assertUuid(query.session_id, 'session_id');
    const session = await this.resolveSessionForUser(userId, query.session_id);
    const lim = Math.min(50, Math.max(1, Number(query.limit) || 5));

    const params: any[] = [];
    const filters = [`r.status <> 'withdrawn'`];
    let i = 1;
    if (scopedUniversityId) {
      filters.push(`r.university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    if (session) {
      filters.push(`r.session_id = $${i++}`);
      params.push(session.id);
    }
    params.push(lim);

    const rows = await this.dataSource.query(
      `SELECT
         r.id AS registration_id,
         COALESCE(r.institution_issued_code, r.provisional_candidate_code) AS candidate_id,
         r.status AS raw_status,
         r.submitted_at,
         r.created_at,
         u.email AS user_email,
         p.first_name,
         p.last_name,
         p.display_name,
         p.profile_photo_url,
         sc.id AS subject_combination_id,
         sc.code AS subject_combination_code,
         EXISTS (
           SELECT 1 FROM jupeb_biometric_captures bc
           WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL
         ) AS biometric_captured
       FROM jupeb_registrations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN profiles p ON p.user_id = r.user_id
       LEFT JOIN jupeb_subject_combinations sc ON sc.id = r.subject_combination_id
       WHERE ${filters.join(' AND ')}
       ORDER BY r.created_at DESC
       LIMIT $${i}`,
      params,
    );

    return rows.map((row: any) => {
      const fullName =
        row.display_name || [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || null;
      return {
        registration_id: row.registration_id,
        candidate_id: row.candidate_id,
        name: fullName,
        email: row.user_email,
        avatar_url: row.profile_photo_url,
        subject_combination: row.subject_combination_id
          ? { id: row.subject_combination_id, code: row.subject_combination_code }
          : null,
        biometric_captured: Boolean(row.biometric_captured),
        status: statusBucket(row.raw_status),
        raw_status: row.raw_status,
        submitted_at: row.submitted_at,
        created_at: row.created_at,
      };
    });
  }

  async patchUserJupebUniversity(targetUserId: string, jupebUniversityId: string | null, actorUserId?: string | null) {
    return this.institutionUserScopeService.setProfileJupebUniversityId(
      targetUserId,
      jupebUniversityId,
      actorUserId,
    );
  }
}
