import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RegistrationEntity,
  RegistrationDocumentEntity,
  RegistrationStatusHistoryEntity,
  NextOfKinEntity,
} from './entities';
import {
  RegistrationRepository,
  RegistrationDocumentRepository,
  RegistrationStatusHistoryRepository,
  NextOfKinRepository,
} from './repositories';
import { RegistrationStateService } from './services/registration-state.service';
import { RegistrationKpiService } from './services/registration-kpi.service';
import { RegistrationEventsService } from './services/registration-events.service';
import { NextOfKinService } from './services/next-of-kin.service';
import { BulkRegistrationService } from './services/bulk-registration.service';
import { InstitutionUserScopeService } from './services/institution-user-scope.service';
import { RegistrationFormPdfService } from './services/registration-form-pdf.service';
import { RegistrationService } from './services/registration.service';
import { RegistrationController } from './controllers/registration.controller';
import { NextOfKinController } from './controllers/next-of-kin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RegistrationEntity,
      RegistrationDocumentEntity,
      RegistrationStatusHistoryEntity,
      NextOfKinEntity,
    ]),
  ],
  controllers: [RegistrationController, NextOfKinController],
  providers: [
    RegistrationRepository,
    RegistrationDocumentRepository,
    RegistrationStatusHistoryRepository,
    NextOfKinRepository,
    RegistrationStateService,
    RegistrationKpiService,
    RegistrationEventsService,
    NextOfKinService,
    BulkRegistrationService,
    InstitutionUserScopeService,
    RegistrationFormPdfService,
    RegistrationService,
  ],
  exports: [
    RegistrationRepository,
    RegistrationDocumentRepository,
    RegistrationStatusHistoryRepository,
    NextOfKinRepository,
    RegistrationStateService,
    RegistrationKpiService,
    RegistrationEventsService,
    NextOfKinService,
    BulkRegistrationService,
    InstitutionUserScopeService,
    RegistrationFormPdfService,
    RegistrationService,
  ],
})
export class RegistrationModule {}
