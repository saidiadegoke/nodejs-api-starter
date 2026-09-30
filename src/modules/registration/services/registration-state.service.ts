import { Injectable } from '@nestjs/common';
import { RegistrationStatus } from '../entities/registration.entity';

const TRANSITIONS: Record<string, string[]> = {
  [RegistrationStatus.PROVISIONAL]: [RegistrationStatus.CODE_ISSUED, RegistrationStatus.WITHDRAWN],
  [RegistrationStatus.CODE_ISSUED]: [RegistrationStatus.CLAIMED, RegistrationStatus.WITHDRAWN],
  [RegistrationStatus.CLAIMED]: [
    RegistrationStatus.PENDING_STUDENT_CONFIRM,
    RegistrationStatus.PENDING_DOCUMENTS,
    RegistrationStatus.PENDING_INSTITUTION_REVIEW,
    RegistrationStatus.WITHDRAWN,
  ],
  [RegistrationStatus.PENDING_STUDENT_CONFIRM]: [
    RegistrationStatus.PENDING_DOCUMENTS,
    RegistrationStatus.PENDING_INSTITUTION_REVIEW,
    RegistrationStatus.WITHDRAWN,
  ],
  [RegistrationStatus.PENDING_DOCUMENTS]: [
    RegistrationStatus.PENDING_INSTITUTION_REVIEW,
    RegistrationStatus.WITHDRAWN,
  ],
  [RegistrationStatus.PENDING_INSTITUTION_REVIEW]: [
    RegistrationStatus.APPROVED,
    RegistrationStatus.REJECTED,
    RegistrationStatus.WITHDRAWN,
  ],
  [RegistrationStatus.APPROVED]: [],
  [RegistrationStatus.REJECTED]: [],
  [RegistrationStatus.WITHDRAWN]: [],
};

@Injectable()
export class RegistrationStateService {
  canTransition(from: string, to: string): boolean {
    const next = TRANSITIONS[from];
    return Array.isArray(next) && next.includes(to);
  }
}
