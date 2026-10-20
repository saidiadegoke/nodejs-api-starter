import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isUUID } from 'class-validator';
import { DataSource, In, Repository } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { CandidateSyncQueueService } from '../../sync/services/candidate-sync-queue.service';
import { RegistrationStatus } from '../../registration/entities/registration.entity';
import { RegistrationEvent } from '../../registration/constants/registration-events.enum';
import { UniversityEntity } from '../../institutions/entities/university.entity';
import {
  CreateSessionDto,
  ListSessionsQueryDto,
  PatchSessionDto,
  SelectiveLockResultDto,
  SessionMetricsQueryDto,
  SessionMetricsResponseDto,
  SessionStatsResponseDto,
  SetRegistrationLockDto,
} from '../dto';
import { AcademicSessionEntity, SessionStatus } from '../entities/academic-session.entity';
import { SessionEventRepository } from '../repositories/session-event.repository';
import { SessionRegistrationRepository } from '../repositories/session-registration.repository';
import { SessionUniversityLockRepository } from '../repositories/session-university-lock.repository';
import { SessionRepository } from '../repositories/session.repository';
import { computeDeltas } from '../utils/metric-delta.util';
import {
  CSV_EXPORT_LIMIT,
  DEFAULT_CURRENCY,
  DEFAULT_PAGE_SIZE,
  FINALIZE_ALL_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SessionEventType,
} from '../utils/session.constants';
import {
  assertSessionDateRules,
  formatSession,
  mapSessionDtoToFields,
} from '../utils/session-fields.mapper';
import {
  canTransitionStatus,
  validateYearShortForAcademicYear,
} from '../utils/session-validation.util';
import { SessionContextService } from './session-context.service';

const METRIC_KEYS = [
  'institutions',
  'total_candidates',
  'current_candidates_enrolled',
  'candidates_with_biometrics',
] as const;

const STATS_KEYS = [
  'total_registrations',
  'institutions_count',
  'subject_combinations_count',
  'candidates_with_biometrics',
  'candidates_without_biometrics',
] as const;

const emptyMetrics = () => ({
  exams: null,
  institutions: 0,
  total_candidates: 0,
  current_candidates_enrolled: 0,
  candidates_with_biometrics: 0,
});

type UserId = string | null | undefined;

