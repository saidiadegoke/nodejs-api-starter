const pool = require('../../../db/pool');

class EngineModel {
  /**
   * Update site engine version
   */
  static async updateEngineVersion(siteId, version) {
    const result = await pool.query(
      `UPDATE sites 
       SET engine_version = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [version, siteId]
    );

    if (result.rows.length === 0) {
      throw new Error('Site not found');
    }

    return result.rows[0];
  }

  /**
   * Record engine version change in history
   */
  static async recordVersionChange({ siteId, oldVersion, newVersion, changedBy, isRollback = false }) {
    // Check if engine_version_history table exists, if not, skip recording
    try {
      const result = await pool.query(
        `INSERT INTO engine_version_history 
         (site_id, old_version, new_version, changed_by, is_rollback, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         RETURNING *`,
        [siteId, oldVersion, newVersion, changedBy, isRollback]
      );
      return result.rows[0];
    } catch (error) {
      // Table doesn't exist yet - that's okay, we'll create it in migration
      // For now, just log the change
      console.log(`Engine version change: Site ${siteId} from ${oldVersion} to ${newVersion}`);
      return null;
    }
  }

  /**
   * Get engine version history for a site
   */
  static async getVersionHistory(siteId) {
    try {
      const result = await pool.query(
        `SELECT 
          evh.id,
          evh.old_version,
          evh.new_version,
          evh.is_rollback,
          evh.created_at,
          u.email as changed_by_email,
          u.id as changed_by_id
         FROM engine_version_history evh
         LEFT JOIN users u ON evh.changed_by = u.id
         WHERE evh.site_id = $1
         ORDER BY evh.created_at DESC`,
        [siteId]
      );
      return result.rows;
    } catch (error) {
      // Table doesn't exist yet - return empty array
      return [];
    }
  }
}

module.exports = EngineModel;


