import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentRequirementEntity } from '../../../modules/document-requirements/entities/document-requirement.entity';
import { JupebSeedService } from './jupeb-seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentRequirementEntity])],
  providers: [JupebSeedService],
  exports: [JupebSeedService],
})
export class JupebSeedModule {}
