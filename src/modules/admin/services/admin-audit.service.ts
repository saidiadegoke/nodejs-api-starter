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

// Action titles live in the shared taxonomy so the write side (AuditInterceptor / @Audit)
// and this read side cannot drift apart.

function formatDetailsSummary(details: any): string {
  if (!details) return '';
  if (typeof details === 'string') return details;
  if (details.summary) return String(details.summary);
  if (details.reason) return `Reason: ${details.reason}`;
  if (details.academic_year) return `Academic year: ${details.academic_year}`;
  if (details.diff && typeof details.diff === 'object') {
    return Object.entries(details.diff)
      .map(([, v]: [string, any]) => `"${v.before || ''}" changed to "${v.after || ''}"`)
      .join(', ');
  }
  if (details.succeeded_count !== undefined) {
    return `${details.succeeded_count} succeeded, ${details.failed_count || 0} failed`;
  }
  if (details.role) {
    return `Role: ${details.role}${details.university_name ? ` (${details.university_name})` : ''}`;
  }
  const entries = Object.entries(details).filter(
    ([, v]) => v !== null && v !== undefined && typeof v !== 'object',
  );
  if (entries.length) {
    return entries
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  return JSON.stringify(details);
}

// ── Scope types ─────────────────────────────────────────────────────────────
interface FullScope {
  mode: 'full';
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
type RbacScope = FullScope | InstitutionScope | SelfScope;

const FULL_ACCESS_ROLES = new Set(['admin', 'super_admin', 'registrar']);

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

    if (roles.some((r) => FULL_ACCESS_ROLES.has(r))) {
      return { mode: 'full' };
    }

    const profileRows: { jupeb_university_id: string | null }[] = await this.dataSource.query(
      `SELECT jupeb_university_id FROM profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const universityId = profileRows[0]?.jupeb_university_id || null;

    if (universityId) {
      return { mode: 'institution', universityId, actorId: userId };
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
    } else if (scope.mode === 'self') {
      conditions.push(
        `(a.admin_user_id = $${paramIdx} OR (a.resource_type = 'users' AND a.resource_id = $${paramIdx + 1}))`,
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

    const logs = dataResult.map((row: any) => ({
      ...row,
      action_display: formatAuditActionTitle(row.action),
      details_display: formatDetailsSummary(row.details),
    }));

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
            (log.details ? JSON.stringify(log.details) : ''),
        ),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}
