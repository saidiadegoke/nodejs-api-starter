const pool = require('../../../db/pool');
const { resolveAdminRbacScope } = require('../utils/admin-rbac-scope');
const { getProfileJupebUniversityId } = require('../../jupeb/utils/institution-scope');

function formatActionTitle(action) {
  if (!action) return 'Action';
  const ACTION_MAP = {
    'session.create': 'Created new session',
    'session.update': 'Updated session',
    'session.open': 'Opened session',
    'session.close': 'Closed session',
    'session.reopen': 'Reopened session',
    'session.lock_registration': 'Locked Registration',
    'session.unlock_registration': 'Unlocked registration',
    'session.finalize_candidate_numbers': 'Generated candidate numbers',
    'catalog.university_create': 'Created new university',
    'catalog.university_update': 'Updated university',
    'catalog.university_activate': 'Activated university',
    'catalog.university_deactivate': 'Deactivated university',
    'catalog.subject_combination_create': 'Created new subjects combinations',
    'catalog.subject_combination_update': 'Updated subject combination',
    'catalog.subject_combination_delete': 'Deleted subject combination',
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
    'platform_setting.upsert': 'Updated platform setting',
  };
  if (ACTION_MAP[action]) return ACTION_MAP[action];
  return action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDetailsSummary(details) {
  if (!details) return '';
  if (typeof details === 'string') return details;
  if (details.summary) return String(details.summary);
  if (details.reason) return `Reason: ${details.reason}`;
  if (details.academic_year) return `Academic year: ${details.academic_year}`;
  if (details.diff && typeof details.diff === 'object') {
    return Object.entries(details.diff)
      .map(([k, v]) => `"${v.before || ''}" changed to "${v.after || ''}"`)
      .join(', ');
  }
  if (details.succeeded_count !== undefined) {
    return `${details.succeeded_count} succeeded, ${details.failed_count || 0} failed`;
  }
  if (details.role) {
    return `Role: ${details.role}${details.university_name ? ` (${details.university_name})` : ''}`;
  }
  const entries = Object.entries(details).filter(
    ([k, v]) => v !== null && v !== undefined && typeof v !== 'object'
  );
  if (entries.length) {
    return entries.slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ');
  }
  return JSON.stringify(details);
}

/**
 * Admin / Institution Audit Log Service.
 * Records mutating actions performed by users across registrar, admin, and institution portals.
 */
class AdminAuditService {
  /**
   * Log an audit event.
   * Can be called with positional arguments or an options object.
   */
  static async log(
    adminUserIdOrOptions,
    action = null,
    resourceType = null,
    resourceId = null,
    details = null,
    req = null,
    universityId = null
  ) {
    let actorUserId;
    let act;
    let resType;
    let resId;
    let det;
    let request;
    let uniId;

    if (adminUserIdOrOptions && typeof adminUserIdOrOptions === 'object' && !Array.isArray(adminUserIdOrOptions) && action === null) {
      actorUserId = adminUserIdOrOptions.actorUserId || adminUserIdOrOptions.adminUserId || adminUserIdOrOptions.userId;
      act = adminUserIdOrOptions.action;
      resType = adminUserIdOrOptions.resourceType || adminUserIdOrOptions.resource_type || null;
      resId = adminUserIdOrOptions.resourceId || adminUserIdOrOptions.resource_id ? String(adminUserIdOrOptions.resourceId || adminUserIdOrOptions.resource_id) : null;
      det = adminUserIdOrOptions.details || null;
      request = adminUserIdOrOptions.req || null;
      uniId = adminUserIdOrOptions.universityId || adminUserIdOrOptions.university_id || adminUserIdOrOptions.jupebUniversityId || adminUserIdOrOptions.jupeb_university_id || null;
    } else {
      actorUserId = adminUserIdOrOptions;
      act = action;
      resType = resourceType;
      resId = resourceId !== null && resourceId !== undefined ? String(resourceId) : null;
      det = details;
      request = req;
      uniId = universityId;
    }

    if (!actorUserId || !act) {
      return;
    }

    const ipAddress = request ? (request.ip || request.connection?.remoteAddress || null) : null;
    const userAgent = request ? (request.get?.('user-agent') || null) : null;

    try {
      if (!uniId && actorUserId) {
        uniId = await getProfileJupebUniversityId(actorUserId).catch(() => null);
      }

      await pool.query(
        `INSERT INTO admin_audit_logs (
           admin_user_id,
           action,
           resource_type,
           resource_id,
           details,
           ip_address,
           user_agent,
           jupeb_university_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          actorUserId,
          act,
          resType,
          resId,
          det ? JSON.stringify(det) : null,
          ipAddress,
          userAgent,
          uniId,
        ]
      );
    } catch (err) {
      // Non-blocking: never crash the calling request on audit log insertion failure
      console.error('[AdminAuditService.log] Failed to write audit log:', err.message);
    }
  }

  /**
   * List audit logs with pagination, search filters, and RBAC scoping.
   */
  static async list(filters = {}, actorUserId = null) {
    const scope = actorUserId ? await resolveAdminRbacScope(actorUserId) : { mode: 'full' };
    const scopedUniversityId = scope.mode === 'institution' ? scope.universityId : null;

    const {
      admin_user_id,
      actor_user_id,
      action,
      resource_type,
      resource_id,
      university_id,
      jupeb_university_id,
      start_date,
      end_date,
      q,
      page = 1,
      limit = 20,
    } = filters;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    // Visibility Scoping:
    // - Registrar / Super Admin / Admin (mode: 'full'): See all audits across the system.
    // - Institution users (mode: 'institution'): See audits related to their institution OR actions performed by them.
    // - Others (mode: 'self'): See only audits related to themselves (performed by them or targeting their user record).
    if (scope.mode === 'institution') {
      conditions.push(`(a.jupeb_university_id = $${paramIdx} OR a.admin_user_id = $${paramIdx + 1})`);
      params.push(scopedUniversityId, actorUserId);
      paramIdx += 2;
    } else if (scope.mode === 'self') {
      conditions.push(`(a.admin_user_id = $${paramIdx} OR (a.resource_type = 'users' AND a.resource_id = $${paramIdx + 1}))`);
      params.push(actorUserId, String(actorUserId));
      paramIdx += 2;
    } else {
      // Full access (Registrar / Admin): Can optionally filter by specific university if requested
      const explicitUni = university_id || jupeb_university_id;
      if (explicitUni) {
        conditions.push(`a.jupeb_university_id = $${paramIdx++}`);
        params.push(explicitUni);
      }
    }

    const targetUser = actor_user_id || admin_user_id;
    if (targetUser) {
      conditions.push(`a.admin_user_id = $${paramIdx++}`);
      params.push(targetUser);
    }
    if (action) {
      conditions.push(`a.action = $${paramIdx++}`);
      params.push(action);
    }
    if (resource_type) {
      conditions.push(`a.resource_type = $${paramIdx++}`);
      params.push(resource_type);
    }
    if (resource_id) {
      conditions.push(`a.resource_id = $${paramIdx++}`);
      params.push(String(resource_id));
    }
    if (start_date) {
      conditions.push(`a.created_at >= $${paramIdx++}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`a.created_at <= $${paramIdx++}`);
      params.push(end_date);
    }
    if (q) {
      const pattern = `%${String(q).trim()}%`;
      conditions.push(`(
        a.action ILIKE $${paramIdx}
        OR a.resource_type ILIKE $${paramIdx}
        OR a.resource_id ILIKE $${paramIdx}
        OR u.email ILIKE $${paramIdx}
        OR p.first_name ILIKE $${paramIdx}
        OR p.last_name ILIKE $${paramIdx}
        OR p.display_name ILIKE $${paramIdx}
        OR ju.name ILIKE $${paramIdx}
        OR a.details::text ILIKE $${paramIdx}
        OR EXISTS (
          SELECT 1 FROM user_roles ur_s
          JOIN roles r_s ON ur_s.role_id = r_s.id
          WHERE ur_s.user_id = a.admin_user_id
            AND (r_s.name ILIKE $${paramIdx} OR r_s.display_name ILIKE $${paramIdx})
            AND (ur_s.expires_at IS NULL OR ur_s.expires_at > NOW())
        )
      )`);
      params.push(pattern);
      paramIdx += 1;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM admin_audit_logs a
      LEFT JOIN users u ON u.id = a.admin_user_id
      LEFT JOIN profiles p ON p.user_id = a.admin_user_id
      LEFT JOIN jupeb_universities ju ON ju.id = a.jupeb_university_id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = countResult.rows[0]?.count || 0;

    const dataQuery = `
      SELECT
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
          p.display_name,
          u.email,
          'User'
        ) AS actor_name,
        COALESCE(
          (
            SELECT COALESCE(r.display_name, r.name)
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = a.admin_user_id
              AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
            ORDER BY r.is_system DESC, r.name ASC
            LIMIT 1
          ),
          'User'
        ) AS actor_role,
        COALESCE(
          (
            SELECT array_agg(DISTINCT r.name ORDER BY r.name)
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = a.admin_user_id
              AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          ),
          ARRAY[]::text[]
        ) AS actor_roles,
        COALESCE(
          (
            SELECT array_agg(DISTINCT COALESCE(r.display_name, r.name) ORDER BY COALESCE(r.display_name, r.name))
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = a.admin_user_id
              AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          ),
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
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(safeLimit, offset);

    const dataResult = await pool.query(dataQuery, params);

    const rows = dataResult.rows.map((row) => ({
      ...row,
      action_display: formatActionTitle(row.action),
      details_display: formatDetailsSummary(row.details),
    }));

    return { logs: rows, total, page: safePage, limit: safeLimit };
  }

  /**
   * Export audit logs as CSV string.
   */
  static async exportCsv(filters = {}, actorUserId = null) {
    const { logs } = await AdminAuditService.list({ ...filters, page: 1, limit: 1000 }, actorUserId);

    const headers = ['S/N', 'TIME STAMP', 'ROLE', 'USER', 'EMAIL', 'ACTION', 'DETAILS'];
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = logs.map((log, index) => {
      const ts = log.created_at ? new Date(log.created_at).toISOString().replace('T', ' ').slice(0, 19) : '';
      return [
        index + 1,
        escapeCsv(ts),
        escapeCsv(log.actor_role || 'User'),
        escapeCsv(log.actor_name || ''),
        escapeCsv(log.actor_email || ''),
        escapeCsv(log.action_display || log.action || ''),
        escapeCsv(log.details_display || (log.details ? JSON.stringify(log.details) : '')),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}

module.exports = AdminAuditService;
