import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import {
  AuditWriterService,
  writeAuditLog,
} from '../../../utils/services/audit-writer.service';
import {
  AUDIT_ACTION_TITLES,
  formatAuditActionTitle,
} from '../../../utils/constants/audit-actions';
import { redactSensitive } from '../../../utils/utils/redact';

// Action titles live in the shared taxonomy so the write side (AuditInterceptor / @Audit)
// and this read side cannot drift apart.

export function formatDetailsSummary(details: any, action?: string, row?: any): string {
  if (!details) return '';
  if (typeof details === 'string') {
    try {
      details = JSON.parse(details);
    } catch {
      return details.endsWith('.') ? details : `${details}.`;
    }
  }

  const act = (action || row?.action || '').toLowerCase();

  // 1. Session registration locking / unlocking
  if (act.includes('institution_registration_lock') || act.includes('institution_registration_unlock')) {
    const isLock = details.locked === true || (act.includes('lock') && !act.includes('unlock'));
    const uniName = row?.university_name || row?.university_short_name;
    const uniCount = Array.isArray(details.university_ids) ? details.university_ids.length : 1;
    if (uniName) {
      return `${isLock ? 'Locked' : 'Unlocked'} registration for ${uniName}.`;
    }
    return `${isLock ? 'Locked' : 'Unlocked'} registration for ${uniCount} institution${uniCount === 1 ? '' : 's'}.`;
  }

  if (act === 'session.lock_registration' || act === 'session.unlock_registration') {
    const isLock = details.locked === true || act.includes('lock_registration');
    return `${isLock ? 'Locked' : 'Unlocked'} candidate registration for the academic session.`;
  }

  if (act.startsWith('session.')) {
    const sessionYear = details.academic_year || details.name || row?.resource_id;
    if (act.includes('finalize_candidate_numbers')) {
      const assigned = details.assigned ?? (Array.isArray(details.numbers) ? details.numbers.length : 0);
      const skipped = details.skipped ?? 0;
      return `Assigned candidate numbers to ${assigned} candidate${assigned === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} skipped)` : ''}.`;
    }
    if (act === 'session.open') return `Opened academic session ${sessionYear || ''} for registrations.`.replace(/\s+/g, ' ').replace(' .', '.');
    if (act === 'session.close') return `Closed academic session ${sessionYear || ''}.`.replace(/\s+/g, ' ').replace(' .', '.');
    if (act === 'session.reopen') return `Reopened academic session ${sessionYear || ''}.`.replace(/\s+/g, ' ').replace(' .', '.');
    if (act === 'session.create') return `Created academic session ${sessionYear || ''}.`.replace(/\s+/g, ' ').replace(' .', '.');
    if (act === 'session.update') return `Updated academic session ${sessionYear || ''}.`.replace(/\s+/g, ' ').replace(' .', '.');
  }

  // 2. Identity actions (never reveal candidate NIN!)
  if (act === 'identity.verify' || act.startsWith('identity.') || act.includes('identity') || act.includes('nin_verify')) {
    if (details.status === 'failed') {
      const reason = details.error?.message || details.error_message || details.reason;
      return reason
        ? `Candidate identity verification failed: ${reason}.`
        : 'Candidate identity verification failed.';
    }
    if (details.status === 'pending') {
      return 'Candidate identity verification queued.';
    }
    const candidateName =
      details.candidate_name ||
      (details.first_name && details.last_name
        ? `${details.first_name} ${details.last_name}`
        : null);
    if (candidateName) {
      return `Verified candidate identity for ${candidateName}.`;
    }
    return 'Verified candidate identity.';
  }

  // 3. Candidate registration actions
  if (act === 'registration.resend_code') {
    const code = details.institution_issued_code || details.candidate_code || details.code;
    return code
      ? `Resent provisional registration code ${code} to candidate.`
      : 'Resent provisional registration code to candidate.';
  }

  if (act === 'registration.bulk_upload') {
    const succ = details.succeeded_count ?? details.successful ?? 0;
    const fail = details.failed_count ?? details.failed ?? 0;
    const skip = details.skipped_count ?? details.skipped ?? 0;
    if (succ > 0 && fail === 0 && skip === 0) {
      return `Bulk uploaded and registered ${succ} candidate${succ === 1 ? '' : 's'} successfully.`;
    }
    if (succ > 0) {
      return `Bulk upload processed: ${succ} succeeded, ${fail} failed${skip > 0 ? `, ${skip} skipped` : ''}.`;
    }
    return `Bulk upload failed: ${fail} failed${skip > 0 ? `, ${skip} skipped` : ''}.`;
  }

  if (act === 'registration.create') {
    const code = details.institution_issued_code || details.candidate_code || details.provisional_candidate_code;
    return code
      ? `Created candidate registration with code ${code}.`
      : 'Created individual candidate registration.';
  }

  // Batch / multi-candidate actions
  const isMultiRegAction =
    act.includes('batch_') ||
    details.accepted_count !== undefined ||
    details.rejected_count !== undefined ||
    Array.isArray(details.ids) ||
    Array.isArray(details.registration_ids);

  if (isMultiRegAction) {
    const succ =
      details.accepted_count ??
      details.total ??
      (Array.isArray(details.ids)
        ? details.ids.length
        : Array.isArray(details.registration_ids)
          ? details.registration_ids.length
          : 0);
    const fail = details.rejected_count ?? details.failed ?? 0;
    const failSuffix = fail > 0 ? ` (${fail} failed)` : '';

    const actionKey = act.replace(/^registration\./, '').replace(/^batch_/, '');

    const verbs: Record<string, { active: string; passive: string }> = {
      reject: { active: 'Rejected', passive: 'rejected' },
      approve: { active: 'Approved', passive: 'approved' },
      withdraw: { active: 'Withdrew', passive: 'withdrawn' },
      delete: { active: 'Deleted', passive: 'deleted' },
      lock: { active: 'Locked', passive: 'locked' },
      unlock: { active: 'Unlocked', passive: 'unlocked' },
    };

    const verbInfo = verbs[actionKey] || { active: 'Updated', passive: 'updated' };

    if (succ === 0) {
      return `No candidate registrations were ${verbInfo.passive}${failSuffix}.`;
    }
    return `${verbInfo.active} ${succ} candidate registration${succ === 1 ? '' : 's'}${failSuffix}.`;
  }

  if (act === 'registration.approve') {
    return 'Approved candidate registration.';
  }
  if (act === 'registration.reject') {
    return details.reason
      ? `Rejected candidate registration. Reason: ${details.reason}.`
      : 'Rejected candidate registration.';
  }
  if (act === 'registration.withdraw') {
    return details.reason
      ? `Withdrew candidate registration. Reason: ${details.reason}.`
      : 'Withdrew candidate registration.';
  }
  if (act === 'registration.lock') {
    return 'Locked candidate registration.';
  }
  if (act === 'registration.unlock') {
    return 'Unlocked candidate registration.';
  }
  if (act === 'registration.delete') {
    return 'Deleted candidate registration.';
  }

  if (act === 'candidate.update') {
    const parts: string[] = [];
    if (details.email) parts.push(`email (${details.email})`);
    if (details.phone) parts.push(`phone (${details.phone})`);
    if (details.residential_address) parts.push('residential address');
    if (details.subject_combination_id) parts.push('subject combination');
    if (details.date_of_birth) parts.push('date of birth');
    if (details.state_of_origin) parts.push('state of origin');
    if (details.lga) parts.push('LGA');
    if (details.next_of_kin) parts.push('next of kin');
    if (parts.length > 0) {
      return `Updated candidate details: ${parts.join(', ')}.`;
    }
    return 'Updated candidate personal information.';
  }

  // 4. Document review actions
  if (act === 'document.review_accept') {
    const docType = details.document_type || details.type || details.name;
    return `Accepted candidate document${docType ? ` (${docType})` : ''}.`;
  }
  if (act === 'document.review_reject') {
    const docType = details.document_type || details.type || details.name;
    return details.reason
      ? `Rejected candidate document${docType ? ` (${docType})` : ''}. Reason: ${details.reason}.`
      : `Rejected candidate document${docType ? ` (${docType})` : ''}.`;
  }

  // 5. Results release actions
  if (act.includes('results.release_to_institutions')) {
    const sessionYear = details.academic_year || row?.academic_year;
    return sessionYear
      ? `Released examination results to institutions for session ${sessionYear}.`
      : 'Released examination results to institutions.';
  }
  if (act.includes('results.release_to_students')) {
    const count = details.released_count;
    if (count !== undefined) {
      return `Released examination results to ${count} candidate${count === 1 ? '' : 's'}.`;
    }
    return 'Released examination results to candidates.';
  }

  // 6. Catalog actions (institutions, subject combinations, documents)
  if (act === 'catalog.university_create') {
    const name = details.name || row?.university_name;
    const code = details.code || row?.university_code;
    if (name && code) return `Created institution ${name} (${code}).`;
    if (name) return `Created institution ${name}.`;
    return 'Created new institution.';
  }
  if (act === 'catalog.university_update') {
    const name = details.name || row?.university_name;
    return name ? `Updated institution details for ${name}.` : 'Updated institution details.';
  }
  if (act.includes('university_activate') || act === 'catalog.activate') {
    const name = details.name || row?.university_name;
    return `Activated institution${name ? ` ${name}` : ''}.`;
  }
  if (act.includes('university_deactivate') || act === 'catalog.deactivate') {
    const name = details.name || row?.university_name;
    return `Deactivated institution${name ? ` ${name}` : ''}.`;
  }
  if (act.includes('subject_combination_create')) {
    const name = details.name || details.title || details.code;
    return `Created subject combination${name ? ` "${name}"` : ''}.`;
  }
  if (act.includes('subject_combination_update')) {
    const name = details.name || details.title || details.code;
    return `Updated subject combination${name ? ` "${name}"` : ''}.`;
  }

  // 7. Finance actions
  if (act.includes('upload-receipt') || act.includes('upload_receipt')) {
    const amt = details.amount ? Number(details.amount).toLocaleString() : null;
    const item = details.payment_item_id
      ? String(details.payment_item_id).replace(/^(fee_|payment_)/, '').replace(/_/g, ' ')
      : null;
    if (amt && item) return `Uploaded payment receipt of ₦${amt} for ${item}.`;
    if (amt) return `Uploaded payment receipt of ₦${amt}.`;
    return 'Uploaded payment receipt.';
  }
  if (act.includes('finance.confirm')) {
    return 'Confirmed payment receipt.';
  }

  // 8. User & role actions
  if (act === 'user.create_with_university' || act === 'user.create') {
    const email = details.email;
    const role = details.role || details.role_name;
    if (email && role) return `Created user account for ${email} with role "${role}".`;
    if (email) return `Created user account for ${email}.`;
    return 'Created user account.';
  }
  if (act === 'user.roles_update') {
    const roles = Array.isArray(details.roles) ? details.roles.join(', ') : details.role;
    return roles ? `Updated user roles to ${roles}.` : 'Updated user roles.';
  }
  if (act.startsWith('role.')) {
    const name = details.name || details.display_name;
    if (act.includes('create')) return `Created role${name ? ` "${name}"` : ''}.`;
    if (act.includes('update')) return `Updated role${name ? ` "${name}"` : ''}.`;
    if (act.includes('delete')) return `Deleted role${name ? ` "${name}"` : ''}.`;
    if (act.includes('permission_attach')) return `Attached permission${details.permission ? ` "${details.permission}"` : ''} to role.`;
    if (act.includes('permission_detach')) return `Detached permission${details.permission ? ` "${details.permission}"` : ''} from role.`;
  }

  // 9. Generic properties fallback
  if (details.summary) return String(details.summary).endsWith('.') ? String(details.summary) : `${details.summary}.`;
  if (details.reason) return `Reason: ${details.reason}.`;
  if (details.academic_year) return `Academic year: ${details.academic_year}.`;
  if (details.diff && typeof details.diff === 'object') {
    const diffStr = Object.entries(details.diff)
      .map(([k, v]: [string, any]) => `"${k}" changed from "${v.before || ''}" to "${v.after || ''}"`)
      .join(', ');
    return `Changed ${diffStr}.`;
  }
  if (details.succeeded_count !== undefined) {
    return `${details.succeeded_count} succeeded, ${details.failed_count || 0} failed.`;
  }
  if (details.role) {
    return `Role: ${details.role}${details.university_name ? ` (${details.university_name})` : ''}.`;
  }

  // Filter out request metadata, security/credentials, and raw IDs
  const ignoredKeys = new Set([
    '_request', 'request_id', 'id', 'session_id', 'university_id', 'user_id',
    'actor_user_id', 'jupeb_university_id', 'subject_combination_id', 'documents',
    'nin', 'bvn', 'idempotency_key', 'idempotencykey', 'method', 'path',
    'status_code', 'duration_ms', 'password', 'token', 'access_token',
    'refresh_token', 'otp', 'pin', 'cvv', 'secret', 'authorization',
    'hash', 'code_hash', 'salt', 'fingerprint_data', 'face_template',
  ]);
  const entries = Object.entries(details).filter(
    ([k, v]) =>
      !ignoredKeys.has(k.toLowerCase()) &&
      v !== null &&
      v !== undefined &&
      v !== '' &&
      v !== '[REDACTED]' &&
      typeof v !== 'object',
  );
  if (entries.length) {
    const formatted = entries
      .slice(0, 3)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join(', ');
    return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}.`;
  }

  const actionTitle = formatAuditActionTitle(act);
  return actionTitle && actionTitle !== 'Action' ? `${actionTitle}.` : '';
}

