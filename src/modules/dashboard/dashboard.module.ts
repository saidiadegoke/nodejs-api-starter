import { Module } from '@nestjs/common';
import { DashboardController } from './controllers/dashboard.controller';
import { StudentDashboardController } from './controllers/student-dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { StudentDashboardService } from './services/student-dashboard.service';
import { SharedModule } from '../../shared';
import { SessionsModule } from '../sessions/sessions.module';
import { RegistrationModule } from '../registration/registration.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { SubjectsModule } from '../subjects/subjects.module';

@Module({
  imports: [
    SharedModule,
    SessionsModule,
    RegistrationModule,
    InstitutionsModule,
    SubjectsModule,
  ],
  controllers: [DashboardController, StudentDashboardController],
  providers: [DashboardService, StudentDashboardService],
  exports: [DashboardService, StudentDashboardService],
})
export class DashboardModule {}
