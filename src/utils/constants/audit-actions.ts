/**
 * Canonical audit action names and their display titles.
 *
 * The names mirror the legacy Express taxonomy (the `AdminAuditService.log({...})`
 * call sites that used to live in `src/modules/jupeb/controllers/**`): the read side of
 * the audit trail (`AdminAuditService`) renders titles from this map, and the write side
 * (`AuditInterceptor` / `@Audit`) must produce keys that exist here so the UI shows a
 * human-readable title instead of falling back to a de-slugified action string.
 */

export const AUDIT_ACTION_TITLES: Record<string, string> = {
  'session.create': 'Created new session',
  'session.update': 'Updated session',
  'session.open': 'Opened session',
  'session.close': 'Closed session',
  'session.reopen': 'Reopened session',
  'session.lock_registration': 'Locked Registration',
  'session.unlock_registration': 'Unlocked registration',
  'session.institution_registration_lock': 'Locked institution registration',
  'session.institution_registration_unlock': 'Unlocked institution registration',
  'session.finalize_candidate_numbers': 'Generated candidate numbers',
  'session.finalize_all_closed': 'Finalized all closed sessions',
  'catalog.university_create': 'Created new university',
  'catalog.university_update': 'Updated university',
  'catalog.university_activate': 'Activated university',
  'catalog.university_deactivate': 'Deactivated university',
  'catalog.university_delete': 'Deleted university',
  'catalog.subject_combination_create': 'Created new subjects combinations',
  'catalog.subject_combination_update': 'Updated subject combination',
  'catalog.subject_combination_activate': 'Activated subject combination',
  'catalog.subject_combination_deactivate': 'Deactivated subject combination',
  'catalog.subject_combination_delete': 'Deleted subject combination',
  'catalog.document_requirement_create': 'Created document requirement',
  'catalog.document_requirement_update': 'Updated document requirement',
  'catalog.document_requirement_activate': 'Activated document requirement',
  'catalog.document_requirement_deactivate': 'Deactivated document requirement',
  'registration.create': 'Created registration',
  'registration.update': 'Updated registration',
  'candidate.update': 'Updated candidate info',
  'registration.bulk_upload': 'Bulk uploaded registrations',
  'registration.approve': 'Approved registration',
  'registration.reject': 'Rejected registration',
  'registration.withdraw': 'Withdrew registration',
  'registration.delete': 'Deleted registration',
  'document.review_accept': 'Accepted document',
  'document.review_reject': 'Rejected document',
  'results.release_to_institutions': 'Released results to institutions',
  'results.release_to_students': 'Released results to students',
  'results.institution_entry_patch': 'Updated result grade entry',
  'user.create': 'Created user',
  'user.create_with_university': 'Created user with university',
  'user.roles_update': 'Updated user roles',
  'role.create': 'Created role',
  'role.update': 'Updated role',
  'role.delete': 'Deleted role',
  'registration.lock': 'Locked candidate registration',
  'registration.unlock': 'Unlocked candidate registration',
  'registration.resend_code': 'Registration Resend Code',
  'identity.verify': 'Identity Verify',
  'identity.retry': 'Retry Identity Verify',
  'platform_setting.upsert': 'Updated platform setting',
  // Historical/legacy batch keys mapped without 'Batch'
  'registration.batch_approve': 'Approved registration',
  'registration.batch_reject': 'Rejected registration',
  'registration.batch_withdraw': 'Withdrew registration',
  'registration.batch_delete': 'Deleted registration',
  'registration.batch_lock': 'Locked candidate registration',
  'registration.batch_unlock': 'Unlocked candidate registration',
};

/** Fallback title for an action that has no explicit entry in {@link AUDIT_ACTION_TITLES}. */
export function formatAuditActionTitle(action: string | null | undefined): string {
  if (!action) return 'Action';
  if (AUDIT_ACTION_TITLES[action]) return AUDIT_ACTION_TITLES[action];

  // Strip 'batch' if present so batch actions never display 'Batch' in action titles
  const normalized = action.replace(/\bbatch[._]?/gi, '');
  if (AUDIT_ACTION_TITLES[normalized]) return AUDIT_ACTION_TITLES[normalized];

  return normalized
    .replace(/[._]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Verb used when a mutating route has no `@Audit()` metadata and the handler path
 * carries no literal segment of its own (e.g. `POST /admin/users` -> `user.create`).
 */
export const HTTP_METHOD_VERB: Record<string, string> = {
  POST: 'create',
  PATCH: 'update',
  PUT: 'update',
  DELETE: 'delete',
};

/**
 * Route prefixes excluded from *automatic* capture. They are either unauthenticated,
 * high-volume, or not part of the admin audit surface — logging them would bury the
 * events the audit trail exists to show. An explicit `@Audit()` on a route under one of
 * these prefixes still records.
 */
export const AUDIT_AUTO_CAPTURE_SKIP_PREFIXES: string[] = [
  'auth',
  'notifications',
  'files',
  'health',
  'websocket',
  'sync',
  'audit',
  'api-keys',
  'webhook',
];
