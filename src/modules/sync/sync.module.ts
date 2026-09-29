import { Module } from '@nestjs/common';
import { CandidateSyncQueueService } from './services/candidate-sync-queue.service';
import { CandidateSyncProcessor } from './processors/candidate-sync.processor';

@Module({
  imports: [],
  providers: [CandidateSyncQueueService, CandidateSyncProcessor],
  exports: [CandidateSyncQueueService],
})
export class SyncModule {}
