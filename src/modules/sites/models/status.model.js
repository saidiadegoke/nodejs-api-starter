const pool = require('../../../db/pool');

class StatusModel {
  /**
   * Update site status
   */
  static async updateStatus(siteId, status) {
    const result = await pool.query(
      `UPDATE sites 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, siteId]
    );

    if (result.rows.length === 0) {
      throw new Error('Site not found');
    }

    return result.rows[0];
  }

  /**
   * Record status change in history
   */
  static async recordStatusChange({ siteId, oldStatus, newStatus, changedBy, reason }) {
    const result = await pool.query(
      `INSERT INTO site_status_history 
       (site_id, old_status, new_status, changed_by, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING *`,
      [siteId, oldStatus, newStatus, changedBy, reason]
    );

    return result.rows[0];
  }

  /**
   * Get status history for a site
   */
  static async getStatusHistory(siteId) {
    const result = await pool.query(
      `SELECT 
        ssh.id,
        ssh.old_status,
        ssh.new_status,
        ssh.reason,
        ssh.created_at,
        u.email as changed_by_email,
        u.id as changed_by_id
       FROM site_status_history ssh
       LEFT JOIN users u ON ssh.changed_by = u.id
       WHERE ssh.site_id = $1
       ORDER BY ssh.created_at DESC`,
      [siteId]
    );

    return result.rows;
  }
}

module.exports = StatusModel;