@Injectable()
export class SessionsService {
  private readonly logger;

  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly lockRepo: SessionUniversityLockRepository,
    private readonly eventRepo: SessionEventRepository,
    private readonly registrationRepo: SessionRegistrationRepository,
    @InjectRepository(UniversityEntity)
    private readonly universityRepo: Repository<UniversityEntity>,
    private readonly sessionContextService: SessionContextService,
    private readonly candidateSyncQueueService: CandidateSyncQueueService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(SessionsService.name);
  }

  // ─────────────────────────────── Queries ───────────────────────────────

  async list(query: ListSessionsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE));
    const filter = { status: query.status, q: query.q };

    const [rawRows, total] = await Promise.all([
      this.sessionRepo.findAll({ ...filter, limit, offset: (page - 1) * limit }),
      this.sessionRepo.count(filter),
    ]);

    const rows = rawRows.map((r) => formatSession(r));

    return {
      success: true,
      message: 'Academic sessions retrieved successfully',
      data: rows,
      rows,
      page,
      limit,
      total,
      pagination: {
        page,
        limit,
        total,
        totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
      },
    };
  }

  async getById(id: string): Promise<any> {
    this.assertUuid(id, 'Invalid session id');
    const row = await this.sessionRepo.findById(id);
    if (!row) throw new NotFoundException('Session not found');
    return formatSession(row);
  }

  // ─────────────────────────────── Commands ──────────────────────────────

  async create(dto: CreateSessionDto, userId?: UserId): Promise<AcademicSessionEntity> {
    const fields = mapSessionDtoToFields(dto);

    this.assertYearPair(fields.academicYear, fields.yearShort);
    assertSessionDateRules(fields);

    if (await this.sessionRepo.findByAcademicYear(fields.academicYear!)) {
      throw new ConflictException('A session with this academic_year already exists');
    }

    if (fields.registrationFeeAmount != null && !fields.registrationFeeCurrency) {
      fields.registrationFeeCurrency = DEFAULT_CURRENCY;
    }

    // Close open sessions + create new session atomically in a transaction
    const created = await this.dataSource.transaction(async (manager) => {
      await this.sessionRepo.closeOpenSessions(userId, manager);
      return this.sessionRepo.create(
        {
          ...fields,
          status: SessionStatus.OPEN,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
        manager,
      );
    });

    await this.eventRepo.insertEvent(
      created.id,
      SessionEventType.Created,
      { academic_year: created.academicYear },
      userId,
    );
    return formatSession(created);
  }

  async patch(id: string, dto: PatchSessionDto, userId?: UserId): Promise<AcademicSessionEntity> {
    const row = await this.getById(id);
    const fields = mapSessionDtoToFields(dto);

    if (Object.keys(fields).length === 0) {
      throw new UnprocessableEntityException('No updatable session fields supplied');
    }

    if (fields.academicYear !== undefined || fields.yearShort !== undefined) {
      this.assertYearPair(
        fields.academicYear ?? row.academicYear,
        fields.yearShort ?? row.yearShort,
      );
    }

    // Validate the effective state (patched values layered over the stored row)
    assertSessionDateRules({
      opensAt: fields.opensAt ?? row.opensAt,
      closesAt: fields.closesAt ?? row.closesAt,
      candidateInfoCutoffAt: fields.candidateInfoCutoffAt ?? row.candidateInfoCutoffAt,
      profileUpdateCutoffAt: fields.profileUpdateCutoffAt ?? row.profileUpdateCutoffAt,
      caCutoffAt: fields.caCutoffAt ?? row.caCutoffAt,
    });

    if (
      fields.registrationFeeAmount != null &&
      fields.registrationFeeCurrency === undefined &&
      !row.registrationFeeCurrency
    ) {
      fields.registrationFeeCurrency = DEFAULT_CURRENCY;
    }

    if (fields.academicYear && fields.academicYear !== row.academicYear) {
      const duplicate = await this.sessionRepo.findByAcademicYear(fields.academicYear);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('A session with this academic_year already exists');
      }
    }

    fields.updatedBy = userId ?? null;

    const updated = await this.sessionRepo.updateById(id, fields);
    await this.eventRepo.insertEvent(id, SessionEventType.Updated, { ...fields }, userId);
    return formatSession(updated!);
  }

  open(id: string, userId?: UserId): Promise<AcademicSessionEntity> {
    return this.transitionToOpen(id, userId, SessionEventType.Opened, {
      returnIfAlreadyOpen: true,
      invalidMessage: (s) => `Cannot open session in status ${s}`,
      conflictMessage: 'Another session is already open; close it before opening this one',
    });
  }

  reopen(id: string, userId?: UserId): Promise<AcademicSessionEntity> {
    return this.transitionToOpen(id, userId, SessionEventType.Reopened, {
      returnIfAlreadyOpen: false,
      invalidMessage: (s) => `Cannot reopen session in status ${s}`,
      conflictMessage: 'Another session is already open',
    });
  }

  async close(id: string, userId?: UserId): Promise<AcademicSessionEntity> {
    const row = await this.getById(id);
    if (row.status === SessionStatus.CLOSED) return row;
    if (row.status !== SessionStatus.OPEN) {
      throw new UnprocessableEntityException(`Cannot close session in status ${row.status}`);
    }
    const updated = await this.sessionRepo.setStatus(id, SessionStatus.CLOSED, userId);
    await this.eventRepo.insertEvent(id, SessionEventType.Closed, {}, userId);
    return formatSession(updated!);
  }

  // ───────────────────────── Registration locks ─────────────────────────

  async setRegistrationLock(
    id: string,
    body: SetRegistrationLockDto,
    userId?: UserId,
  ): Promise<AcademicSessionEntity | SelectiveLockResultDto> {
    await this.getById(id);

    const universityIds = this.extractUniversityIds(body);
    return universityIds.length > 0
      ? this.lockUniversities(id, universityIds, body, userId)
      : this.lockSession(id, body, userId);
  }

  async getUniversityRegistrationLocks(id: string, query: any) {
    await this.getById(id);
    return this.lockRepo.getUniversityRegistrationLocks(id, query);
  }

  private async lockSession(id: string, body: SetRegistrationLockDto, userId?: UserId) {
    const updated = await this.sessionRepo.setRegistrationLocked(id, body.locked, userId);
    await this.eventRepo.insertEvent(
      id,
      body.locked ? SessionEventType.RegistrationLocked : SessionEventType.RegistrationUnlocked,
      { registration_locked: body.locked },
      userId,
    );
    return updated!;
  }

  private async lockUniversities(
    sessionId: string,
    universityIds: string[],
    body: SetRegistrationLockDto,
    userId?: UserId,
  ): Promise<SelectiveLockResultDto> {
    // Soft-deleted rows are excluded automatically when querying with @DeleteDateColumn
    const universities = await this.universityRepo.find({ where: { id: In(universityIds) } });
    if (universities.length !== universityIds.length) {
      throw new NotFoundException('One or more universities were not found');
    }
    const byId = new Map(universities.map((u) => [u.id, u]));

    const updatedRows = await this.lockRepo.setUniversityRegistrationLocks(sessionId, {
      universityIds,
      locked: body.locked,
      reason: body.reason,
      userId,
    });

    await this.eventRepo.insertEvent(
      sessionId,
      body.locked
        ? SessionEventType.InstitutionRegistrationLocked
        : SessionEventType.InstitutionRegistrationUnlocked,
      { university_ids: universityIds, locked: body.locked, reason: body.reason || null },
      userId,
    );

    return {
      session_id: sessionId,
      locked: body.locked,
      reason: body.reason || null,
      university_ids: universityIds,
      updated_count: updatedRows.length,
      items: updatedRows.map((r) => {
        const uni = byId.get(r.universityId);
        return {
          university_id: r.universityId,
          university_name: uni?.name ?? '',
          university_code: uni?.code ?? '',
          university_short_name: uni?.shortName ?? null,
          locked: r.locked,
          reason: r.reason,
          locked_at: r.lockedAt?.toISOString() ?? null,
          locked_by: r.lockedBy,
          updated_at: r.updatedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  private extractUniversityIds(body: SetRegistrationLockDto): string[] {
    const raw = body.university_ids?.length
      ? body.university_ids
      : body.university_id?.trim()
        ? [body.university_id.trim()]
        : [];

    const unique = [...new Set(raw)];
    for (const uniId of unique) this.assertUuid(uniId, `Invalid university ID: ${uniId}`);
    return unique;
  }

  // ───────────────────────── Candidate numbers ─────────────────────────

  async finalizeCandidateNumbers(id: string, userId?: UserId) {
    const session = await this.getById(id);
    await this.eventRepo.insertEvent(id, SessionEventType.FinalizationTriggered, {}, userId);

    const { assignedCount, updates } = await this.dataSource.transaction(async (manager) => {
      // Serialise concurrent finalizations of the same session
      await manager.findOne(AcademicSessionEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      const [pending, alreadyNumbered] = await Promise.all([
        this.registrationRepo.findApprovedWithoutCandidateNumber(id, manager),
        this.registrationRepo.countNumberedByUniversity(id, manager),
      ]);

      // Continue each university's sequence after numbers it already has,
      // so re-running finalization will not produce duplicates.
      const counters = new Map(alreadyNumbered);
      const updates: Array<{ id: string; jupebCandidateNumber: string }> = [];

      for (const reg of pending) {
        let next = (counters.get(reg.universityId) ?? 0) + 1;
        let candidateNumber = `${session.yearShort}${reg.jupebPrefix}${String(next).padStart(4, '0')}`;

        let isDuplicate = true;
        while (isDuplicate) {
          const existing = await manager.query(
            `SELECT id
             FROM jupeb_registrations
             WHERE jupeb_candidate_number = $1 AND id <> $2
             LIMIT 1`,
            [candidateNumber, reg.id],
          );

          if (existing.length === 0) {
            isDuplicate = false;
          } else {
            next += 1;
            candidateNumber = `${session.yearShort}${reg.jupebPrefix}${String(next).padStart(4, '0')}`;
          }
        }

        counters.set(reg.universityId, next);
        updates.push({ id: reg.id, jupebCandidateNumber: candidateNumber });
      }

      await this.registrationRepo.assignCandidateNumbers(updates, manager);
      return { assignedCount: updates.length, updates };
    });

    await this.sessionRepo.setFinalNumbersGeneratedAt(id, userId);

    // Enqueue candidate sync to attendance & CRMS after transaction commit
    const syncJob = await this.candidateSyncQueueService.enqueueCandidateSyncJob({
      sessionId: id,
      userId,
      triggeredBy: 'finalize_candidate_numbers',
    });

    this.logger.log(`Finalized ${assignedCount} candidate numbers for session ${id}`);

    // Dispatch candidate number email notifications
    for (const u of updates) {
      try {
        this.eventEmitter.emit(RegistrationEvent.MATRIC_ASSIGNED, {
          registrationId: u.id,
          candidateNumber: u.jupebCandidateNumber,
          userId,
        });
      } catch (err: any) {
        this.logger.warn(`Failed to emit matric assigned event for ${u.id}: ${err?.message}`);
      }
    }


    return {
      session_id: id,
      status: 'completed',
      assigned_count: assignedCount,
      finalized_at: new Date().toISOString(),
      sync_job_id: syncJob.jobId,
    };
  }

  async finalizeAllClosed(userId?: UserId) {
    const finalized = [];
    let offset = 0;

    // Page through every closed session instead of stopping at 100
    for (;;) {
      const batch = await this.sessionRepo.findAll({
        limit: FINALIZE_ALL_PAGE_SIZE,
        offset,
        status: SessionStatus.CLOSED,
      });
      if (batch.length === 0) break;

      for (const s of batch) {
        const res = await this.finalizeCandidateNumbers(s.id, userId);
        finalized.push({
          session_id: s.id,
          academic_year: s.academicYear,
          assigned_count: res.assigned_count,
          status: res.status,
          sync_job_id: res.sync_job_id,
        });
      }

      if (batch.length < FINALIZE_ALL_PAGE_SIZE) break;
      offset += FINALIZE_ALL_PAGE_SIZE;
    }

    return { total_sessions: finalized.length, finalized };
  }

  // ───────────────────────── Metrics & stats ─────────────────────────

  async metrics(
    userId?: UserId,
    query: SessionMetricsQueryDto = {},
  ): Promise<SessionMetricsResponseDto> {
    const session = await this.sessionContextService.resolveEffectiveSession(
      userId,
      query.session_id || null,
    );
    if (!session) return { session: null, metrics: emptyMetrics() };

    const metrics = await this.collectMetrics(session.id);
    const payload: SessionMetricsResponseDto = {
      session: {
        id: session.id,
        label: session.academicYear,
        status: session.status,
        opens_at: session.opensAt?.toISOString() ?? null,
        closes_at: session.closesAt?.toISOString() ?? null,
      },
      metrics,
    };

    const previousId = query.previous_session_id;
    if (previousId) {
      this.assertUuid(previousId, 'previous_session_id must be a valid UUID');
      const [prevRow, previousMetrics] = await Promise.all([
        this.getById(previousId),
        this.collectMetrics(previousId),
      ]);
      payload.compared_to = { session_id: previousId, label: prevRow.academicYear || null };
      payload.deltas = computeDeltas(metrics, previousMetrics, METRIC_KEYS);
    }

    return payload;
  }

  async stats(
    id: string,
    query: { previous_session_id?: string } = {},
  ): Promise<SessionStatsResponseDto> {
    const current = await this.collectStats(id);
    const previousId = query.previous_session_id;
    if (!previousId) return current;

    const previous = await this.collectStats(previousId);
    return {
      ...current,
      previous_session_id: previousId,
      deltas: computeDeltas(current, previous, STATS_KEYS),
    };
  }

  private async collectMetrics(sessionId: string) {
    const [total, approved, biometric, institutions] = await Promise.all([
      this.registrationRepo.countAll(sessionId),
      this.registrationRepo.countByStatus(sessionId, RegistrationStatus.APPROVED),
      this.registrationRepo.countWithActiveBiometrics(sessionId, { excludeWithdrawn: true }),
      this.registrationRepo.countInstitutions(sessionId),
    ]);

    return {
      exams: null,
      institutions,
      total_candidates: total,
      current_candidates_enrolled: approved,
      candidates_with_biometrics: biometric,
    };
  }

  private async collectStats(id: string) {
    await this.getById(id);

    const [byStatus, institutions, subjectCombinations, withBio] = await Promise.all([
      this.registrationRepo.countGroupedByStatus(id),
      this.registrationRepo.countInstitutions(id),
      this.registrationRepo.countSubjectCombinations(id),
      this.registrationRepo.countWithActiveBiometrics(id),
    ]);
    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);

    return {
      session_id: id,
      total_registrations: total,
      registrations_by_status: byStatus,
      institutions_count: institutions,
      subject_combinations_count: subjectCombinations,
      candidates_with_biometrics: withBio,
      candidates_without_biometrics: total - withBio,
    };
  }

  // ───────────────────────────── Export ─────────────────────────────

  async exportCsv(): Promise<string> {
    const rows = await this.sessionRepo.findAll({ limit: CSV_EXPORT_LIMIT, offset: 0 });

    const iso = (d?: Date | null) => d?.toISOString();
    const columns: [header: string, value: (r: AcademicSessionEntity) => unknown][] = [
      ['id', (r) => r.id],
      ['academic_year', (r) => r.academicYear],
      ['year_short', (r) => r.yearShort],
      ['status', (r) => r.status],
      ['opens_at', (r) => iso(r.opensAt)],
      ['closes_at', (r) => iso(r.closesAt)],
      ['candidate_info_cutoff_at', (r) => iso(r.candidateInfoCutoffAt)],
      ['profile_update_cutoff_at', (r) => iso(r.profileUpdateCutoffAt)],
      ['ca_cutoff_at', (r) => iso(r.caCutoffAt)],
      ['max_ca_score', (r) => r.maxCaScore],
      ['affiliation_fee_existing', (r) => r.affiliationFeeExisting],
      ['affiliation_fee_new', (r) => r.affiliationFeeNew],
      ['exam_fee_per_candidate', (r) => r.examFeePerCandidate],
      ['registration_fee_amount', (r) => r.registrationFeeAmount],
      ['registration_fee_currency', (r) => r.registrationFeeCurrency],
      ['created_at', (r) => iso(r.createdAt)],
    ];

    const escape = (v: unknown) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    return [
      columns.map(([h]) => h).join(','),
      ...rows.map((r) => columns.map(([, get]) => escape(get(r))).join(',')),
    ].join('\n');
  }

  // ───────────────────────────── Helpers ─────────────────────────────

  private async transitionToOpen(
    id: string,
    userId: UserId,
    eventType: SessionEventType,
    opts: {
      returnIfAlreadyOpen: boolean;
      invalidMessage: (status: SessionStatus) => string;
      conflictMessage: string;
    },
  ): Promise<AcademicSessionEntity> {
    const row = await this.getById(id);

    if (opts.returnIfAlreadyOpen && row.status === SessionStatus.OPEN) return row;
    if (!canTransitionStatus(row.status, SessionStatus.OPEN)) {
      throw new UnprocessableEntityException(opts.invalidMessage(row.status));
    }
    if ((await this.sessionRepo.countOtherOpenSessions(id)) > 0) {
      throw new ConflictException(opts.conflictMessage);
    }

    const updated = await this.sessionRepo.setStatus(id, SessionStatus.OPEN, userId);
    await this.eventRepo.insertEvent(id, eventType, {}, userId);
    return formatSession(updated!);
  }

  private assertYearPair(academicYear?: string, yearShort?: string): void {
    const result = validateYearShortForAcademicYear(academicYear!, yearShort!);
    if (!result.ok) throw new UnprocessableEntityException(result.error);
  }

  private assertUuid(value: string, message: string): void {
    if (!isUUID(value)) throw new UnprocessableEntityException(message);
  }
}
