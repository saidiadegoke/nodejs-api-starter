const pool = require('../../../db/pool');

class AdminUsersService {
  static async getStats() {
    const summaryResult = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL) AS total_users,
        (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL AND status = 'active') AS active_users,
        (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL AND status = 'inactive') AS inactive_users,
        (SELECT COUNT(*)::int FROM roles) AS total_roles,
        (SELECT COUNT(*)::int FROM permissions) AS total_permissions
    `);

    const rolesResult = await pool.query(`
      SELECT r.name AS role, r.display_name, COUNT(ur.user_id)::int AS user_count
      FROM roles r
      LEFT JOIN user_roles ur ON ur.role_id = r.id
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      LEFT JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL
      GROUP BY r.id, r.name, r.display_name
      ORDER BY user_count DESC
    `);

    return {
      ...summaryResult.rows[0],
      users_by_role: rolesResult.rows,
    };
  }
}

module.exports = AdminUsersService;
