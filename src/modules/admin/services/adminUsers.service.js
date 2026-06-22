const pool = require('../../../db/pool');
const { resolveAdminRbacScope } = require('../utils/admin-rbac-scope');

class AdminUsersService {
  static async getStats(actorUserId = null) {
    const scope = actorUserId ? await resolveAdminRbacScope(actorUserId) : { mode: 'full' };
    const universityId = scope.mode === 'institution' ? scope.universityId : null;

    const userBaseWhere = 'u.deleted_at IS NULL';
    const userParams = [];
    let userScopeClause = '';
    if (universityId) {
      userScopeClause = ' AND p.jupeb_university_id = $1';
      userParams.push(universityId);
    }

    const summaryResult = await pool.query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM users u
         LEFT JOIN profiles p ON u.id = p.user_id
         WHERE ${userBaseWhere}${userScopeClause}) AS total_users,
        (SELECT COUNT(*)::int FROM users u
         LEFT JOIN profiles p ON u.id = p.user_id
         WHERE ${userBaseWhere}${userScopeClause} AND u.status = 'active') AS active_users,
        (SELECT COUNT(*)::int FROM users u
         LEFT JOIN profiles p ON u.id = p.user_id
         WHERE ${userBaseWhere}${userScopeClause} AND u.status = 'inactive') AS inactive_users,
        (SELECT COUNT(*)::int FROM roles) AS total_roles,
        (SELECT COUNT(*)::int FROM permissions) AS total_permissions
    `,
      userParams
    );

    let rolesResult;
    if (scope.mode === 'institution') {
      rolesResult = await pool.query(
        `
        SELECT r.name AS role, r.display_name, COUNT(ur.user_id)::int AS user_count
        FROM roles r
        LEFT JOIN user_roles ur ON ur.role_id = r.id
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        LEFT JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE (r.is_system = true OR r.created_by = $2)
          AND (u.id IS NULL OR p.jupeb_university_id = $1)
        GROUP BY r.id, r.name, r.display_name
        ORDER BY user_count DESC
      `,
        [universityId, scope.actorId]
      );

      const roleCountResult = await pool.query(
        `SELECT COUNT(*)::int AS c FROM roles
         WHERE is_system = true OR created_by = $1`,
        [scope.actorId]
      );
      summaryResult.rows[0].total_roles = roleCountResult.rows[0].c;
    } else {
      rolesResult = await pool.query(`
        SELECT r.name AS role, r.display_name, COUNT(ur.user_id)::int AS user_count
        FROM roles r
        LEFT JOIN user_roles ur ON ur.role_id = r.id
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        LEFT JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL
        GROUP BY r.id, r.name, r.display_name
        ORDER BY user_count DESC
      `);
    }

    return {
      ...summaryResult.rows[0],
      users_by_role: rolesResult.rows,
    };
  }
}

module.exports = AdminUsersService;
