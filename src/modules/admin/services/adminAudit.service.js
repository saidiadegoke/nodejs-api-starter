const pool = require('../../../db/pool');

/**
 * Admin Audit Log.
 * Call `.log()` from any admin/privileged controller to record the action.
 */
class AdminAuditService {
  static async log(adminUserId, action, resourceType = null, resourceId = null, details = null, req = null) {
    const ipAddress = req ? (req.ip || req.connection?.remoteAddress || null) : null;
    const userAgent = req ? (req.get('user-agent') || null) : null;

    try {
      await pool.query(
        `INSERT INTO admin_audit_logs (admin_user_id, action, resource_type, resource_id, details, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [adminUserId, action, resourceType, resourceId, details ? JSON.stringify(details) : null, ipAddress, userAgent]
      );
    } catch (err) {
      console.error('Audit log error:', err.message);
    }
  }

  static async list(filters = {}) {
    const {
      admin_user_id,
      action,
      resource_type,
      start_date,
      end_date,
      page = 1,
      limit = 20,
    } = filters;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (admin_user_id) {
      conditions.push(`a.admin_user_id = $${paramIdx++}`);
      params.push(admin_user_id);
    }
    if (action) {
      conditions.push(`a.action = $${paramIdx++}`);
      params.push(action);
    }
    if (resource_type) {
      conditions.push(`a.resource_type = $${paramIdx++}`);
      params.push(resource_type);
    }
    if (start_date) {
      conditions.push(`a.created_at >= $${paramIdx++}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`a.created_at <= $${paramIdx++}`);
      params.push(end_date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countQuery = `SELECT COUNT(*) FROM admin_audit_logs a ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT a.*,
             p.first_name AS admin_first_name,
             p.last_name AS admin_last_name
      FROM admin_audit_logs a
      LEFT JOIN profiles p ON p.user_id = a.admin_user_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(limit, offset);

    const dataResult = await pool.query(dataQuery, params);

    return { logs: dataResult.rows, total };
  }
}

module.exports = AdminAuditService;
