import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBossService } from '../../../infra/pg-boss/pg-boss.service';
import { SyncExecutorService } from './sync-executor.service';
import { EnqueueInstitutionSyncDto, InstitutionSyncJobPayload } from '../dto/enqueue-institution-sync.dto';
import { SyncLogEntity, SyncEntityType, SyncStatus, SyncTarget } from '../entities/sync-log.entity';

import { SyncQueue } from '../constants/sync-events.enum';

const CONTEXT = 'InstitutionSyncQueueService';

@Injectable()
export class InstitutionSyncQueueService {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly syncExecutor: SyncExecutorService,
    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepo: Repository<SyncLogEntity>,
  ) {}

  /**
   * Enqueue institution sync job for attendance & crms via PostgreSQL pg-boss queue.
   */
  async enqueueInstitutionSyncJob(dto: EnqueueInstitutionSyncDto) {
    const isSingleInstitution = dto.universityIds && dto.universityIds.length === 1;
    const entityId = isSingleInstitution ? dto.universityIds![0] : 'all_institutions';

    const syncLog = await this.syncLogRepo.save(
      this.syncLogRepo.create({
        entityType: SyncEntityType.INSTITUTION,
        entityId,
        target: SyncTarget.ALL,
        status: SyncStatus.PENDING,
        triggeredBy: dto.triggeredBy || 'institution_change',
        userId: dto.userId || null,
        payload: {
          universityIds: dto.universityIds || [],
          syncAll: Boolean(dto.syncAll),
          metadata: dto.metadata || {},
        },
      }),
    );

    const jobPayload: InstitutionSyncJobPayload = {
      universityIds: dto.universityIds,
      syncAll: dto.syncAll,
      userId: dto.userId,
      triggeredBy: dto.triggeredBy || 'institution_change',
      metadata: dto.metadata || {},
      syncLogId: syncLog.id,
    };

    const jobId = await this.pgBossService.send(SyncQueue.INSTITUTION, jobPayload, {
      retryLimit: 5,
      retryDelay: 10,
      retryBackoff: true,
    });


    if (jobId) {
      await this.syncLogRepo.update(syncLog.id, {
        jobId,
      });

      this.logger.log(`Enqueued pg-boss institution sync job ${jobId} (logId: ${syncLog.id})`);

      return {
        jobId,
        syncLogId: syncLog.id,
        status: 'enqueued',
      };
    } else {
      this.logger.log(`pg-boss queue inactive, processing institution sync directly for logId: ${syncLog.id}`);
      const result = await this.syncExecutor.syncInstitutions(dto.universityIds, dto.syncAll, syncLog.id);
      return {
        jobId: null,
        syncLogId: syncLog.id,
        status: 'completed',
        result,
      };
    }
  }
}
