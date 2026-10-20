import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AcademicSessionEntity,
  SessionEventEntity,
  SessionUniversityLockEntity,
} from './entities';
import { ProfileEntity } from '../users/entities/profile.entity';
import { UniversityEntity } from '../institutions/entities/university.entity';
import { RegistrationEntity } from '../registration/entities/registration.entity';
import { BiometricCaptureEntity } from '../identity/entities/biometric-capture.entity';
import {
  SessionRepository,
  SessionUniversityLockRepository,
  SessionEventRepository,
  SessionRegistrationRepository,
} from './repositories';
import { SessionContextService } from './services/session-context.service';
import { InstitutionRegistrationLockService } from './services/institution-registration-lock.service';
import { SessionsService } from './services/sessions.service';
import { SessionsController } from './controllers/sessions.controller';

import { SyncModule } from '../sync';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AcademicSessionEntity,
      SessionEventEntity,
      SessionUniversityLockEntity,
      ProfileEntity,
      UniversityEntity,
      RegistrationEntity,
      BiometricCaptureEntity,
    ]),
    SyncModule,
  ],
  controllers: [SessionsController],
  providers: [
    SessionRepository,
    SessionUniversityLockRepository,
    SessionEventRepository,
    SessionRegistrationRepository,
    SessionContextService,
    SessionsService,
    InstitutionRegistrationLockService,
  ],
  exports: [
    SessionRepository,
    SessionUniversityLockRepository,
    SessionEventRepository,
    SessionRegistrationRepository,
    SessionContextService,
    SessionsService,
    InstitutionRegistrationLockService,
  ],
})
export class SessionsModule {}
