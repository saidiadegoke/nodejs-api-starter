import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SYNC_QUEUES } from '../../../infra/bullmq/queues.config';
import { EnqueueCandidateSyncDto, CandidateSyncJobPayload } from '../dto/enqueue-candidate-sync.dto';

const CONTEXT = 'CandidateSyncQueueService';

@Injectable()
export class CandidateSyncQueueService {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    @InjectQueue(SYNC_QUEUES.CANDIDATE_SYNC)
    private readonly syncQueue: Queue<CandidateSyncJobPayload>,
  ) {}

  /**
   * Enqueue candidate sync job for attendance & crms.
   * Dispatched automatically when candidate numbers are finalized.
   */
  async enqueueCandidateSyncJob(dto: EnqueueCandidateSyncDto) {
    const jobPayload: CandidateSyncJobPayload = {
      sessionId: dto.sessionId,
      registrationIds: dto.registrationIds,
      userId: dto.userId,
      triggeredBy: dto.triggeredBy || 'finalize_candidate_numbers',
      metadata: dto.metadata || {},
    };

    const job = await this.syncQueue.add('sync-candidates', jobPayload, {
      jobId: `sync-${dto.sessionId}-${Date.now()}`,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log(
      `Enqueued candidate sync job ${job.id} for session ${dto.sessionId}`,
    );

    return {
      jobId: job.id,
      sessionId: dto.sessionId,
      status: 'enqueued',
    };
  }
}
