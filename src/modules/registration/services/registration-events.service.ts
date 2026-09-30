import { Injectable } from '@nestjs/common';
import { RegistrationEntity } from '../entities/registration.entity';

@Injectable()
export class RegistrationEventsService {
  async emitRegistrationApproved(registration: RegistrationEntity, _approvedByUserId?: string | null): Promise<void> {
    if (!registration.userId) return;
    // Dispatch notifications/webhooks/mailer asynchronously
  }
}
