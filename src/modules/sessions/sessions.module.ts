import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AcademicSessionEntity,
  SessionEventEntity,
  SessionUniversityLockEntity,
} from './entities';
import { ProfileEntity } from '../users/entities/profile.entity';
import { UniversityEntity } from '../institutions/entities/university.entity';
import {
  SessionRepository,
  SessionUniversityLockRepository,
  SessionEventRepository,
} from './repositories';
import { SessionContextService } from './services/session-context.service';
import { SessionsService } from './services/sessions.service';
import { SessionsController } from './controllers/sessions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AcademicSessionEntity,
      SessionEventEntity,
      SessionUniversityLockEntity,
      ProfileEntity,
      UniversityEntity,
    ]),
  ],
  controllers: [SessionsController],
  providers: [
    SessionRepository,
    SessionUniversityLockRepository,
    SessionEventRepository,
    SessionContextService,
    SessionsService,
  ],
  exports: [
    SessionRepository,
    SessionUniversityLockRepository,
    SessionEventRepository,
    SessionContextService,
    SessionsService,
  ],
})
export class SessionsModule {}
