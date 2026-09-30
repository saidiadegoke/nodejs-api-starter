import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RegistrationResultEntity,
  RegistrationScoreEntity,
  InstitutionSessionResultEntity,
  ResultEntryEntity,
} from './entities';
import {
  RegistrationResultRepository,
  RegistrationScoreRepository,
  InstitutionSessionResultRepository,
  ResultEntryRepository,
} from './repositories';
import {
  AcademicService,
  ResultEntriesService,
  ResultsReleaseService,
} from './services';
import {
  AcademicController,
  ResultEntriesController,
  ResultsReleaseController,
} from './controllers';
import { RegistrationModule } from '../registration/registration.module';
import { CoursesModule } from '../courses/courses.module';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RegistrationResultEntity,
      RegistrationScoreEntity,
      InstitutionSessionResultEntity,
      ResultEntryEntity,
    ]),
    RegistrationModule,
    CoursesModule,
    SessionsModule,
    UsersModule,
  ],
  controllers: [
    AcademicController,
    ResultEntriesController,
    ResultsReleaseController,
  ],
  providers: [
    RegistrationResultRepository,
    RegistrationScoreRepository,
    InstitutionSessionResultRepository,
    ResultEntryRepository,
    AcademicService,
    ResultEntriesService,
    ResultsReleaseService,
  ],
  exports: [
    RegistrationResultRepository,
    RegistrationScoreRepository,
    InstitutionSessionResultRepository,
    ResultEntryRepository,
    AcademicService,
    ResultEntriesService,
    ResultsReleaseService,
  ],
})
export class AcademicModule {}
