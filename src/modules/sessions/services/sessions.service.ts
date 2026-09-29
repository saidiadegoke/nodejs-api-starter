import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { SessionRepository } from '../repositories/session.repository';
import { SessionUniversityLockRepository } from '../repositories/session-university-lock.repository';
import { SessionEventRepository } from '../repositories/session-event.repository';
import { SessionContextService } from './session-context.service';
import { AcademicSessionEntity, SessionStatus } from '../entities/academic-session.entity';
import {
  CreateSessionDto,
  PatchSessionDto,
  ListSessionsQueryDto,
  SetRegistrationLockDto,
  SessionMetricsQueryDto,
  SessionMetricsResponseDto,
  SessionStatsResponseDto,
  MetricDeltaDto,
  SelectiveLockResultDto,
} from '../dto';
import {
  validateYearShortForAcademicYear,
  canTransitionStatus,
} from '../utils/session-validation.util';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function computeDelta(value: number, previous: number): MetricDeltaDto {
  const v = Number(value) || 0;
  const p = Number(previous) || 0;
  let pct: number | null = null;
  let direction = 'flat';
  if (p === 0 && v === 0) {
    pct = 0;
  } else if (p === 0) {
    pct = null;
    direction = v > 0 ? 'up' : 'flat';
  } else {
    pct = Number((((v - p) / p) * 100).toFixed(2));
    if (Math.abs(pct) < 0.001) direction = 'flat';
    else direction = pct > 0 ? 'up' : 'down';
  }
  return { value: v, previous: p, delta_pct: pct, direction };
}

