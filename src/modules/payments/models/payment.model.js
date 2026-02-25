const { Pool } = require('pg');
const pool = require('../../../db/pool');

class Payment {
  constructor() {
    this.tableName = 'payments';
  }

  // Create a new payment record
  async create(paymentData) {
    const {
      payment_id,
      amount,
      currency = 'NGN',
      type,
      status = 'pending',
      payment_method,
      transaction_ref,
      processor_response,
      user_id,
      donor_id,
      anonymous_donor_first_name,
      anonymous_donor_last_name,
      anonymous_donor_email,
      anonymous_donor_phone,
      campaign_id,
      purpose,
      metadata = {},
      user_agent,
      ip_address,
      source = 'web',
      is_recurring = false,
      recurring_interval,
      notes,
      internal_notes
    } = paymentData;

    const query = `
      INSERT INTO payments (
        payment_id, amount, currency, type, status, payment_method,
        transaction_ref, processor_response, user_id, donor_id,
        anonymous_donor_first_name, anonymous_donor_last_name,
        anonymous_donor_email, anonymous_donor_phone,
        campaign_id, purpose, metadata, user_agent, ip_address,
        source, is_recurring, recurring_interval, notes, internal_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      RETURNING *
    `;

    const values = [
      payment_id, amount, currency, type, status, payment_method,
      transaction_ref, processor_response, user_id || null, donor_id,
      anonymous_donor_first_name, anonymous_donor_last_name,
      anonymous_donor_email, anonymous_donor_phone,
      campaign_id, purpose, JSON.stringify(metadata), user_agent, ip_address,
      source, is_recurring, recurring_interval, notes, internal_notes
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating payment: ${error.message}`);
    }
  }

  // Find payment by ID
  async findById(id) {
    const query = 'SELECT * FROM payments WHERE id = $1';
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error finding payment: ${error.message}`);
    }
  }

  // Find payment by payment_id
  async findByPaymentId(paymentId) {
    const query = 'SELECT * FROM payments WHERE payment_id = $1';
    try {
      const result = await pool.query(query, [paymentId]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error finding payment: ${error.message}`);
    }
  }

  // Find payment by transaction reference
  async findByTransactionRef(transactionRef) {
    const query = 'SELECT * FROM payments WHERE transaction_ref = $1 OR payment_id = $1';
    try {
      const result = await pool.query(query, [transactionRef]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error finding payment: ${error.message}`);
    }
  }

  // Find donations by email (for linking anonymous donations to users)
  async findByEmail(email) {
    const query = `
      SELECT * FROM payments 
      WHERE anonymous_donor_email = $1 
      AND type = 'donation'
      ORDER BY created_at DESC
    `;
    try {
      const result = await pool.query(query, [email]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error finding payments by email: ${error.message}`);
    }
  }

  // Update payment status
  async updateStatus(id, status, additionalData = {}) {
    const { transaction_ref, processor_response, paid_at, receipt_url } = additionalData;
    
    let query = `
      UPDATE payments 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
    `;
    
    const values = [status, id];
    let paramIndex = 3; // Start from $3 since $1 and $2 are used

    if (transaction_ref) {
      query += `, transaction_ref = $${paramIndex}`;
      values.push(transaction_ref);
      paramIndex++;
    }
    
    if (processor_response) {
      query += `, processor_response = $${paramIndex}`;
      values.push(JSON.stringify(processor_response));
      paramIndex++;
    }
    
    if (paid_at) {
      query += `, paid_at = $${paramIndex}`;
      values.push(paid_at);
      paramIndex++;
    }
    
    if (receipt_url) {
      query += `, receipt_url = $${paramIndex}`;
      values.push(receipt_url);
      paramIndex++;
    }

    query += ` WHERE id = $2 RETURNING *`;

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating payment status: ${error.message}`);
    }
  }

  // Get payments by user ID (supports both donation and subscription payments)
  async findByUserId(userId, options = {}) {
    const { limit = 20, offset = 0, status, payment_type } = options;
    
    // Build base query - no campaign join (campaigns table doesn't exist in SmartStore)
    let query = `
      SELECT 
        p.*
      FROM payments p
      WHERE (p.user_id = $1 OR p.donor_id = $1 OR p.anonymous_donor_email IN (
        SELECT email FROM users WHERE id = $1
      ))
    `;
    const values = [userId];
    let paramIndex = 2;

    // Filter by payment type if specified (subscription, donation, campaign, etc.)
    // If not specified, include all payment types
    if (payment_type) {
      query += ` AND p.type = $${paramIndex}`;
      values.push(payment_type);
      paramIndex++;
    }

    // Filter by status if specified
    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    query += ' ORDER BY p.created_at DESC LIMIT $' + paramIndex + ' OFFSET $' + (paramIndex + 1);
    values.push(limit, offset);

    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      throw new Error(`Error finding user payments: ${error.message}`);
    }
  }

  // Get user payments count for pagination (supports all payment types)
  async getUserPaymentsCount(userId, status = null, payment_type = null) {
    let query = `
      SELECT COUNT(*) as total
      FROM payments p
      WHERE (p.user_id = $1 OR p.donor_id = $1 OR p.anonymous_donor_email IN (
        SELECT email FROM users WHERE id = $1
      ))
    `;
    const values = [userId];
    let paramIndex = 2;

    // Filter by payment type if specified
    if (payment_type) {
      query += ` AND p.type = $${paramIndex}`;
      values.push(payment_type);
      paramIndex++;
    }

    // Filter by status if specified
    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      values.push(status);
    }

    try {
      const result = await pool.query(query, values);
      return parseInt(result.rows[0].total);
    } catch (error) {
      throw new Error(`Error getting user payments count: ${error.message}`);
    }
  }

  // Get user donation summary statistics (including email-matched donations)
  async getUserDonationSummary(userId) {
    const query = `
      SELECT 
        COALESCE(COUNT(*), 0) as total_donations,
        COALESCE(SUM(CASE WHEN p.status IN ('completed', 'pending') THEN p.amount ELSE 0 END), 0) as total_amount,
        COALESCE(AVG(CASE WHEN p.status IN ('completed', 'pending') THEN p.amount ELSE NULL END), 0) as average_donation,
        COALESCE(COUNT(DISTINCT p.campaign_id), 0) as campaigns_supported,
        MAX(p.created_at) as last_donation_date
      FROM payments p
      WHERE (p.donor_id = $1 OR p.anonymous_donor_email IN (
        SELECT email FROM users WHERE id = $1
      )) AND p.type IN ('donation', 'campaign')
    `;

    try {
      const result = await pool.query(query, [userId]);
      const row = result.rows[0];
      
      // Ensure consistent data types
      return {
        total_donations: parseInt(row.total_donations) || 0,
        total_amount: parseFloat(row.total_amount) || 0,
        average_donation: parseFloat(row.average_donation) || 0,
        campaigns_supported: parseInt(row.campaigns_supported) || 0,
        last_donation_date: row.last_donation_date
      };
    } catch (error) {
      throw new Error(`Error getting user donation summary: ${error.message}`);
    }
  }

  // Get payments by campaign ID
  async findByCampaignId(campaignId, options = {}) {
    const { limit = 20, offset = 0, status } = options;
    
    let query = `
      SELECT 
        p.*,
        NULL::text as campaign_name,
        NULL::text as campaign_description
      FROM payments p
      WHERE p.campaign_id = $1
    `;
    const values = [campaignId];
    let paramIndex = 2;

    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    query += ' ORDER BY p.created_at DESC LIMIT $' + paramIndex + ' OFFSET $' + (paramIndex + 1);
    values.push(limit, offset);

    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      throw new Error(`Error finding campaign payments: ${error.message}`);
    }
  }

  // Get merchandise orders for a specific site (by metadata.site_id)
  async findBySiteId(siteId, options = {}) {
    const { limit = 50, offset = 0, status } = options;
    let query = `
      SELECT * FROM payments
      WHERE metadata->>'site_id' = $1
      AND type = 'merchandise'
    `;
    const values = [String(siteId)];
    let paramIndex = 2;
    if (status) {
      query += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);
    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      throw new Error(`Error finding site orders: ${error.message}`);
    }
  }

  async countBySiteId(siteId, status) {
    let query = `SELECT COUNT(*) as total FROM payments WHERE metadata->>'site_id' = $1 AND type = 'merchandise'`;
    const values = [String(siteId)];
    if (status) {
      query += ` AND status = $2`;
      values.push(status);
    }
    try {
      const result = await pool.query(query, values);
      return parseInt(result.rows[0].total, 10);
    } catch (error) {
      throw new Error(`Error counting site orders: ${error.message}`);
    }
  }

  // Update fulfillment status stored in metadata (CONFIRMED → SHIPPED → DELIVERED)
  async updateFulfillmentStatus(id, fulfillmentStatus) {
    const query = `
      UPDATE payments
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{fulfillment_status}', $1::jsonb),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 RETURNING *
    `;
    try {
      const result = await pool.query(query, [JSON.stringify(fulfillmentStatus), id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating fulfillment status: ${error.message}`);
    }
  }

  // Get all payments with filters
  async findAll(options = {}) {
    const {
      limit = 50,
      offset = 0,
      status,
      type,
      payment_method,
      start_date,
      end_date,
      min_amount,
      max_amount,
      campaign
    } = options;

    let whereConditions = [];
    let values = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`p.status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (type) {
      whereConditions.push(`p.type = $${paramIndex}`);
      values.push(type);
      paramIndex++;
    }

    if (payment_method) {
      whereConditions.push(`p.payment_method = $${paramIndex}`);
      values.push(payment_method);
      paramIndex++;
    }

    if (start_date) {
      whereConditions.push(`p.created_at >= $${paramIndex}`);
      values.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereConditions.push(`p.created_at <= $${paramIndex}`);
      values.push(end_date);
      paramIndex++;
    }

    if (min_amount) {
      whereConditions.push(`p.amount >= $${paramIndex}`);
      values.push(min_amount);
      paramIndex++;
    }

    if (max_amount) {
      whereConditions.push(`p.amount <= $${paramIndex}`);
      values.push(max_amount);
      paramIndex++;
    }

    if (campaign) {
      if (campaign === 'general') {
        // Filter for payments without a campaign (general donations)
        whereConditions.push(`p.campaign_id IS NULL`);
      } else {
        // Filter for specific campaign
        whereConditions.push(`p.campaign_id = $${paramIndex}`);
        values.push(campaign);
        paramIndex++;
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM payments p ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results (no campaigns table in SmartStore)
    const dataQuery = `
      SELECT 
        p.*,
        NULL::text as campaign_name,
        NULL::text as campaign_description
      FROM payments p
      ${whereClause}
      ORDER BY p.created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);
    const dataResult = await pool.query(dataQuery, values);

    return {
      payments: dataResult.rows,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Get payment statistics
  async getStats(filters = {}) {
    const { start_date, end_date, status, type } = filters;
    
    let query = `
      SELECT 
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_amount,
        AVG(CASE WHEN status = 'completed' THEN amount END) as average_amount,
        COUNT(DISTINCT CASE WHEN status = 'completed' AND donor_id IS NOT NULL THEN donor_id END) + 
        COUNT(DISTINCT CASE WHEN status = 'completed' AND donor_id IS NULL THEN anonymous_donor_email END) as unique_donors,
        SUM(CASE WHEN status = 'completed' AND type = 'donation' THEN amount ELSE 0 END) as total_donations,
        SUM(CASE WHEN status = 'completed' AND type = 'dues' THEN amount ELSE 0 END) as total_dues,
        SUM(CASE WHEN status = 'completed' AND type = 'campaign' THEN amount ELSE 0 END) as total_campaign_payments
      FROM payments
      WHERE 1=1
    `;
    
    const values = [];
    let paramIndex = 1;

    if (start_date) {
      query += ` AND created_at >= $${paramIndex}`;
      values.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND created_at <= $${paramIndex}`;
      values.push(end_date);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (type) {
      query += ` AND type = $${paramIndex}`;
      values.push(type);
      paramIndex++;
    }

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error getting payment stats: ${error.message}`);
    }
  }

  // Get summary statistics for admin dashboard
  async getSummaryStats() {
    const query = `
      SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_amount,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_payments,
        COUNT(CASE WHEN status = 'pending_verification' THEN 1 END) as pending_verification,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        AVG(CASE WHEN status = 'completed' THEN amount END) as average_amount
      FROM payments
    `;

    try {
      const result = await pool.query(query);
      const stats = result.rows[0];
      
      return {
        total_payments: parseInt(stats.total_payments) || 0,
        total_amount: parseFloat(stats.total_amount) || 0,
        completed_payments: parseInt(stats.completed_payments) || 0,
        pending_verification: parseInt(stats.pending_verification) || 0,
        failed_payments: parseInt(stats.failed_payments) || 0,
        average_amount: parseFloat(stats.average_amount) || 0
      };
    } catch (error) {
      throw new Error(`Error getting payment summary stats: ${error.message}`);
    }
  }

  // Get recent payments for dashboard (no campaigns table in SmartStore)
  async getRecentPayments(limit = 5) {
    const query = `
      SELECT 
        p.id,
        p.payment_id,
        p.amount,
        p.currency,
        p.type,
        p.status,
        p.created_at,
        p.paid_at,
        COALESCE(u.first_name, p.anonymous_donor_first_name) as donor_first_name,
        COALESCE(u.last_name, p.anonymous_donor_last_name) as donor_last_name,
        COALESCE(u.email, p.anonymous_donor_email) as donor_email,
        NULL::text as campaign_name,
        NULL::text as campaign_slug
      FROM payments p
      LEFT JOIN users u ON p.donor_id = u.id
      WHERE p.status = 'completed'
      ORDER BY p.created_at DESC
      LIMIT $1
    `;

    try {
      const result = await pool.query(query, [limit]);
      return result.rows.map(row => ({
        id: row.id,
        amount: parseFloat(row.amount),
        type: row.type,
        donorName: row.donor_first_name && row.donor_last_name 
          ? `${row.donor_first_name} ${row.donor_last_name}`
          : row.donor_email || 'Anonymous',
        date: row.created_at,
        campaignName: row.campaign_name
      }));
    } catch (error) {
      throw new Error(`Error getting recent payments: ${error.message}`);
    }
  }

  // Update payment receipt information
  async updateReceipt(id, receiptData) {
    const { receipt_file_id, notes, status } = receiptData;
    
    let query = `
      UPDATE payments 
      SET receipt_file_id = $1, notes = $2, status = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [receipt_file_id, notes, status, id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating payment receipt: ${error.message}`);
    }
  }

  // Update transaction reference
  async updateTransactionRef(id, transactionRef, status) {
    const query = 'UPDATE payments SET transaction_ref = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *';
    try {
      const result = await pool.query(query, [transactionRef, status, id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating transaction reference: ${error.message}`);
    }
  }

  // Delete payment (admin only)
  async delete(id) {
    const query = 'DELETE FROM payments WHERE id = $1 RETURNING *';
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting payment: ${error.message}`);
    }
  }

  // Find payment by reference (payment_id) (no campaigns table in SmartStore)
  async findByReference(reference) {
    try {
      const query = `
        SELECT 
          p.*,
          NULL::text as campaign_name,
          NULL::text as campaign_description
        FROM payments p
        WHERE p.payment_id = $1
      `;
      
      const result = await pool.query(query, [reference]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error finding payment by reference:', error);
      throw new Error(`Error finding payment by reference: ${error.message}`);
    }
  }
}

module.exports = new Payment(); 