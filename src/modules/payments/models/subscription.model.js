const pool = require('../../../db/pool');

/**
 * Subscription Model
 * Handles database operations for user subscriptions
 */
class SubscriptionModel {
  /**
   * Create a new subscription
   */
  static async create(subscriptionData) {
    const {
      user_id,
      plan_type = 'free',
      status = 'active',
      billing_cycle = 'monthly',
      current_period_start,
      current_period_end,
      amount = 0,
      currency = 'USD',
      metadata = {},
      notes
    } = subscriptionData;

    const result = await pool.query(
      `INSERT INTO user_subscriptions (
        user_id, plan_type, status, billing_cycle,
        current_period_start, current_period_end, amount, currency,
        metadata, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        user_id,
        plan_type,
        status,
        billing_cycle,
        current_period_start || new Date(),
        current_period_end,
        amount,
        currency,
        JSON.stringify(metadata),
        notes
      ]
    );

    return result.rows[0];
  }

  /**
   * Get subscription by ID
   */
  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM user_subscriptions WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  /**
   * Get active subscription for a user
   */
  static async getActiveSubscription(userId) {
    const result = await pool.query(
      `SELECT * FROM user_subscriptions 
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0];
  }

  /**
   * Get all subscriptions for a user
   */
  static async getUserSubscriptions(userId, options = {}) {
    const { limit = 20, offset = 0, status } = options;

    let query = `
      SELECT * FROM user_subscriptions 
      WHERE user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Update subscription
   */
  static async update(id, updateData) {
    const allowedFields = [
      'plan_type',
      'status',
      'billing_cycle',
      'current_period_start',
      'current_period_end',
      'cancel_at_period_end',
      'stripe_subscription_id',
      'stripe_customer_id',
      'paypal_subscription_id',
      'amount',
      'currency',
      'metadata',
      'notes',
      'cancelled_at',
      'trial_ends_at'
    ];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        if (key === 'metadata' && typeof value === 'object') {
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
    values.push(id);

    const query = `
      UPDATE user_subscriptions 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Cancel subscription
   */
  static async cancel(id, cancelAtPeriodEnd = true) {
    const result = await pool.query(
      `UPDATE user_subscriptions 
       SET cancel_at_period_end = $1, 
           cancelled_at = CASE WHEN $1 = false THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
           status = CASE WHEN $1 = false THEN 'cancelled' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [cancelAtPeriodEnd, id]
    );
    return result.rows[0];
  }

  /**
   * Update subscription status
   */
  static async updateStatus(id, status) {
    const result = await pool.query(
      `UPDATE user_subscriptions 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );
    return result.rows[0];
  }

  /**
   * Get subscription by Stripe subscription ID
   */
  static async findByStripeSubscriptionId(stripeSubscriptionId) {
    const result = await pool.query(
      'SELECT * FROM user_subscriptions WHERE stripe_subscription_id = $1',
      [stripeSubscriptionId]
    );
    return result.rows[0];
  }

  /**
   * Get subscription by PayPal subscription ID
   */
  static async findByPayPalSubscriptionId(paypalSubscriptionId) {
    const result = await pool.query(
      'SELECT * FROM user_subscriptions WHERE paypal_subscription_id = $1',
      [paypalSubscriptionId]
    );
    return result.rows[0];
  }

  /**
   * Check if user has active subscription with plan type
   */
  static async hasActivePlan(userId, planType) {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM user_subscriptions 
       WHERE user_id = $1 AND plan_type = $2 AND status = 'active'`,
      [userId, planType]
    );
    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Get subscription statistics
   */
  static async getStats() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_subscriptions,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_subscriptions,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_subscriptions,
        COUNT(CASE WHEN status = 'past_due' THEN 1 END) as past_due_subscriptions,
        COUNT(CASE WHEN plan_type = 'free' THEN 1 END) as free_plans,
        COUNT(CASE WHEN plan_type = 'small_scale' THEN 1 END) as small_scale_plans,
        COUNT(CASE WHEN plan_type = 'medium_scale' THEN 1 END) as medium_scale_plans,
        COUNT(CASE WHEN plan_type = 'large_scale' THEN 1 END) as large_scale_plans,
        SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END) as total_recurring_revenue
      FROM user_subscriptions
    `);
    return result.rows[0];
  }
}

module.exports = SubscriptionModel;