// ── Scope types ─────────────────────────────────────────────────────────────
interface FullScope {
  mode: 'full';
}
interface AdminScope {
  mode: 'admin';
  actorId: string;
  allowedUserIds: string[];
}
interface InstitutionScope {
  mode: 'institution';
  universityId: string;
  actorId: string;
}
interface SelfScope {
  mode: 'self';
  actorId: string;
}
type RbacScope = FullScope | AdminScope | InstitutionScope | SelfScope;

export interface AuditLogOptions {
  actorUserId: string;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  details?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  universityId?: string | null;
  /**
   * Legacy shorthand: the old Express call sites passed the raw request and let the
   * service pull IP/user-agent off it. Accepted here so those call shapes keep working.
   */
  req?: any;
}

/** Fold the legacy `req` shorthand into the explicit ip/user-agent fields. */
function normalizeAuditLogOptions(opts: AuditLogOptions) {
  const { req, ...rest } = opts || ({} as AuditLogOptions);
  return {
    ...rest,
    ipAddress: rest.ipAddress ?? req?.ip ?? req?.socket?.remoteAddress ?? null,
    userAgent: rest.userAgent ?? req?.get?.('user-agent') ?? req?.headers?.['user-agent'] ?? null,
  };
}

export interface AuditListFilters {
  admin_user_id?: string;
  actor_user_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  university_id?: string;
  jupeb_university_id?: string;
  start_date?: string;
  end_date?: string;
  role?: string;
  role_id?: string;
  q?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AdminAuditService {
  private readonly logger;

  constructor(
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
    private readonly auditWriter: AuditWriterService,
  ) {
    this.logger = this.loggerFactory.create(AdminAuditService.name);
  }

  // ── Resolve scope of users visible to an admin ───────────────────────────
  /**
   * Central admins (including the registrar and super_admin) share visibility across all
   * central administrators so any admin with permission can see the same audit logs.
   */
  private async resolveAdminScopeUsers(actorUserId: string): Promise<string[]> {
    const allowed = new Set<string>([actorUserId]);

    // All central admins, registrars, super_admins, and users with central admin roles
    const centralAdmins: { user_id: string }[] = await this.dataSource.query(
      `SELECT DISTINCT ur.user_id
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       LEFT JOIN profiles p ON p.user_id = ur.user_id
       WHERE r.name NOT IN ('institution_admin', 'student', 'user')
         AND r.owner_jupeb_university_id IS NULL
         AND p.jupeb_university_id IS NULL
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
    );
    centralAdmins.forEach((r) => allowed.add(r.user_id));

    // Also include users who have explicit audit.view / activity_logs.view permissions
    const permAdmins: { user_id: string }[] = await this.dataSource.query(
      `SELECT DISTINCT up.user_id
       FROM user_permissions up
       JOIN permissions p ON p.id = up.permission_id
       LEFT JOIN profiles pr ON pr.user_id = up.user_id
       WHERE p.name IN ('audit.view', 'activity_logs.view', 'system.admin')
         AND up.granted = true
         AND pr.jupeb_university_id IS NULL
         AND (up.expires_at IS NULL OR up.expires_at > NOW())`,
    );
    permAdmins.forEach((r) => allowed.add(r.user_id));

    return Array.from(allowed);
  }

  // ── Resolve RBAC scope for the calling user ──────────────────────────────
  private async resolveScope(userId: string): Promise<RbacScope> {
    const rolesRows: { name: string }[] = await this.dataSource.query(
      `SELECT r.name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [userId],
    );
    const roles = rolesRows.map((r) => r.name);

    const profileRows: { jupeb_university_id: string | null }[] = await this.dataSource.query(
      `SELECT jupeb_university_id FROM profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const universityId = profileRows[0]?.jupeb_university_id || null;

    if (universityId || roles.includes('institution_admin')) {
      return { mode: 'institution', universityId: universityId || '', actorId: userId };
    }

    const isCentralAdminRole = roles.some((r) =>
      ['super_admin', 'registrar', 'admin', 'jupeb_admin', 'financial_admin'].includes(r),
    );

    let hasAuditAccess = isCentralAdminRole;
    if (!hasAuditAccess) {
      const permCheck = await this.dataSource.query(
        `SELECT EXISTS (
          SELECT 1 FROM user_permissions up
          JOIN permissions p ON up.permission_id = p.id
          WHERE up.user_id = $1
            AND p.name IN ('audit.view', 'activity_logs.view', 'system.admin')
            AND up.granted = true
            AND (up.expires_at IS NULL OR up.expires_at > NOW())
          UNION
          SELECT 1 FROM user_roles ur
          JOIN role_permissions rp ON ur.role_id = rp.role_id
          JOIN permissions p ON rp.permission_id = p.id
          WHERE ur.user_id = $1
            AND p.name IN ('audit.view', 'activity_logs.view', 'system.admin')
            AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ) AS has_perm`,
        [userId],
      );
      hasAuditAccess = Boolean(permCheck[0]?.has_perm);
    }

    if (hasAuditAccess) {
      const allowedUserIds = await this.resolveAdminScopeUsers(userId);
      return { mode: 'admin', actorId: userId, allowedUserIds };
    }

    return { mode: 'self', actorId: userId };
  }

  // ── Log an audit event ───────────────────────────────────────────────────
  /**
   * Durable write: resolves once the row is committed. Delegates to the shared
   * {@link AuditWriterService}, which also owns the batched hot path used by
   * `AuditInterceptor`.
   */
  async log(opts: AuditLogOptions): Promise<void> {
    await this.auditWriter.log(normalizeAuditLogOptions(opts));
  }

  /**
   * Static compatibility shim for callers that never went through Nest DI — the legacy
   * Express call sites and `src/tests/audit-trail.api.test.js`. Forwards to the writer
   * instance registered when the module boots.
   */
  static async log(opts: AuditLogOptions): Promise<void> {
    await writeAuditLog(normalizeAuditLogOptions(opts));
  }

  // ── List audit logs with pagination and RBAC scoping ─────────────────────
  async list(filters: AuditListFilters, actorUserId?: string | null) {
    const scope = actorUserId
      ? await this.resolveScope(actorUserId)
      : ({ mode: 'full' } as FullScope);

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    // RBAC scoping
    if (scope.mode === 'institution') {
      conditions.push(
        `(a.jupeb_university_id = $${paramIdx} OR a.admin_user_id = $${paramIdx + 1})`,
      );
      params.push(scope.universityId, scope.actorId);
      paramIdx += 2;
    } else if (scope.mode === 'admin') {
      const explicitUni =
        filters.university_id ||
        filters.jupeb_university_id ||
        (filters as any).universityId;
      if (explicitUni) {
        conditions.push(`a.jupeb_university_id = $${paramIdx++}`);
        params.push(explicitUni);
      } else {
        conditions.push(
          `(a.admin_user_id = ANY($${paramIdx}::uuid[]) OR a.admin_user_id IS NULL OR (a.resource_type IN ('user', 'users') AND a.resource_id = ANY($${paramIdx + 1}::text[])))`,
        );
        params.push(scope.allowedUserIds, scope.allowedUserIds.map((id) => String(id)));
        paramIdx += 2;
      }
    } else if (scope.mode === 'self') {
      conditions.push(
        `(a.admin_user_id = $${paramIdx} OR (a.resource_type IN ('user', 'users') AND a.resource_id = $${paramIdx + 1}))`,
      );
      params.push(scope.actorId, String(scope.actorId));
      paramIdx += 2;
    } else {
      const explicitUni =
        filters.university_id ||
        filters.jupeb_university_id ||
        (filters as any).universityId;
      if (scope.mode === 'full' && explicitUni) {
        conditions.push(`a.jupeb_university_id = $${paramIdx++}`);
        params.push(explicitUni);
      }
    }

    const targetUser =
      filters.actor_user_id ||
      filters.admin_user_id ||
      (filters as any).user_id ||
      (filters as any).userId ||
      (filters as any).actorUserId ||
      (filters as any).adminUserId;
    if (targetUser) {
      conditions.push(`a.admin_user_id = $${paramIdx++}`);
      params.push(targetUser);
    }

    if (filters.action) {
      const act = filters.action.trim();
      if (act.includes(',')) {
        const actList = act.split(',').map((x) => x.trim()).filter(Boolean);
        conditions.push(`a.action = ANY($${paramIdx++})`);
        params.push(actList);
      } else {
        conditions.push(`a.action ILIKE $${paramIdx++}`);
        params.push(`%${act}%`);
      }
    }

    const resourceType =
      filters.resource_type ||
      (filters as any).resourceType ||
      (filters as any).resource ||
      (filters as any).module;
    if (resourceType) {
      conditions.push(`a.resource_type ILIKE $${paramIdx++}`);
      params.push(`%${resourceType.trim()}%`);
    }

    const resourceId = filters.resource_id || (filters as any).resourceId;
    if (resourceId) {
      conditions.push(`a.resource_id = $${paramIdx++}`);
      params.push(String(resourceId).trim());
    }

    const startDate =
      filters.start_date ||
      (filters as any).startDate ||
      (filters as any).from ||
      (filters as any).from_date;
    if (startDate) {
      conditions.push(`a.created_at >= $${paramIdx++}`);
      params.push(startDate);
    }

    const endDate =
      filters.end_date ||
      (filters as any).endDate ||
      (filters as any).to ||
      (filters as any).to_date;
    if (endDate) {
      conditions.push(`a.created_at <= $${paramIdx++}`);
      params.push(endDate);
    }

    const explicitRole =
      filters.role ||
      (filters as any).actor_role ||
      (filters as any).actorRole ||
      (filters as any).user_role ||
      (filters as any).userRole;
    if (explicitRole) {
      const roleStr = explicitRole.trim();
      const roleLower = roleStr.toLowerCase();
      const isRoleAdmin =
        roleLower.includes('admin') ||
        roleLower.includes('administrator');

      conditions.push(`EXISTS (
        SELECT 1 FROM user_roles ur_r
        JOIN roles r_r ON ur_r.role_id = r_r.id
        WHERE ur_r.user_id = a.admin_user_id
          AND (
            r_r.name ILIKE $${paramIdx}
            OR r_r.display_name ILIKE $${paramIdx}
            OR REPLACE(r_r.name, '_', ' ') ILIKE $${paramIdx}
            OR REPLACE(r_r.display_name, '_', ' ') ILIKE $${paramIdx}
            OR $${paramIdx + 1} ILIKE ('%' || r_r.name || '%')
            OR $${paramIdx + 1} ILIKE ('%' || REPLACE(r_r.name, '_', ' ') || '%')
            OR $${paramIdx + 1} ILIKE ('%' || COALESCE(r_r.display_name, '') || '%')
            ${isRoleAdmin ? "OR r_r.name IN ('admin', 'super_admin', 'institution_admin', 'financial_admin')" : ''}
          )
          AND (ur_r.expires_at IS NULL OR ur_r.expires_at > NOW())
      )`);
      params.push(`%${roleStr}%`, roleLower);
      paramIdx += 2;
    }

    if (filters.role_id || (filters as any).roleId) {
      const targetRoleId = filters.role_id || (filters as any).roleId;
      conditions.push(`EXISTS (
        SELECT 1 FROM user_roles ur_rid
        WHERE ur_rid.user_id = a.admin_user_id
          AND ur_rid.role_id::text = $${paramIdx++}
          AND (ur_rid.expires_at IS NULL OR ur_rid.expires_at > NOW())
      )`);
      params.push(String(targetRoleId).trim());
    }

    const rawSearch = (
      filters.q ??
      (filters as any).query ??
      (filters as any).search ??
      (filters as any).keyword ??
      (filters as any).filter ??
      ''
    ).trim();

    if (rawSearch) {
      const pattern = `%${rawSearch}%`;
      const searchLower = rawSearch.toLowerCase();

      // Common verb synonym and stem mappings
      const VERB_SYNONYMS: Record<string, string[]> = {
        create: ['create', 'creat', 'created', 'creating', 'creation', 'new', 'add', 'added'],
        created: ['create', 'creat', 'created', 'creating', 'creation', 'new', 'add', 'added'],
        creating: ['create', 'creat', 'created', 'creating', 'creation', 'new', 'add', 'added'],
        creation: ['create', 'creat', 'created', 'creating', 'creation', 'new', 'add', 'added'],
        update: ['update', 'updat', 'updated', 'updating', 'edit', 'edited', 'modify', 'modified', 'change', 'changed'],
        updated: ['update', 'updat', 'updated', 'updating', 'edit', 'edited', 'modify', 'modified', 'change', 'changed'],
        updating: ['update', 'updat', 'updated', 'updating', 'edit', 'edited', 'modify', 'modified', 'change', 'changed'],
        delete: ['delete', 'delet', 'deleted', 'deleting', 'deletion', 'remove', 'removed'],
        deleted: ['delete', 'delet', 'deleted', 'deleting', 'deletion', 'remove', 'removed'],
        deleting: ['delete', 'delet', 'deleted', 'deleting', 'deletion', 'remove', 'removed'],
        approve: ['approve', 'approv', 'approved', 'approving', 'approval'],
        approved: ['approve', 'approv', 'approved', 'approving', 'approval'],
        approving: ['approve', 'approv', 'approved', 'approving', 'approval'],
        reject: ['reject', 'rejected', 'rejecting', 'rejection'],
        rejected: ['reject', 'rejected', 'rejecting', 'rejection'],
        rejecting: ['reject', 'rejected', 'rejecting', 'rejection'],
        withdraw: ['withdraw', 'withdrew', 'withdrawn', 'withdrawing', 'withdrawal'],
        withdrawn: ['withdraw', 'withdrew', 'withdrawn', 'withdrawing', 'withdrawal'],
        withdrew: ['withdraw', 'withdrew', 'withdrawn', 'withdrawing', 'withdrawal'],
        withdrawing: ['withdraw', 'withdrew', 'withdrawn', 'withdrawing', 'withdrawal'],
        lock: ['lock', 'locked', 'locking'],
        locked: ['lock', 'locked', 'locking'],
        unlock: ['unlock', 'unlocked', 'unlocking'],
        unlocked: ['unlock', 'unlocked', 'unlocking'],
        open: ['open', 'opened', 'opening'],
        opened: ['open', 'opened', 'opening'],
        close: ['close', 'closed', 'closing'],
        closed: ['close', 'closed', 'closing'],
        reopen: ['reopen', 'reopened', 'reopening'],
        reopened: ['reopen', 'reopened', 'reopening'],
        upload: ['upload', 'uploaded', 'uploading', 'bulk'],
        uploaded: ['upload', 'uploaded', 'uploading', 'bulk'],
        release: ['release', 'released', 'releasing'],
        released: ['release', 'released', 'releasing'],
        activate: ['activate', 'activated', 'activating', 'activation'],
        activated: ['activate', 'activated', 'activating', 'activation'],
        deactivate: ['deactivate', 'deactivated', 'deactivating', 'deactivation'],
        deactivated: ['deactivate', 'deactivated', 'deactivating', 'deactivation'],
        generate: ['generate', 'generated', 'generating', 'finalize'],
        generated: ['generate', 'generated', 'generating', 'finalize'],
        accept: ['accept', 'accepted', 'accepting'],
        accepted: ['accept', 'accepted', 'accepting'],
      };

      // Collect all stems and synonyms related to searchLower
      const relatedTerms = new Set<string>([searchLower]);
      for (const [key, syns] of Object.entries(VERB_SYNONYMS)) {
        if (searchLower.includes(key) || syns.some((s) => searchLower.includes(s))) {
          syns.forEach((s) => relatedTerms.add(s));
          relatedTerms.add(key);
        }
      }

      // Add standard suffix stems
      if (searchLower.endsWith('ed')) {
        relatedTerms.add(searchLower.slice(0, -1)); // updated -> update
        relatedTerms.add(searchLower.slice(0, -2)); // created -> creat
      }
      if (searchLower.endsWith('ing')) {
        relatedTerms.add(searchLower.slice(0, -3));
      }
      if (searchLower.endsWith('s')) {
        relatedTerms.add(searchLower.slice(0, -1));
      }

      // Find any known audit actions whose key or display title matches a related term
      const matchingActionKeys = Object.entries(AUDIT_ACTION_TITLES)
        .filter(([key, display]) => {
          const keyLower = key.toLowerCase();
          const dispLower = display.toLowerCase();
          return Array.from(relatedTerms).some(
            (term) =>
              term.length >= 3 &&
              (keyLower.includes(term) || dispLower.includes(term)),
          );
        })
        .map(([key]) => key);

      const searchClauses: string[] = [
        `a.action ILIKE $${paramIdx}`,
        `REPLACE(REPLACE(a.action, '.', ' '), '_', ' ') ILIKE $${paramIdx}`,
        `a.resource_type ILIKE $${paramIdx}`,
        `a.resource_id ILIKE $${paramIdx}`,
        `u.email ILIKE $${paramIdx}`,
        `p.first_name ILIKE $${paramIdx}`,
        `p.last_name ILIKE $${paramIdx}`,
        `p.display_name ILIKE $${paramIdx}`,
        `(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE $${paramIdx}`,
        `(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')) ILIKE $${paramIdx}`,
        `ju.name ILIKE $${paramIdx}`,
        `ju.code ILIKE $${paramIdx}`,
        `ju.short_name ILIKE $${paramIdx}`,
        `COALESCE(a.details::text, '') ILIKE $${paramIdx}`,
      ];

      params.push(pattern);
      paramIdx += 1;

      // Add verb synonym/stem search clauses for action and resource_type
      const validStems = Array.from(relatedTerms).filter(
        (s) => s.length >= 3 && s !== searchLower,
      );
      for (const stem of validStems) {
        searchClauses.push(`a.action ILIKE $${paramIdx}`);
        searchClauses.push(
          `REPLACE(REPLACE(a.action, '.', ' '), '_', ' ') ILIKE $${paramIdx}`,
        );
        searchClauses.push(`a.resource_type ILIKE $${paramIdx}`);
        params.push(`%${stem}%`);
        paramIdx += 1;
      }

      // Add matching action map keys
      if (matchingActionKeys.length > 0) {
        searchClauses.push(`a.action = ANY($${paramIdx})`);
        params.push(matchingActionKeys);
        paramIdx += 1;
      }

      // Role matching patterns (handles "Administrator", "Super Admin", "admin", "Registrar", etc.)
      const words = searchLower.split(/\s+/).filter((w) => w.length >= 3);
      const rolePatterns: string[] = [];
      if (searchLower.includes('admin') || searchLower.includes('administrator')) {
        rolePatterns.push('%admin%', '%administrator%');
      }
      if (searchLower.includes('super')) {
        rolePatterns.push('%super%');
      }
      if (searchLower.includes('registrar')) {
        rolePatterns.push('%registrar%');
      }
      if (searchLower.includes('institution')) {
        rolePatterns.push('%institution%');
      }
      if (searchLower.includes('officer')) {
        rolePatterns.push('%officer%');
      }
      if (searchLower.includes('director')) {
        rolePatterns.push('%director%');
      }
      if (searchLower.includes('coordinator')) {
        rolePatterns.push('%coordinator%');
      }
      if (searchLower.includes('finance') || searchLower.includes('financial')) {
        rolePatterns.push('%financ%');
      }
      words.forEach((w) => {
        if (!rolePatterns.includes(`%${w}%`)) {
          rolePatterns.push(`%${w}%`);
        }
      });

      searchClauses.push(`EXISTS (
        SELECT 1 FROM user_roles ur_s
        JOIN roles r_s ON ur_s.role_id = r_s.id
        WHERE ur_s.user_id = a.admin_user_id
          AND (
            r_s.name ILIKE $${paramIdx}
            OR r_s.display_name ILIKE $${paramIdx}
            OR REPLACE(r_s.name, '_', ' ') ILIKE $${paramIdx}
            OR REPLACE(COALESCE(r_s.display_name, ''), '_', ' ') ILIKE $${paramIdx}
            OR $${paramIdx + 1} ILIKE ('%' || r_s.name || '%')
            OR $${paramIdx + 1} ILIKE ('%' || REPLACE(r_s.name, '_', ' ') || '%')
            OR $${paramIdx + 1} ILIKE ('%' || COALESCE(r_s.display_name, '') || '%')
            OR $${paramIdx + 1} ILIKE ('%' || REPLACE(COALESCE(r_s.display_name, ''), '_', ' ') || '%')
            ${rolePatterns.length > 0 ? `OR r_s.name ILIKE ANY($${paramIdx + 2}) OR r_s.display_name ILIKE ANY($${paramIdx + 2}) OR REPLACE(r_s.name, '_', ' ') ILIKE ANY($${paramIdx + 2})` : ''}
          )
          AND (ur_s.expires_at IS NULL OR ur_s.expires_at > NOW())
      )`);

      params.push(pattern, searchLower);
      paramIdx += 2;
      if (rolePatterns.length > 0) {
        params.push(rolePatterns);
        paramIdx += 1;
      }

      conditions.push(`(${searchClauses.join(' OR ')})`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safePage = Math.max(1, Number(filters.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const offset = (safePage - 1) * safeLimit;

    const countResult = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM admin_audit_logs a
       LEFT JOIN users u ON u.id = a.admin_user_id
       LEFT JOIN profiles p ON p.user_id = a.admin_user_id
       LEFT JOIN jupeb_universities ju ON ju.id = a.jupeb_university_id
       ${whereClause}`,
      params,
    );
    const total = countResult[0]?.count || 0;

    const dataResult = await this.dataSource.query(
      `SELECT
        a.id,
        a.admin_user_id AS actor_user_id,
        a.action,
        a.resource_type,
        a.resource_id,
        a.details,
        a.ip_address,
        a.user_agent,
        a.jupeb_university_id,
        a.created_at,
        u.email AS actor_email,
        p.first_name AS actor_first_name,
        p.last_name AS actor_last_name,
        p.display_name AS actor_display_name,
        COALESCE(
          NULLIF(TRIM(CONCAT(p.first_name, ' ', p.last_name)), ''),
          p.display_name, u.email, 'User'
        ) AS actor_name,
        COALESCE(
          (SELECT COALESCE(r.display_name, r.name)
           FROM user_roles ur JOIN roles r ON ur.role_id = r.id
           WHERE ur.user_id = a.admin_user_id
             AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
           ORDER BY r.is_system DESC, r.name ASC LIMIT 1),
          'User'
        ) AS actor_role,
        COALESCE(
          (SELECT array_agg(DISTINCT r.name ORDER BY r.name)
           FROM user_roles ur JOIN roles r ON ur.role_id = r.id
           WHERE ur.user_id = a.admin_user_id
             AND (ur.expires_at IS NULL OR ur.expires_at > NOW())),
          ARRAY[]::text[]
        ) AS actor_roles,
        COALESCE(
          (SELECT array_agg(DISTINCT COALESCE(r.display_name, r.name) ORDER BY COALESCE(r.display_name, r.name))
           FROM user_roles ur JOIN roles r ON ur.role_id = r.id
           WHERE ur.user_id = a.admin_user_id
             AND (ur.expires_at IS NULL OR ur.expires_at > NOW())),
          ARRAY[]::text[]
        ) AS actor_roles_display,
        ju.code AS university_code,
        ju.short_name AS university_short_name,
        ju.name AS university_name
      FROM admin_audit_logs a
      LEFT JOIN users u ON u.id = a.admin_user_id
      LEFT JOIN profiles p ON p.user_id = a.admin_user_id
      LEFT JOIN jupeb_universities ju ON ju.id = a.jupeb_university_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, safeLimit, offset],
    );

    const logs = dataResult.map((row: any) => {
      const sanitizedDetails = row.details ? redactSensitive(row.details) : row.details;
      const detailsSummary = formatDetailsSummary(row.details, row.action, row);
      return {
        ...row,
        details: sanitizedDetails,
        action_display: formatAuditActionTitle(row.action),
        details_display: detailsSummary,
        detail_display: detailsSummary,
      };
    });

    return { logs, total, page: safePage, limit: safeLimit };
  }

  // ── CSV export ───────────────────────────────────────────────────────────
  async exportCsv(
    filters: AuditListFilters,
    actorUserId?: string | null,
  ): Promise<string> {
    const { logs } = await this.list(
      { ...filters, page: 1, limit: 1000 },
      actorUserId,
    );

    const headers = [
      'S/N',
      'TIME STAMP',
      'ROLE',
      'USER',
      'EMAIL',
      'ACTION',
      'DETAILS',
    ];

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = logs.map((log: any, index: number) => {
      const ts = log.created_at
        ? new Date(log.created_at)
            .toISOString()
            .replace('T', ' ')
            .slice(0, 19)
        : '';
      return [
        index + 1,
        escapeCsv(ts),
        escapeCsv(log.actor_role || 'User'),
        escapeCsv(log.actor_name || ''),
        escapeCsv(log.actor_email || ''),
        escapeCsv(log.action_display || log.action || ''),
        escapeCsv(
          log.details_display ||
            log.detail_display ||
            (log.details ? JSON.stringify(log.details) : ''),
        ),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}
