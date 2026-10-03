import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PgBossService } from '../../../infra/pg-boss/pg-boss.service';
import { SyncExecutorService } from './sync-executor.service';
import { SyncQueue } from '../constants/sync-events.enum';

const CONTEXT = 'PgBossSyncWorkerService';

@Injectable()
export class PgBossSyncWorkerService implements OnModuleInit {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly syncExecutor: SyncExecutorService,
  ) {}

  async onModuleInit() {
    this.logger.log('Registering pg-boss background workers for sync queues...');

    await this.pgBossService.work(SyncQueue.CANDIDATE, async (jobs: any) => {
      const jobList = Array.isArray(jobs) ? jobs : [jobs];
      for (const job of jobList) {
        if (!job) continue;
        this.logger.log(`[pg-boss] Processing ${SyncQueue.CANDIDATE} job ${job.id}`);
        const { sessionId, registrationIds, syncLogId } = job.data || {};
        const retryCount = job.retrycount ?? job.retryCount ?? 0;
        await this.syncExecutor.syncCandidates(
          registrationIds,
          sessionId,
          syncLogId,
          retryCount,
        );
      }
    });

    await this.pgBossService.work(SyncQueue.SUBJECT, async (jobs: any) => {
      const jobList = Array.isArray(jobs) ? jobs : [jobs];
      for (const job of jobList) {
        if (!job) continue;
        this.logger.log(`[pg-boss] Processing ${SyncQueue.SUBJECT} job ${job.id}`);
        const { subjectIds, syncAll, syncLogId } = job.data || {};
        const retryCount = job.retrycount ?? job.retryCount ?? 0;
        await this.syncExecutor.syncSubjects(
          subjectIds,
          syncAll,
          syncLogId,
          retryCount,
        );
      }
    });

    await this.pgBossService.work(SyncQueue.INSTITUTION, async (jobs: any) => {
      const jobList = Array.isArray(jobs) ? jobs : [jobs];
      for (const job of jobList) {
        if (!job) continue;
        this.logger.log(`[pg-boss] Processing ${SyncQueue.INSTITUTION} job ${job.id}`);
        const { universityIds, syncAll, syncLogId } = job.data || {};
        const retryCount = job.retrycount ?? job.retryCount ?? 0;
        await this.syncExecutor.syncInstitutions(
          universityIds,
          syncAll,
          syncLogId,
          retryCount,
        );
      }
    });

    this.logger.log('pg-boss sync workers registered successfully.');

  }
}

