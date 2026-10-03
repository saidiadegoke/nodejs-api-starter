import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBossService } from '../../../infra/pg-boss/pg-boss.service';
import { SyncExecutorService } from './sync-executor.service';
import { EnqueueSubjectSyncDto, SubjectSyncJobPayload } from '../dto/enqueue-subject-sync.dto';
import { SyncLogEntity, SyncEntityType, SyncStatus, SyncTarget } from '../entities/sync-log.entity';

import { SyncQueue } from '../constants/sync-events.enum';

const CONTEXT = 'SubjectSyncQueueService';

@Injectable()
export class SubjectSyncQueueService {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly syncExecutor: SyncExecutorService,
    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepo: Repository<SyncLogEntity>,
  ) {}

  /**
   * Enqueue subject sync job for attendance & crms via PostgreSQL pg-boss queue.
   */
  async enqueueSubjectSyncJob(dto: EnqueueSubjectSyncDto) {
    const isSingleSubject = dto.subjectIds && dto.subjectIds.length === 1;
    const entityId = isSingleSubject ? dto.subjectIds![0] : 'all_subjects';

    const syncLog = await this.syncLogRepo.save(
      this.syncLogRepo.create({
        entityType: SyncEntityType.SUBJECT,
        entityId,
        target: SyncTarget.ALL,
        status: SyncStatus.PENDING,
        triggeredBy: dto.triggeredBy || 'subject_change',
        userId: dto.userId || null,
        payload: {
          subjectIds: dto.subjectIds || [],
          syncAll: Boolean(dto.syncAll),
          metadata: dto.metadata || {},
        },
      }),
    );

    const jobPayload: SubjectSyncJobPayload = {
      subjectIds: dto.subjectIds,
      syncAll: dto.syncAll,
      userId: dto.userId,
      triggeredBy: dto.triggeredBy || 'subject_change',
      metadata: dto.metadata || {},
      syncLogId: syncLog.id,
    };

    const jobId = await this.pgBossService.send(SyncQueue.SUBJECT, jobPayload, {
      retryLimit: 5,
      retryDelay: 10,
      retryBackoff: true,
    });


    if (jobId) {
      await this.syncLogRepo.update(syncLog.id, {
        jobId,
      });

      this.logger.log(`Enqueued pg-boss subject sync job ${jobId} (logId: ${syncLog.id})`);

      return {
        jobId,
        syncLogId: syncLog.id,
        status: 'enqueued',
      };
    } else {
      this.logger.log(`pg-boss queue inactive, processing subject sync directly for logId: ${syncLog.id}`);
      const result = await this.syncExecutor.syncSubjects(dto.subjectIds, dto.syncAll, syncLog.id);
      return {
        jobId: null,
        syncLogId: syncLog.id,
        status: 'completed',
        result,
      };
    }
  }
}
