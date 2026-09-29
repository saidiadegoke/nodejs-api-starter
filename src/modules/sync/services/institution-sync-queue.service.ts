import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { SYNC_QUEUES } from '../../../infra/bullmq/queues.config';
import { EnqueueInstitutionSyncDto, InstitutionSyncJobPayload } from '../dto/enqueue-institution-sync.dto';
import { SyncLogEntity, SyncEntityType, SyncStatus, SyncTarget } from '../entities/sync-log.entity';

const CONTEXT = 'InstitutionSyncQueueService';

@Injectable()
export class InstitutionSyncQueueService {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    @InjectQueue(SYNC_QUEUES.INSTITUTION_SYNC)
    private readonly syncQueue: Queue<InstitutionSyncJobPayload>,
    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepo: Repository<SyncLogEntity>,
  ) {}

  /**
   * Enqueue institution sync job for attendance & crms.
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

    const job = await this.syncQueue.add('sync-institutions', jobPayload, {
      jobId: `sync-institutions-${entityId}-${Date.now()}`,
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

    this.logger.log(`Enqueued institution sync job ${job.id} (logId: ${syncLog.id})`);

    return {
      jobId: job.id,
      syncLogId: syncLog.id,
      status: 'enqueued',
    };
  }
}
