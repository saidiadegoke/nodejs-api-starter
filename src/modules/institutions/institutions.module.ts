import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UniversityEntity } from './entities/university.entity';
import { UniversityRepository } from './repositories/university.repository';
import { InstitutionsService } from './services/institutions.service';
import { InstitutionAdminProvisionService } from './services/institution-admin-provision.service';
import { InstitutionsController } from './controllers/institutions.controller';
import { SharedModule } from '../../utils';
import { SyncModule } from '../sync';

@Module({
  imports: [
    TypeOrmModule.forFeature([UniversityEntity]),
    SharedModule,
    SyncModule,
  ],
  controllers: [InstitutionsController],
  providers: [
    UniversityRepository,
    InstitutionsService,
    InstitutionAdminProvisionService,
  ],
  exports: [
    UniversityRepository,
    InstitutionsService,
    InstitutionAdminProvisionService,
    TypeOrmModule,
  ],
})
export class InstitutionsModule {}
