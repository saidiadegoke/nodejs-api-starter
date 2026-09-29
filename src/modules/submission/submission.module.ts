import { Module } from '@nestjs/common';
import { SubmissionController } from './controllers/submission.controller';
import { SubmissionService } from './services/submission.service';
import { RegistrationModule } from '../registration/registration.module';
import { DocumentRequirementsModule } from '../document-requirements/document-requirements.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    RegistrationModule,
    DocumentRequirementsModule,
    UsersModule,
  ],
  controllers: [SubmissionController],
  providers: [SubmissionService],
  exports: [SubmissionService],
})
export class SubmissionModule {}
