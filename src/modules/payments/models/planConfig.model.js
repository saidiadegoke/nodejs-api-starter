const pool = require('../../../db/pool');

/**
 * Plan Configuration Model
 * Manages plan configurations stored in database (limits, pricing, features)
 */
class PlanConfigModel {
  /**
   * Get all plan configurations
   */
  static async getAll(filters = {}) {
    const { active_only = false, public_only = false } = filters;

    let query = 'SELECT * FROM plan_configs WHERE 1=1';
    const params = [];

    if (active_only) {
      query += ' AND is_active = $1';
      params.push(true);
    }

    if (public_only) {
      query += active_only ? ' AND is_public = $2' : ' AND is_public = $1';
      params.push(true);
    }

    query += ' ORDER BY display_order ASC, plan_type ASC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get plan configuration by plan type
   */
  static async getByPlanType(planType) {
    const result = await pool.query(
      'SELECT * FROM plan_configs WHERE plan_type = $1',
      [planType]
    );
    return result.rows[0];
  }

  /**
   * Get plan configuration by ID
   */
  static async getById(id) {
    const result = await pool.query(
      'SELECT * FROM plan_configs WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  /**
   * Create plan configuration
   */
  static async create(planData) {
    const {
      plan_type,
      plan_name,
      description,
      prices,
      default_currency = 'NGN',
      limits,
      features,
      is_active = true,
      is_public = true,
      display_order = 0,
      metadata = {}
    } = planData;

    const result = await pool.query(
      `INSERT INTO plan_configs (
        plan_type, plan_name, description, prices, default_currency,
        limits, features, is_active, is_public, display_order, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        plan_type,
        plan_name,
        description,
        JSON.stringify(prices),
        default_currency,
        JSON.stringify(limits),
        JSON.stringify(features || []),
        is_active,
        is_public,
        display_order,
        JSON.stringify(metadata)
      ]
    );

    return result.rows[0];
  }

  /**
   * Update plan configuration
   */
  static async update(planType, updateData) {
    const allowedFields = [
      'plan_name',
      'description',
      'prices',
      'default_currency',
      'limits',
      'features',
      'is_active',
      'is_public',
      'display_order',
      'metadata'
    ];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        if (key === 'limits' || key === 'features' || key === 'metadata' || key === 'prices') {
          updates.push(`${key} = $${paramIndex}`);
          values.push(JSON.stringify(value));
        } else {
          updates.push(`${key} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(planType);

    const query = `
      UPDATE plan_configs 
      SET ${updates.join(', ')}
      WHERE plan_type = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete plan configuration (soft delete by setting is_active = false)
   */
  static async delete(planType) {
    const result = await pool.query(
      `UPDATE plan_configs 
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE plan_type = $1
       RETURNING *`,
      [planType]
    );
    return result.rows[0];
  }

  /**
   * Toggle plan active status
   */
  static async toggleActive(planType, isActive) {
    const result = await pool.query(
      `UPDATE plan_configs 
       SET is_active = $1, updated_at = CURRENT_TIMESTAMP
       WHERE plan_type = $2
       RETURNING *`,
      [isActive, planType]
    );
    return result.rows[0];
  }

  /**
   * Get plan limits for a plan type (with caching support)
   */
  static async getPlanLimits(planType) {
    const config = await this.getByPlanType(planType);
    if (!config) {
      throw new Error(`Plan configuration not found: ${planType}`);
    }
    
    // Parse JSONB fields
    return {
      ...config,
      prices: typeof config.prices === 'string' ? JSON.parse(config.prices) : config.prices,
      limits: typeof config.limits === 'string' ? JSON.parse(config.limits) : config.limits,
      features: typeof config.features === 'string' ? JSON.parse(config.features) : config.features,
      metadata: typeof config.metadata === 'string' ? JSON.parse(config.metadata) : config.metadata
    };
  }
}

module.exports = PlanConfigModel;

