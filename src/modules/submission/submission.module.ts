import { Module, forwardRef } from '@nestjs/common';
import { SubmissionController } from './controllers/submission.controller';
import { SubmissionService } from './services/submission.service';
import { RegistrationModule } from '../registration/registration.module';
import { DocumentRequirementsModule } from '../document-requirements/document-requirements.module';
import { UsersModule } from '../users/users.module';
import { OcrModule } from '../ocr/ocr.module';

@Module({
  imports: [
    RegistrationModule,
    DocumentRequirementsModule,
    UsersModule,
    forwardRef(() => OcrModule),
  ],
  controllers: [SubmissionController],
  providers: [SubmissionService],
  exports: [SubmissionService],
})
export class SubmissionModule {}
