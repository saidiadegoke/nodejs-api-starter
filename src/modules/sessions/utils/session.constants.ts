export const DEFAULT_CURRENCY = 'NGN';
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const CSV_EXPORT_LIMIT = 10_000;
export const FINALIZE_ALL_PAGE_SIZE = 100;

export enum SessionEventType {
  Created = 'session_created',
  Updated = 'session_updated',
  Opened = 'opened',
  Closed = 'closed',
  Reopened = 'reopened',
  RegistrationLocked = 'registration_locked',
  RegistrationUnlocked = 'registration_unlocked',
  InstitutionRegistrationLocked = 'institution_registration_locked',
  InstitutionRegistrationUnlocked = 'institution_registration_unlocked',
  FinalizationTriggered = 'finalization_triggered',
}
