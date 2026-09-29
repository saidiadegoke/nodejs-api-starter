import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncLogEntity, SyncEntityType, SyncStatus } from '../entities/sync-log.entity';
import { CandidateSyncQueueService } from './candidate-sync-queue.service';
import { SubjectSyncQueueService } from './subject-sync-queue.service';
import { InstitutionSyncQueueService } from './institution-sync-queue.service';
import {
  ListSyncLogsQueryDto,
  TriggerCandidateSyncDto,
  TriggerSubjectSyncDto,
  TriggerInstitutionSyncDto,
} from '../dto/sync-query.dto';

const CONTEXT = 'SyncService';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepo: Repository<SyncLogEntity>,
    private readonly candidateSyncQueueService: CandidateSyncQueueService,
    private readonly subjectSyncQueueService: SubjectSyncQueueService,
    private readonly institutionSyncQueueService: InstitutionSyncQueueService,
  ) {}

  /**
   * Trigger candidate synchronization on demand.
   */
  async triggerCandidateSync(dto: TriggerCandidateSyncDto, userId?: string | null) {
    if (!dto.session_id && (!dto.registration_ids || dto.registration_ids.length === 0)) {
      throw new UnprocessableEntityException('session_id or registration_ids must be provided');
    }

    return this.candidateSyncQueueService.enqueueCandidateSyncJob({
      sessionId: dto.session_id || '',
      registrationIds: dto.registration_ids,
      userId,
      triggeredBy: 'manual_api_trigger',
    });
  }

  /**
   * Trigger subject synchronization on demand.
   */
  async triggerSubjectSync(dto: TriggerSubjectSyncDto = {}, userId?: string | null) {
    return this.subjectSyncQueueService.enqueueSubjectSyncJob({
      subjectIds: dto.subject_ids,
      syncAll: !dto.subject_ids || dto.subject_ids.length === 0,
      userId,
      triggeredBy: 'manual_api_trigger',
    });
  }

  /**
   * Trigger institution synchronization on demand.
   */
  async triggerInstitutionSync(dto: TriggerInstitutionSyncDto = {}, userId?: string | null) {
    return this.institutionSyncQueueService.enqueueInstitutionSyncJob({
      universityIds: dto.university_ids,
      syncAll: !dto.university_ids || dto.university_ids.length === 0,
      userId,
      triggeredBy: 'manual_api_trigger',
    });
  }

  /**
   * List paginated sync logs with status & entity filters.
   */
  async listLogs(query: ListSyncLogsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const qb = this.syncLogRepo.createQueryBuilder('l');

    if (query.entity_type) {
      qb.andWhere('l.entity_type = :entityType', { entityType: query.entity_type });
    }
    if (query.status) {
      qb.andWhere('l.status = :status', { status: query.status });
    }
    if (query.target) {
      qb.andWhere('l.target = :target', { target: query.target });
    }
    if (query.q && query.q.trim()) {
      const term = `%${query.q.trim()}%`;
      qb.andWhere(
        '(l.entity_id ILIKE :term OR l.job_id ILIKE :term OR l.error_message ILIKE :term OR l.triggered_by ILIKE :term)',
        { term },
      );
    }

    qb.orderBy('l.created_at', 'DESC').limit(limit).offset(offset);

    const [rows, total] = await qb.getManyAndCount();

    return {
      rows,
      page,
      limit,
      total,
    };
  }

  /**
   * Get single sync log entry by ID.
   */
  async getLogById(id: string): Promise<SyncLogEntity> {
    const log = await this.syncLogRepo.findOne({ where: { id } });
    if (!log) {
      throw new NotFoundException(`Sync log ${id} not found`);
    }
    return log;
  }

  /**
   * Get overall sync statistics (completed, failed, pending, per entity).
   */
  async getStats() {
    const total = await this.syncLogRepo.count();
    const completed = await this.syncLogRepo.count({ where: { status: SyncStatus.COMPLETED } });
    const failed = await this.syncLogRepo.count({ where: { status: SyncStatus.FAILED } });
    const inProgress = await this.syncLogRepo.count({ where: { status: SyncStatus.IN_PROGRESS } });
    const pending = await this.syncLogRepo.count({ where: { status: SyncStatus.PENDING } });
    const partial = await this.syncLogRepo.count({ where: { status: SyncStatus.PARTIAL } });

    const byEntityRaw = await this.syncLogRepo
      .createQueryBuilder('l')
      .select('l.entity_type', 'entityType')
      .addSelect('l.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('l.entity_type')
      .addGroupBy('l.status')
      .getRawMany();

    return {
      total,
      completed,
      failed,
      in_progress: inProgress,
      pending,
      partial,
      breakdown: byEntityRaw,
    };
  }

  /**
   * Retry a failed sync job.
   */
  async retryFailedSync(id: string, userId?: string | null) {
    const log = await this.getLogById(id);

    if (log.status === SyncStatus.COMPLETED) {
      throw new UnprocessableEntityException('Cannot retry a sync job that has already completed successfully');
    }

    const payload = log.payload || {};

    if (log.entityType === SyncEntityType.CANDIDATE || log.entityType === SyncEntityType.BULK_SESSION) {
      return this.candidateSyncQueueService.enqueueCandidateSyncJob({
        sessionId: payload.sessionId || log.entityId || '',
        registrationIds: payload.registrationIds || (log.entityId ? [log.entityId] : undefined),
        userId,
        triggeredBy: `retry_sync_log_${log.id}`,
      });
    }

    if (log.entityType === SyncEntityType.SUBJECT) {
      return this.subjectSyncQueueService.enqueueSubjectSyncJob({
        subjectIds: payload.subjectIds,
        syncAll: payload.syncAll,
        userId,
        triggeredBy: `retry_sync_log_${log.id}`,
      });
    }

    if (log.entityType === SyncEntityType.INSTITUTION) {
      return this.institutionSyncQueueService.enqueueInstitutionSyncJob({
        universityIds: payload.universityIds,
        syncAll: payload.syncAll,
        userId,
        triggeredBy: `retry_sync_log_${log.id}`,
      });
    }

    throw new UnprocessableEntityException(`Unsupported entity type for retry: ${log.entityType}`);
  }
}
