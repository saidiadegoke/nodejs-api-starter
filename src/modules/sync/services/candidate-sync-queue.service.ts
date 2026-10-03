import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBossService } from '../../../infra/pg-boss/pg-boss.service';
import { SyncExecutorService } from './sync-executor.service';
import { EnqueueCandidateSyncDto, CandidateSyncJobPayload } from '../dto/enqueue-candidate-sync.dto';
import { SyncLogEntity, SyncEntityType, SyncStatus, SyncTarget } from '../entities/sync-log.entity';

import { SyncQueue } from '../constants/sync-events.enum';

const CONTEXT = 'CandidateSyncQueueService';

@Injectable()
export class CandidateSyncQueueService {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly syncExecutor: SyncExecutorService,
    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepo: Repository<SyncLogEntity>,
  ) {}

  /**
   * Enqueue candidate sync job for attendance & crms via PostgreSQL pg-boss queue.
   * Tracks sync history and failure/retry status.
   */
  async enqueueCandidateSyncJob(dto: EnqueueCandidateSyncDto) {
    const isSingleCandidate = dto.registrationIds && dto.registrationIds.length === 1;
    const entityId = isSingleCandidate ? dto.registrationIds![0] : dto.sessionId;

    // Create sync log entry
    const syncLog = await this.syncLogRepo.save(
      this.syncLogRepo.create({
        entityType: isSingleCandidate ? SyncEntityType.CANDIDATE : SyncEntityType.BULK_SESSION,
        entityId: entityId || null,
        target: SyncTarget.ALL,
        status: SyncStatus.PENDING,
        triggeredBy: dto.triggeredBy || 'manual_trigger',
        userId: dto.userId || null,
        payload: {
          sessionId: dto.sessionId,
          registrationIds: dto.registrationIds || [],
          metadata: dto.metadata || {},
        },
      }),
    );

    const jobPayload: CandidateSyncJobPayload & { syncLogId: string } = {
      sessionId: dto.sessionId,
      registrationIds: dto.registrationIds,
      userId: dto.userId,
      triggeredBy: dto.triggeredBy || 'manual_trigger',
      metadata: dto.metadata || {},
      syncLogId: syncLog.id,
    };

    const jobId = await this.pgBossService.send(SyncQueue.CANDIDATE, jobPayload, {
      retryLimit: 5,
      retryDelay: 10,
      retryBackoff: true,
    });


    if (jobId) {
      await this.syncLogRepo.update(syncLog.id, {
        jobId,
      });

      this.logger.log(
        `Enqueued pg-boss candidate sync job ${jobId} for session ${dto.sessionId} (logId: ${syncLog.id})`,
      );

      return {
        jobId,
        syncLogId: syncLog.id,
        sessionId: dto.sessionId,
        status: 'enqueued',
      };
    } else {
      // Fallback: sync directly if background worker is unavailable
      this.logger.log(`pg-boss queue inactive, processing candidate sync directly for logId: ${syncLog.id}`);
      const result = await this.syncExecutor.syncCandidates(dto.registrationIds, dto.sessionId, syncLog.id);
      return {
        jobId: null,
        syncLogId: syncLog.id,
        sessionId: dto.sessionId,
        status: 'completed',
        result,
      };
    }
  }
}
