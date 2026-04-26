const pool = require('../../../db/pool');

class PaymentMethod {
  async create(data) {
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
      icon_url,
    } = data;

    const result = await pool.query(
      `INSERT INTO payment_methods (
        name, code, type, is_active, supported_currencies, processing_fee,
        processing_fee_type, api_public_key, api_secret_key, webhook_secret,
        base_url, display_name, description, icon_url
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        name,
        code,
        type,
        is_active,
        JSON.stringify(supported_currencies),
        processing_fee,
        processing_fee_type,
        api_public_key,
        api_secret_key,
        webhook_secret,
        base_url,
        display_name,
        description,
        icon_url,
      ]
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await pool.query('SELECT * FROM payment_methods WHERE id = $1', [id]);
    return result.rows[0];
  }

  async findByCode(code) {
    const result = await pool.query('SELECT * FROM payment_methods WHERE code = $1', [code]);
    return result.rows[0];
  }

  async getActiveMethods() {
    const result = await pool.query(
      'SELECT * FROM payment_methods WHERE is_active = true ORDER BY name'
    );
    return result.rows;
  }

  async findAll(options = {}) {
    const { limit = 50, offset = 0, is_active, type } = options;
    const values = [];
    let q = 'SELECT * FROM payment_methods WHERE 1=1';
    let i = 1;
    if (is_active !== undefined) {
      q += ` AND is_active = $${i++}`;
      values.push(is_active);
    }
    if (type) {
      q += ` AND type = $${i++}`;
      values.push(type);
    }
    q += ` ORDER BY name LIMIT $${i} OFFSET $${i + 1}`;
    values.push(limit, offset);
    const result = await pool.query(q, values);
    return result.rows;
  }

  async update(id, updateData) {
    const allowed = [
      'name',
      'code',
      'type',
      'is_active',
      'supported_currencies',
      'processing_fee',
      'processing_fee_type',
      'api_public_key',
      'api_secret_key',
      'webhook_secret',
      'base_url',
      'display_name',
      'description',
      'icon_url',
    ];
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [k, v] of Object.entries(updateData)) {
      if (!allowed.includes(k)) continue;
      sets.push(`${k} = $${idx++}`);
      values.push(k === 'supported_currencies' && typeof v === 'object' ? JSON.stringify(v) : v);
    }
    if (!sets.length) throw new Error('No valid fields to update');
    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const result = await pool.query(
      `UPDATE payment_methods SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async count(options = {}) {
    const { is_active, type } = options;
    const values = [];
    let q = 'SELECT COUNT(*)::int AS c FROM payment_methods WHERE 1=1';
    let i = 1;
    if (is_active !== undefined) {
      q += ` AND is_active = $${i++}`;
      values.push(is_active);
    }
    if (type) {
      q += ` AND type = $${i++}`;
      values.push(type);
    }
    const result = await pool.query(q, values);
    return result.rows[0].c;
  }

  async calculateFee(amount, code) {
    const method = await this.findByCode(code);
    if (!method || !method.is_active) throw new Error('Payment method not found or inactive');
    if (method.processing_fee_type === 'percentage') {
      return (amount * Number(method.processing_fee)) / 100;
    }
    return Number(method.processing_fee);
  }

  async delete(id) {
    const result = await pool.query('DELETE FROM payment_methods WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }
}

module.exports = new PaymentMethod();
