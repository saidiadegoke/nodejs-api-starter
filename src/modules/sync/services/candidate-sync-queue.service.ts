import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { SYNC_QUEUES } from '../../../infra/bullmq/queues.config';
import { EnqueueCandidateSyncDto, CandidateSyncJobPayload } from '../dto/enqueue-candidate-sync.dto';
import { SyncLogEntity, SyncEntityType, SyncStatus, SyncTarget } from '../entities/sync-log.entity';

const CONTEXT = 'CandidateSyncQueueService';

@Injectable()
export class CandidateSyncQueueService {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    @InjectQueue(SYNC_QUEUES.CANDIDATE_SYNC)
    private readonly syncQueue: Queue<CandidateSyncJobPayload & { syncLogId?: string }>,
    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepo: Repository<SyncLogEntity>,
  ) {}

  /**
   * Enqueue candidate sync job for attendance & crms.
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

    const job = await this.syncQueue.add('sync-candidates', jobPayload, {
      jobId: `sync-candidates-${entityId || 'bulk'}-${Date.now()}`,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    await this.syncLogRepo.update(syncLog.id, {
      jobId: job.id,
    });

    this.logger.log(
      `Enqueued candidate sync job ${job.id} for session ${dto.sessionId} (logId: ${syncLog.id})`,
    );

    return {
      jobId: job.id,
      syncLogId: syncLog.id,
      sessionId: dto.sessionId,
      status: 'enqueued',
    };
  }
}
