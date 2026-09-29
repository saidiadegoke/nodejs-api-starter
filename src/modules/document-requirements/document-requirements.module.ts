import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentRequirementEntity } from './entities/document-requirement.entity';
import { DocumentRequirementRepository } from './repositories/document-requirement.repository';
import { DocumentRequirementsService } from './services/document-requirements.service';
import { DocumentRequirementsController } from './controllers/document-requirements.controller';
import { SharedModule } from '../../shared';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentRequirementEntity]), SharedModule],
  controllers: [DocumentRequirementsController],
  providers: [DocumentRequirementRepository, DocumentRequirementsService],
  exports: [
    DocumentRequirementRepository,
    DocumentRequirementsService,
    TypeOrmModule,
  ],
})
export class DocumentRequirementsModule {}
