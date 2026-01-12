const pool = require('../../../db/pool');
const { logger } = require('../../../shared/utils/logger');

class DeploymentModel {
  /**
   * Create a new deployment record
   */
  static async createDeployment(siteId, userId, data = {}) {
    const {
      status = 'pending',
      deploymentUrl = null,
      errorMessage = null,
      metadata = null,
    } = data;

    const result = await pool.query(
      `INSERT INTO deployments (site_id, status, deployed_by, deployment_url, error_message, deployment_metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        siteId,
        status,
        userId,
        deploymentUrl,
        errorMessage,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    return result.rows[0];
  }

  /**
   * Get deployment by ID
   */
  static async getDeploymentById(deploymentId) {
    const result = await pool.query(
      `SELECT * FROM deployments WHERE id = $1`,
      [deploymentId]
    );

    return result.rows[0];
  }

  /**
   * Get all deployments for a site
   */
  static async getDeploymentsBySite(siteId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT * FROM deployments 
       WHERE site_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [siteId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get latest deployment for a site
   */
  static async getLatestDeployment(siteId) {
    const result = await pool.query(
      `SELECT * FROM deployments 
       WHERE site_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [siteId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get deployments by status
   */
  static async getDeploymentsByStatus(status, limit = 100) {
    const result = await pool.query(
      `SELECT * FROM deployments 
       WHERE status = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [status, limit]
    );

    return result.rows;
  }

  /**
   * Update deployment status
   */
  static async updateDeploymentStatus(deploymentId, status, errorMessage = null, deploymentUrl = null) {
    const updateFields = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [deploymentId, status];
    let paramIndex = 3;

    if (errorMessage !== null) {
      updateFields.push(`error_message = $${paramIndex}`);
      values.push(errorMessage);
      paramIndex++;
    }

    if (deploymentUrl !== null) {
      updateFields.push(`deployment_url = $${paramIndex}`);
      values.push(deploymentUrl);
      paramIndex++;
    }

    if (status === 'success' && !updateFields.includes('deployed_at = CURRENT_TIMESTAMP')) {
      updateFields.push('deployed_at = CURRENT_TIMESTAMP');
    }

    const query = `UPDATE deployments SET ${updateFields.join(', ')} WHERE id = $1 RETURNING *`;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Update deployment metadata
   */
  static async updateDeploymentMetadata(deploymentId, metadata) {
    const result = await pool.query(
      `UPDATE deployments 
       SET deployment_metadata = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [JSON.stringify(metadata), deploymentId]
    );

    return result.rows[0];
  }

  /**
   * Get deployment count for a site
   */
  static async getDeploymentCount(siteId) {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM deployments WHERE site_id = $1`,
      [siteId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get deployment statistics for a site
   */
  static async getDeploymentStats(siteId) {
    const result = await pool.query(
      `SELECT 
         status,
         COUNT(*) as count,
         MAX(created_at) as last_deployment
       FROM deployments 
       WHERE site_id = $1 
       GROUP BY status`,
      [siteId]
    );

    return result.rows;
  }

  /**
   * Delete deployment
   */
  static async deleteDeployment(deploymentId) {
    const result = await pool.query(
      `DELETE FROM deployments WHERE id = $1 RETURNING *`,
      [deploymentId]
    );

    return result.rows[0];
  }
}

module.exports = DeploymentModel;

