import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RegistrationEntity,
  RegistrationDocumentEntity,
  RegistrationStatusHistoryEntity,
  NextOfKinEntity,
} from './entities';
import { NinVerificationEntity } from '../identity/entities/nin-verification.entity';
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
import { PublicRegistrationCleanupController } from './controllers/public-registration-cleanup.controller';
import { NextOfKinController } from './controllers/next-of-kin.controller';
import { RegistrationMailListener } from './listeners/registration-mail.listener';

import { SyncModule } from '../sync';
import { MailModule } from '../mail';
import { SessionsModule } from '../sessions';
import { IdentityModule } from '../identity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RegistrationEntity,
      RegistrationDocumentEntity,
      RegistrationStatusHistoryEntity,
      NextOfKinEntity,
      NinVerificationEntity,
    ]),
    SyncModule,
    MailModule,
    SessionsModule,
    IdentityModule,
  ],
  controllers: [RegistrationController, PublicRegistrationCleanupController, NextOfKinController],
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
    RegistrationMailListener,
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
