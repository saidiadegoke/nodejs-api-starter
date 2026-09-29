import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { SYNC_QUEUES } from '../../../infra/bullmq/queues.config';
import { EnqueueSubjectSyncDto, SubjectSyncJobPayload } from '../dto/enqueue-subject-sync.dto';
import { SyncLogEntity, SyncEntityType, SyncStatus, SyncTarget } from '../entities/sync-log.entity';

const CONTEXT = 'SubjectSyncQueueService';

@Injectable()
export class SubjectSyncQueueService {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    @InjectQueue(SYNC_QUEUES.SUBJECT_SYNC)
    private readonly syncQueue: Queue<SubjectSyncJobPayload>,
    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepo: Repository<SyncLogEntity>,
  ) {}

  /**
   * Enqueue subject sync job for attendance & crms.
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

    const job = await this.syncQueue.add('sync-subjects', jobPayload, {
      jobId: `sync-subjects-${entityId}-${Date.now()}`,
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

    this.logger.log(`Enqueued subject sync job ${job.id} (logId: ${syncLog.id})`);

    return {
      jobId: job.id,
      syncLogId: syncLog.id,
      status: 'enqueued',
    };
  }
}
