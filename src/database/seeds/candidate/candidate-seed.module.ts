import { Module } from '@nestjs/common';
import { CandidateSeedService } from './candidate-seed.service';

@Module({
  providers: [CandidateSeedService],
  exports: [CandidateSeedService],
})
export class CandidateSeedModule {}
