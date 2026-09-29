import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullMQModule } from '../../infra/bullmq/bullmq.module';
import { SyncLogEntity } from './entities/sync-log.entity';
import { SubjectEntity } from '../subjects/entities/subject.entity';
import { UniversityEntity } from '../institutions/entities/university.entity';
import { RegistrationEntity } from '../registration/entities/registration.entity';
import { CandidateSyncQueueService } from './services/candidate-sync-queue.service';
import { SubjectSyncQueueService } from './services/subject-sync-queue.service';
import { InstitutionSyncQueueService } from './services/institution-sync-queue.service';
import { SyncService } from './services/sync.service';
import { CandidateSyncProcessor } from './processors/candidate-sync.processor';
import { SubjectSyncProcessor } from './processors/subject-sync.processor';
import { InstitutionSyncProcessor } from './processors/institution-sync.processor';
import { SyncController } from './controllers/sync.controller';

@Module({
  imports: [
    BullMQModule,
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
    CandidateSyncProcessor,
    SubjectSyncProcessor,
    InstitutionSyncProcessor,
  ],
  exports: [
    CandidateSyncQueueService,
    SubjectSyncQueueService,
    InstitutionSyncQueueService,
    SyncService,
  ],
})
export class SyncModule {}
