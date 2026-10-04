import { Injectable } from '@nestjs/common';
import { RegistrationStatus } from '../entities/registration.entity';

const TRANSITIONS: Record<string, string[]> = {
  [RegistrationStatus.PROVISIONAL]: [RegistrationStatus.CODE_ISSUED, RegistrationStatus.WITHDRAWN],
  [RegistrationStatus.CODE_ISSUED]: [RegistrationStatus.CLAIMED, RegistrationStatus.WITHDRAWN],
  [RegistrationStatus.CLAIMED]: [
    RegistrationStatus.PENDING_STUDENT_CONFIRM,
    RegistrationStatus.PENDING_DOCUMENTS,
    RegistrationStatus.PENDING_INSTITUTION_REVIEW,
    RegistrationStatus.APPROVED,
    RegistrationStatus.WITHDRAWN,
  ],
  [RegistrationStatus.PENDING_STUDENT_CONFIRM]: [
    RegistrationStatus.PENDING_DOCUMENTS,
    RegistrationStatus.PENDING_INSTITUTION_REVIEW,
    RegistrationStatus.APPROVED,
    RegistrationStatus.WITHDRAWN,
  ],
  [RegistrationStatus.PENDING_DOCUMENTS]: [
    RegistrationStatus.PENDING_INSTITUTION_REVIEW,
    RegistrationStatus.APPROVED,
    RegistrationStatus.WITHDRAWN,
  ],
  [RegistrationStatus.PENDING_INSTITUTION_REVIEW]: [
    RegistrationStatus.APPROVED,
    RegistrationStatus.REJECTED,
    RegistrationStatus.WITHDRAWN,
  ],
  [RegistrationStatus.APPROVED]: [RegistrationStatus.WITHDRAWN],
  [RegistrationStatus.REJECTED]: [RegistrationStatus.PENDING_INSTITUTION_REVIEW, RegistrationStatus.WITHDRAWN],
  [RegistrationStatus.WITHDRAWN]: [],
  // Aliases and legacy states
  submitted: [RegistrationStatus.APPROVED, RegistrationStatus.REJECTED, RegistrationStatus.WITHDRAWN],
  pending: [RegistrationStatus.APPROVED, RegistrationStatus.REJECTED, RegistrationStatus.WITHDRAWN],
  registered: [RegistrationStatus.APPROVED, RegistrationStatus.REJECTED, RegistrationStatus.WITHDRAWN],
};

@Injectable()
export class RegistrationStateService {
  canTransition(from: string, to: string): boolean {
    if (!from || !to) return false;
    const normFrom = String(from).toLowerCase().trim();
    const normTo = String(to).toLowerCase().trim();
    if (normFrom === normTo) return true;
    if (normTo === RegistrationStatus.WITHDRAWN) return true;
    const next = TRANSITIONS[normFrom];
    return Array.isArray(next) && next.includes(normTo);
  }
}