@Injectable()
export class SessionsService {
  private readonly logger;

  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly lockRepo: SessionUniversityLockRepository,
    private readonly eventRepo: SessionEventRepository,
    private readonly sessionContextService: SessionContextService,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(SessionsService.name);
  }

  async list(query: ListSessionsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const rows = await this.sessionRepo.findAll({
      limit,
      offset,
      status: query.status,
      q: query.q,
    });
    const total = await this.sessionRepo.count({
      status: query.status,
      q: query.q,
    });

    return { rows, page, limit, total };
  }

  async getById(id: string): Promise<AcademicSessionEntity> {
    if (!UUID_REGEX.test(id)) {
      throw new UnprocessableEntityException('Invalid session id');
    }
    const row = await this.sessionRepo.findById(id);
    if (!row) {
      throw new NotFoundException('Session not found');
    }
    return row;
  }

  async create(dto: CreateSessionDto, userId?: string | null): Promise<AcademicSessionEntity> {
    const y = validateYearShortForAcademicYear(dto.academic_year, dto.year_short);
    if (!y.ok) {
      throw new UnprocessableEntityException(y.error);
    }

    const opens = new Date(dto.opens_at);
    const closes = new Date(dto.closes_at);
    if (opens.getTime() >= closes.getTime()) {
      throw new UnprocessableEntityException('opens_at must be before closes_at');
    }

    const cutoffCandidate = dto.candidate_info_cutoff_at ? new Date(dto.candidate_info_cutoff_at) : null;
    const cutoffProfile = dto.profile_update_cutoff_at ? new Date(dto.profile_update_cutoff_at) : null;
    const cutoffCa = dto.ca_cutoff_at ? new Date(dto.ca_cutoff_at) : null;

    const ordered: [string, Date | null][] = [
      ['Session close date', closes],
      ['Candidate info cutoff', cutoffCandidate],
      ['Profile update cutoff', cutoffProfile],
      ['CA cutoff', cutoffCa],
    ];
    const presentCutoffs = ordered.filter(([, v]) => v != null) as [string, Date][];

    for (let i = 1; i < presentCutoffs.length; i += 1) {
      const [prevName, prevTs] = presentCutoffs[i - 1];
      const [thisName, thisTs] = presentCutoffs[i];
      if (thisTs.getTime() < prevTs.getTime()) {
        const fmt = (d: Date) => d.toISOString().replace('T', ' ').substring(0, 16);
        throw new UnprocessableEntityException(
          `The ${thisName} (${fmt(thisTs)}) cannot be earlier than the ${prevName} (${fmt(prevTs)}).`,
        );
      }
    }

    const existing = await this.sessionRepo.findByAcademicYear(dto.academic_year.trim());
    if (existing) {
      throw new ConflictException('A session with this academic_year already exists');
    }

    await this.sessionRepo.closeOpenSessions(userId);

    const created = await this.sessionRepo.create({
      academicYear: dto.academic_year.trim(),
      yearShort: dto.year_short.trim(),
      status: SessionStatus.OPEN,
      opensAt: opens,
      closesAt: closes,
      studentSubmissionDeadline: dto.student_submission_deadline ? new Date(dto.student_submission_deadline) : null,
      institutionApprovalDeadline: dto.institution_approval_deadline ? new Date(dto.institution_approval_deadline) : null,
      notes: dto.notes ?? dto.description ?? null,
      createdBy: userId || null,
      updatedBy: userId || null,
      registrationFeeAmount: dto.registration_fee_amount != null ? Number(dto.registration_fee_amount) : null,
      registrationFeeCurrency: dto.registration_fee_currency
        ? dto.registration_fee_currency.trim().toUpperCase().slice(0, 3)
        : (dto.registration_fee_amount != null ? 'NGN' : null),
      candidateInfoCutoffAt: cutoffCandidate,
      profileUpdateCutoffAt: cutoffProfile,
      caCutoffAt: cutoffCa,
      maxCaScore: dto.max_ca_score != null ? Number(dto.max_ca_score) : null,
      affiliationFeeExisting: dto.affiliation_fee_existing != null ? Number(dto.affiliation_fee_existing) : null,
      affiliationFeeNew: dto.affiliation_fee_new != null ? Number(dto.affiliation_fee_new) : null,
      examFeePerCandidate: dto.exam_fee_per_candidate != null ? Number(dto.exam_fee_per_candidate) : null,
    });

    await this.eventRepo.insertEvent(created.id, 'session_created', { academic_year: created.academicYear }, userId);
    return created;
  }

  async patch(id: string, dto: PatchSessionDto, userId?: string | null): Promise<AcademicSessionEntity> {
    const row = await this.getById(id);
    const fields: Partial<AcademicSessionEntity> = {};

    if (dto.academic_year !== undefined) {
      fields.academicYear = dto.academic_year.trim();
      if (!fields.academicYear) throw new UnprocessableEntityException('academic_year cannot be empty');
    }
    if (dto.year_short !== undefined) {
      fields.yearShort = dto.year_short.trim();
      if (!fields.yearShort) throw new UnprocessableEntityException('year_short cannot be empty');
    }
    if (fields.academicYear !== undefined || fields.yearShort !== undefined) {
      const y = validateYearShortForAcademicYear(
        fields.academicYear ?? row.academicYear,
        fields.yearShort ?? row.yearShort,
      );
      if (!y.ok) throw new UnprocessableEntityException(y.error);
    }

    if (dto.opens_at !== undefined) fields.opensAt = new Date(dto.opens_at);
    if (dto.closes_at !== undefined) fields.closesAt = new Date(dto.closes_at);

    const opens = fields.opensAt ?? row.opensAt;
    const closes = fields.closesAt ?? row.closesAt;
    if (opens && closes && opens.getTime() >= closes.getTime()) {
      throw new UnprocessableEntityException('opens_at must be before closes_at');
    }

    if (dto.student_submission_deadline !== undefined) {
      fields.studentSubmissionDeadline = dto.student_submission_deadline ? new Date(dto.student_submission_deadline) : null;
    }
    if (dto.institution_approval_deadline !== undefined) {
      fields.institutionApprovalDeadline = dto.institution_approval_deadline ? new Date(dto.institution_approval_deadline) : null;
    }
    if (dto.candidate_info_cutoff_at !== undefined) {
      fields.candidateInfoCutoffAt = dto.candidate_info_cutoff_at ? new Date(dto.candidate_info_cutoff_at) : null;
    }
    if (dto.profile_update_cutoff_at !== undefined) {
      fields.profileUpdateCutoffAt = dto.profile_update_cutoff_at ? new Date(dto.profile_update_cutoff_at) : null;
    }
    if (dto.ca_cutoff_at !== undefined) {
      fields.caCutoffAt = dto.ca_cutoff_at ? new Date(dto.ca_cutoff_at) : null;
    }

    const cutoffCandidate = fields.candidateInfoCutoffAt ?? row.candidateInfoCutoffAt;
    const cutoffProfile = fields.profileUpdateCutoffAt ?? row.profileUpdateCutoffAt;
    const cutoffCa = fields.caCutoffAt ?? row.caCutoffAt;

    const ordered: [string, Date | null][] = [
      ['Session close date', closes],
      ['Candidate info cutoff', cutoffCandidate],
      ['Profile update cutoff', cutoffProfile],
      ['CA cutoff', cutoffCa],
    ];
    const presentCutoffs = ordered.filter(([, v]) => v != null) as [string, Date][];

    for (let i = 1; i < presentCutoffs.length; i += 1) {
      const [prevName, prevTs] = presentCutoffs[i - 1];
      const [thisName, thisTs] = presentCutoffs[i];
      if (thisTs.getTime() < prevTs.getTime()) {
        const fmt = (d: Date) => d.toISOString().replace('T', ' ').substring(0, 16);
        throw new UnprocessableEntityException(
          `The ${thisName} (${fmt(thisTs)}) cannot be earlier than the ${prevName} (${fmt(prevTs)}).`,
        );
      }
    }

    if (dto.notes !== undefined) {
      fields.notes = dto.notes || null;
    } else if (dto.description !== undefined) {
      fields.notes = dto.description || null;
    }

    if (dto.registration_fee_amount !== undefined) {
      fields.registrationFeeAmount = dto.registration_fee_amount != null ? Number(dto.registration_fee_amount) : null;
    }
    if (dto.registration_fee_currency !== undefined) {
      fields.registrationFeeCurrency = dto.registration_fee_currency ? dto.registration_fee_currency.trim().toUpperCase().slice(0, 3) : null;
    }
    if (fields.registrationFeeAmount != null && fields.registrationFeeCurrency === undefined && !row.registrationFeeCurrency) {
      fields.registrationFeeCurrency = 'NGN';
    }

    if (dto.max_ca_score !== undefined) fields.maxCaScore = dto.max_ca_score != null ? Number(dto.max_ca_score) : null;
    if (dto.affiliation_fee_existing !== undefined) fields.affiliationFeeExisting = dto.affiliation_fee_existing != null ? Number(dto.affiliation_fee_existing) : null;
    if (dto.affiliation_fee_new !== undefined) fields.affiliationFeeNew = dto.affiliation_fee_new != null ? Number(dto.affiliation_fee_new) : null;
    if (dto.exam_fee_per_candidate !== undefined) fields.examFeePerCandidate = dto.exam_fee_per_candidate != null ? Number(dto.exam_fee_per_candidate) : null;

    if (Object.keys(fields).length === 0) {
      throw new UnprocessableEntityException('No updatable session fields supplied');
    }

    fields.updatedBy = userId || null;

    if (fields.academicYear && fields.academicYear !== row.academicYear) {
      const duplicate = await this.sessionRepo.findByAcademicYear(fields.academicYear);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('A session with this academic_year already exists');
      }
    }

    const updated = await this.sessionRepo.updateById(id, fields);
    await this.eventRepo.insertEvent(id, 'session_updated', fields as Record<string, unknown>, userId);
    return updated!;
  }

  async open(id: string, userId?: string | null): Promise<AcademicSessionEntity> {
    const row = await this.getById(id);
    if (row.status === SessionStatus.OPEN) {
      return row;
    }
    if (!canTransitionStatus(row.status, SessionStatus.OPEN)) {
      throw new UnprocessableEntityException(`Cannot open session in status ${row.status}`);
    }
    const others = await this.sessionRepo.countOtherOpenSessions(id);
    if (others > 0) {
      throw new ConflictException('Another session is already open; close it before opening this one');
    }
    const updated = await this.sessionRepo.setStatus(id, SessionStatus.OPEN, userId);
    await this.eventRepo.insertEvent(id, 'opened', {}, userId);
    return updated!;
  }

  async close(id: string, userId?: string | null): Promise<AcademicSessionEntity> {
    const row = await this.getById(id);
    if (row.status === SessionStatus.CLOSED) {
      return row;
    }
    if (row.status !== SessionStatus.OPEN) {
      throw new UnprocessableEntityException(`Cannot close session in status ${row.status}`);
    }
    const updated = await this.sessionRepo.setStatus(id, SessionStatus.CLOSED, userId);
    await this.eventRepo.insertEvent(id, 'closed', {}, userId);
    return updated!;
  }

  async reopen(id: string, userId?: string | null): Promise<AcademicSessionEntity> {
    const row = await this.getById(id);
    if (!canTransitionStatus(row.status, SessionStatus.OPEN)) {
      throw new UnprocessableEntityException(`Cannot reopen session in status ${row.status}`);
    }
    const others = await this.sessionRepo.countOtherOpenSessions(id);
    if (others > 0) {
      throw new ConflictException('Another session is already open');
    }
    const updated = await this.sessionRepo.setStatus(id, SessionStatus.OPEN, userId);
    await this.eventRepo.insertEvent(id, 'reopened', {}, userId);
    return updated!;
  }

  async setRegistrationLock(
    id: string,
    body: SetRegistrationLockDto,
    userId?: string | null,
  ): Promise<AcademicSessionEntity | SelectiveLockResultDto> {
    await this.getById(id);

    const hasUniversityIds = Array.isArray(body.university_ids) && body.university_ids.length > 0;
    const hasUniversityId = typeof body.university_id === 'string' && Boolean(body.university_id.trim());

    if (hasUniversityIds || hasUniversityId) {
      const rawIds = hasUniversityIds ? body.university_ids! : [body.university_id!.trim()];
      for (const uniId of rawIds) {
        if (!UUID_REGEX.test(uniId)) {
          throw new UnprocessableEntityException(`Invalid university ID: ${uniId}`);
        }
      }

      const uniCheck: { id: string }[] = await this.dataSource.query(
        `SELECT id FROM jupeb_universities WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [rawIds],
      );
      if (uniCheck.length !== rawIds.length) {
        throw new NotFoundException('One or more universities were not found');
      }

      const updatedRows = await this.lockRepo.setUniversityRegistrationLocks(id, {
        universityIds: rawIds,
        locked: body.locked,
        reason: body.reason,
        userId,
      });

      await this.eventRepo.insertEvent(
        id,
        body.locked ? 'institution_registration_locked' : 'institution_registration_unlocked',
        {
          university_ids: rawIds,
          locked: body.locked,
          reason: body.reason || null,
        },
        userId,
      );

      const itemsDto = updatedRows.map((r) => ({
        university_id: r.universityId,
        university_name: '',
        university_code: '',
        university_short_name: null,
        locked: r.locked,
        reason: r.reason,
        locked_at: r.lockedAt ? r.lockedAt.toISOString() : null,
        locked_by: r.lockedBy,
        updated_at: r.updatedAt ? r.updatedAt.toISOString() : null,
      }));

      return {
        session_id: id,
        locked: body.locked,
        reason: body.reason || null,
        university_ids: rawIds,
        updated_count: updatedRows.length,
        items: itemsDto,
      };
    }

    const updated = await this.sessionRepo.setRegistrationLocked(id, body.locked, userId);
    await this.eventRepo.insertEvent(
      id,
      body.locked ? 'registration_locked' : 'registration_unlocked',
      { registration_locked: body.locked },
      userId,
    );
    return updated!;
  }

  async getUniversityRegistrationLocks(id: string, query: any) {
    await this.getById(id);
    return this.lockRepo.getUniversityRegistrationLocks(id, query);
  }

  async finalizeCandidateNumbers(id: string, userId?: string | null) {
    await this.getById(id);
    await this.eventRepo.insertEvent(id, 'finalization_triggered', {}, userId);
    await this.sessionRepo.setFinalNumbersGeneratedAt(id, userId);

    return {
      session_id: id,
      status: 'completed',
      finalized_at: new Date().toISOString(),
    };
  }

  async finalizeAllClosed(userId?: string | null) {
    const closedSessions = await this.sessionRepo.findAll({
      limit: 100,
      offset: 0,
      status: SessionStatus.CLOSED,
    });

    const results = [];
    for (const s of closedSessions) {
      await this.eventRepo.insertEvent(s.id, 'finalization_triggered', {}, userId);
      await this.sessionRepo.setFinalNumbersGeneratedAt(s.id, userId);
      results.push({
        session_id: s.id,
        academic_year: s.academicYear,
        status: 'completed',
      });
    }

    return {
      total_sessions: closedSessions.length,
      finalized: results,
    };
  }

  private async getInstitutionsInSession(sessionId: string): Promise<number> {
    const r = await this.dataSource.query(
      `SELECT COUNT(DISTINCT university_id)::int AS c
         FROM jupeb_registrations
        WHERE session_id = $1 AND university_id IS NOT NULL`,
      [sessionId],
    );
    return r[0]?.c || 0;
  }

  private async getSessionMetrics(sessionId: string) {
    try {
      const r = await this.dataSource.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE r.status = 'approved')::int AS approved,
           COUNT(*) FILTER (
             WHERE r.status <> 'withdrawn' AND EXISTS (
               SELECT 1 FROM jupeb_biometric_captures bc
               WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL
             )
           )::int AS biometric
         FROM jupeb_registrations r
         WHERE r.session_id = $1`,
        [sessionId],
      );
      const kpi = r[0] || { total: 0, approved: 0, biometric: 0 };
      const institutions = await this.getInstitutionsInSession(sessionId);
      return {
        exams: null,
        institutions,
        total_candidates: kpi.total || 0,
        current_candidates_enrolled: kpi.approved || 0,
        candidates_with_biometrics: kpi.biometric || 0,
      };
    } catch {
      return {
        exams: null,
        institutions: 0,
        total_candidates: 0,
        current_candidates_enrolled: 0,
        candidates_with_biometrics: 0,
      };
    }
  }

  async metrics(userId?: string | null, query: SessionMetricsQueryDto = {}): Promise<SessionMetricsResponseDto> {
    const session = await this.sessionContextService.resolveEffectiveSession(
      userId,
      query.session_id || null,
    );

    if (!session) {
      return {
        session: null,
        metrics: {
          exams: null,
          institutions: 0,
          total_candidates: 0,
          current_candidates_enrolled: 0,
          candidates_with_biometrics: 0,
        },
      };
    }

    const metricsData = await this.getSessionMetrics(session.id);
    const payload: SessionMetricsResponseDto = {
      session: {
        id: session.id,
        label: session.academicYear,
        status: session.status,
        opens_at: session.opensAt ? session.opensAt.toISOString() : null,
        closes_at: session.closesAt ? session.closesAt.toISOString() : null,
      },
      metrics: metricsData,
    };

    const previousId = query.previous_session_id;
    if (previousId) {
      if (!UUID_REGEX.test(previousId)) {
        throw new UnprocessableEntityException('previous_session_id must be a valid UUID');
      }
      const prevRow = await this.getById(previousId);
      const previousMetrics = await this.getSessionMetrics(previousId);

      payload.compared_to = {
        session_id: previousId,
        label: prevRow.academicYear || null,
      };

      const deltas: Record<string, MetricDeltaDto> = {};
      const keys = ['institutions', 'total_candidates', 'current_candidates_enrolled', 'candidates_with_biometrics'] as const;
      for (const key of keys) {
        deltas[key] = computeDelta(metricsData[key], (previousMetrics as any)[key]);
      }
      payload.deltas = deltas;
    }

    return payload;
  }

  private async getStatsRaw(id: string) {
    await this.getById(id);
    let byStatus: Record<string, number> = {};
    let total = 0;
    let institutionsCount = 0;
    let subjectCombinationsCount = 0;
    let withBio = 0;
    let withoutBio = 0;

    try {
      const statusRows = await this.dataSource.query(
        `SELECT status, COUNT(*)::int AS c
         FROM jupeb_registrations
         WHERE session_id = $1
         GROUP BY status`,
        [id],
      );
      for (const r of statusRows) {
        byStatus[r.status] = r.c;
        total += r.c;
      }

      const distinctRows = await this.dataSource.query(
        `SELECT
           COUNT(DISTINCT university_id)::int AS institutions_count,
           COUNT(DISTINCT subject_combination_id)::int AS subject_combinations_count
         FROM jupeb_registrations
         WHERE session_id = $1`,
        [id],
      );
      institutionsCount = distinctRows[0]?.institutions_count || 0;
      subjectCombinationsCount = distinctRows[0]?.subject_combinations_count || 0;

      const bioRows = await this.dataSource.query(
        `SELECT
           SUM(CASE WHEN bio.cnt > 0 THEN 1 ELSE 0 END)::int AS with_bio,
           SUM(CASE WHEN bio.cnt = 0 OR bio.cnt IS NULL THEN 1 ELSE 0 END)::int AS without_bio
         FROM jupeb_registrations r
         LEFT JOIN (
           SELECT registration_id, COUNT(*)::int AS cnt
           FROM jupeb_biometric_captures
           WHERE replaced_at IS NULL
           GROUP BY registration_id
         ) bio ON bio.registration_id = r.id
         WHERE r.session_id = $1`,
        [id],
      );
      withBio = bioRows[0]?.with_bio || 0;
      withoutBio = bioRows[0]?.without_bio || 0;
    } catch {
      byStatus = {};
      total = 0;
    }

    return {
      session_id: id,
      total_registrations: total,
      registrations_by_status: byStatus,
      institutions_count: institutionsCount,
      subject_combinations_count: subjectCombinationsCount,
      candidates_with_biometrics: withBio,
      candidates_without_biometrics: withoutBio,
    };
  }

  async stats(id: string, query: { previous_session_id?: string } = {}): Promise<SessionStatsResponseDto> {
    const current = await this.getStatsRaw(id);
    const previousId = query?.previous_session_id;
    if (!previousId) return current;

    const previous = await this.getStatsRaw(previousId);
    const metricsKeys = [
      'total_registrations',
      'institutions_count',
      'subject_combinations_count',
      'candidates_with_biometrics',
      'candidates_without_biometrics',
    ] as const;

    const deltas: Record<string, MetricDeltaDto> = {};
    for (const m of metricsKeys) {
      deltas[m] = computeDelta((current as any)[m], (previous as any)[m]);
    }

    return { ...current, previous_session_id: previousId, deltas };
  }

  async exportCsv(): Promise<string> {
    const rows = await this.sessionRepo.findAll({ limit: 10000, offset: 0 });
    const header = [
      'id',
      'academic_year',
      'year_short',
      'status',
      'opens_at',
      'closes_at',
      'candidate_info_cutoff_at',
      'profile_update_cutoff_at',
      'ca_cutoff_at',
      'max_ca_score',
      'affiliation_fee_existing',
      'affiliation_fee_new',
      'exam_fee_per_candidate',
      'registration_fee_amount',
      'registration_fee_currency',
      'created_at',
    ];
    const escape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [header.join(',')];
    for (const r of rows) {
      const obj: Record<string, any> = {
        id: r.id,
        academic_year: r.academicYear,
        year_short: r.yearShort,
        status: r.status,
        opens_at: r.opensAt?.toISOString(),
        closes_at: r.closesAt?.toISOString(),
        candidate_info_cutoff_at: r.candidateInfoCutoffAt?.toISOString(),
        profile_update_cutoff_at: r.profileUpdateCutoffAt?.toISOString(),
        ca_cutoff_at: r.caCutoffAt?.toISOString(),
        max_ca_score: r.maxCaScore,
        affiliation_fee_existing: r.affiliationFeeExisting,
        affiliation_fee_new: r.affiliationFeeNew,
        exam_fee_per_candidate: r.examFeePerCandidate,
        registration_fee_amount: r.registrationFeeAmount,
        registration_fee_currency: r.registrationFeeCurrency,
        created_at: r.createdAt?.toISOString(),
      };
      lines.push(header.map((h) => escape(obj[h])).join(','));
    }
    return lines.join('\n');
  }
}
