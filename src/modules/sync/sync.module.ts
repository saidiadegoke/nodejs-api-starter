import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PgBossModule } from '../../infra/pg-boss/pg-boss.module';
import { BullMQModule } from '../../infra/bullmq/bullmq.module';
import { bullmqEnabled } from '../../infra/bullmq/bullmq-enabled';
import { SyncLogEntity } from './entities/sync-log.entity';
import { SubjectEntity } from '../subjects/entities/subject.entity';
import { UniversityEntity } from '../institutions/entities/university.entity';
import { RegistrationEntity } from '../registration/entities/registration.entity';
import { CandidateSyncQueueService } from './services/candidate-sync-queue.service';
import { SubjectSyncQueueService } from './services/subject-sync-queue.service';
import { InstitutionSyncQueueService } from './services/institution-sync-queue.service';
import { SyncService } from './services/sync.service';
import { SyncExecutorService } from './services/sync-executor.service';
import { PgBossSyncWorkerService } from './services/pgboss-sync-worker.service';
import { SyncEventListener } from './listeners/sync-event.listener';
import { CandidateSyncProcessor } from './processors/candidate-sync.processor';
import { SubjectSyncProcessor } from './processors/subject-sync.processor';
import { InstitutionSyncProcessor } from './processors/institution-sync.processor';
import { SyncController } from './controllers/sync.controller';

@Module({
  imports: [
    PgBossModule,
    ...(bullmqEnabled() ? [BullMQModule] : []),
    TypeOrmModule.forFeature([
      SyncLogEntity,
      SubjectEntity,
      UniversityEntity,
      RegistrationEntity,
    ]),
  ],
  controllers: [SyncController],
  providers: [
    CandidateSyncQueueService,
    SubjectSyncQueueService,
    InstitutionSyncQueueService,
    SyncService,
    SyncExecutorService,
    PgBossSyncWorkerService,
    SyncEventListener,
    // BullMQ workers: each holds a Redis connection, so only with Redis configured.
    ...(bullmqEnabled() ? [CandidateSyncProcessor, SubjectSyncProcessor, InstitutionSyncProcessor] : []),
  ],
  exports: [
    CandidateSyncQueueService,
    SubjectSyncQueueService,
    InstitutionSyncQueueService,
    SyncService,
    SyncExecutorService,
  ],
})
export class SyncModule {}
