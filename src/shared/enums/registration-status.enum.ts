export enum RegistrationStatus {
  PROVISIONAL = 'provisional',
  CODE_ISSUED = 'code_issued',
  CLAIMED = 'claimed',
  PENDING_STUDENT_CONFIRM = 'pending_student_confirm',
  PENDING_DOCUMENTS = 'pending_documents',
  PENDING_INSTITUTION_REVIEW = 'pending_institution_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

/**
 * Statuses that are excluded from student/registration counts across dashboard,
 * institution overview, catalog, and subject enrollment charts.
 * Per specification: rejected and withdrawn registrations must not be counted.
 */
export const EXCLUDED_FROM_STUDENT_COUNT_STATUSES = [
  RegistrationStatus.WITHDRAWN,
  RegistrationStatus.REJECTED,
] as const;

/**
 * Generates SQL condition to filter for valid/active student registrations
 * (excluding withdrawn and rejected registrations).
 *
 * @param tableAlias - The alias of the registrations table, e.g. 'r' or empty string ''.
 * @returns SQL snippet, e.g. "r.status NOT IN ('withdrawn', 'rejected')"
 */
export function getActiveStudentStatusCondition(tableAlias = 'r'): string {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `${prefix}status NOT IN ('${RegistrationStatus.WITHDRAWN}', '${RegistrationStatus.REJECTED}')`;
}

