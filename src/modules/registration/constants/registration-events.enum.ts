export enum RegistrationEvent {
  CODE_ISSUED = 'registration.code_issued',
  MATRIC_ASSIGNED = 'registration.matric_assigned',
  APPROVED = 'registration.approved',
  REJECTED = 'registration.rejected',
  WITHDRAWN = 'registration.withdrawn',
  DELETED = 'registration.deleted',
  UNLOCKED = 'registration.unlocked',
  LOCKED = 'registration.locked',
}

export interface CodeIssuedEvent {
  registrationId: string;
  userId?: string | null;
}

export interface MatricAssignedEvent {
  registrationId: string;
  candidateNumber: string;
  userId?: string | null;
}

export interface RegistrationStatusChangeEvent {
  registrationId: string;
  userId?: string | null;
  candidateNumber?: string | null;
  reason?: string | null;
  email?: string | null;
  firstName?: string | null;
  universityName?: string | null;
}
