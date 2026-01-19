const pool = require('../../../db/pool');

class PaymentMethod {
  constructor() {
    this.tableName = 'payment_methods';
  }

  // Create a new payment method
  async create(paymentMethodData) {
    const {
      name,
      code,
      type,
      is_active = true,
      supported_currencies = ['NGN'],
      processing_fee = 0,
      processing_fee_type = 'percentage',
      api_public_key,
      api_secret_key,
      webhook_secret,
      base_url,
      display_name,
      description,
      icon_url
    } = paymentMethodData;

    const query = `
      INSERT INTO payment_methods (
        name, code, type, is_active, supported_currencies, processing_fee,
        processing_fee_type, api_public_key, api_secret_key, webhook_secret,
        base_url, display_name, description, icon_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const values = [
      name, code, type, is_active, JSON.stringify(supported_currencies), processing_fee,
      processing_fee_type, api_public_key, api_secret_key, webhook_secret,
      base_url, display_name, description, icon_url
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating payment method: ${error.message}`);
    }
  }

  // Find payment method by ID
  async findById(id) {
    const query = 'SELECT * FROM payment_methods WHERE id = $1';
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error finding payment method: ${error.message}`);
    }
  }

  // Find payment method by code
  async findByCode(code) {
    const query = 'SELECT * FROM payment_methods WHERE code = $1';
    try {
      const result = await pool.query(query, [code]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error finding payment method: ${error.message}`);
    }
  }

  // Get all active payment methods
  async getActiveMethods() {
    const query = 'SELECT * FROM payment_methods WHERE is_active = true ORDER BY name';
    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting active payment methods: ${error.message}`);
    }
  }

  // Get all payment methods with filters
  async findAll(options = {}) {
    const {
      limit = 50,
      offset = 0,
      is_active,
      type
    } = options;

    let query = 'SELECT * FROM payment_methods WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      values.push(is_active);
      paramIndex++;
    }

    if (type) {
      query += ` AND type = $${paramIndex}`;
      values.push(type);
      paramIndex++;
    }

    query += ' ORDER BY name LIMIT $' + paramIndex + ' OFFSET $' + (paramIndex + 1);
    values.push(limit, offset);

    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      throw new Error(`Error finding payment methods: ${error.message}`);
    }
  }

  // Update payment method
  async update(id, updateData) {
    const allowedFields = [
      'name', 'code', 'type', 'is_active', 'supported_currencies', 'processing_fee',
      'processing_fee_type', 'api_public_key', 'api_secret_key', 'webhook_secret',
      'base_url', 'display_name', 'description', 'icon_url'
    ];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE payment_methods 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating payment method: ${error.message}`);
    }
  }

  // Toggle payment method active status
  async toggleActive(id, active = true) {
    const query = `
      UPDATE payment_methods 
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [active, id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error toggling payment method active status: ${error.message}`);
    }
  }

  // Calculate processing fee
  async calculateFee(amount, paymentMethodCode) {
    const paymentMethod = await this.findByCode(paymentMethodCode);
    if (!paymentMethod || !paymentMethod.is_active) {
      throw new Error('Payment method not found or inactive');
    }

    const { processing_fee, processing_fee_type } = paymentMethod;
    
    if (processing_fee_type === 'percentage') {
      return (amount * processing_fee) / 100;
    } else {
      return processing_fee;
    }
  }

  // Count payment methods with filters
  async count(options = {}) {
    const { is_active, type } = options;

    let query = 'SELECT COUNT(*) FROM payment_methods WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      values.push(is_active);
      paramIndex++;
    }

    if (type) {
      query += ` AND type = $${paramIndex}`;
      values.push(type);
      paramIndex++;
    }

    try {
      const result = await pool.query(query, values);
      return parseInt(result.rows[0].count);
    } catch (error) {
      throw new Error(`Error counting payment methods: ${error.message}`);
    }
  }

  // Get payment method statistics
  async getStats() {
    const query = `
      SELECT 
        COUNT(*) as total_methods,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_methods,
        COUNT(CASE WHEN type = 'gateway' THEN 1 END) as gateway_methods,
        COUNT(CASE WHEN type = 'manual' THEN 1 END) as manual_methods
      FROM payment_methods
    `;

    try {
      const result = await pool.query(query);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error getting payment method stats: ${error.message}`);
    }
  }

  // Delete payment method
  async delete(id) {
    const query = 'DELETE FROM payment_methods WHERE id = $1 RETURNING *';
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting payment method: ${error.message}`);
    }
  }

  // Initialize default payment methods
  async initializeDefaults() {
    const defaultMethods = [
      {
        name: 'Paystack',
        code: 'paystack',
        type: 'gateway',
        display_name: 'Paystack',
        description: 'Secure online payment gateway',
        supported_currencies: ['NGN', 'USD', 'GBP', 'EUR'],
        processing_fee: 1.5,
        processing_fee_type: 'percentage',
        is_active: true
      },
      {
        name: 'Flutterwave',
        code: 'flutterwave',
        type: 'gateway',
        display_name: 'Flutterwave',
        description: 'African payment gateway',
        supported_currencies: ['NGN', 'USD', 'GBP', 'EUR'],
        processing_fee: 1.4,
        processing_fee_type: 'percentage',
        is_active: true
      },
      {
        name: 'Bank Transfer',
        code: 'bank_transfer',
        type: 'manual',
        display_name: 'Bank Transfer',
        description: 'Direct bank transfer',
        supported_currencies: ['NGN'],
        processing_fee: 0,
        processing_fee_type: 'fixed',
        is_active: true
      },
      {
        name: 'Direct Transfer',
        code: 'direct_transfer',
        type: 'manual',
        display_name: 'Direct Bank Transfer',
        description: 'Pay directly to our bank account and confirm your payment online.',
        supported_currencies: ['NGN', 'USD', 'EUR', 'GBP'],
        processing_fee: 0,
        processing_fee_type: 'fixed',
        is_active: true
      }
    ];

    for (const method of defaultMethods) {
      const existing = await this.findByCode(method.code);
      if (!existing) {
        await this.create(method);
      }
    }
  }
}

module.exports = new PaymentMethod(); 