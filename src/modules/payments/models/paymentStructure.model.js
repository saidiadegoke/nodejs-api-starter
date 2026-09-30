const pool = require('../../../database/pool');

/**
 * payment_structures — the admin-managed catalog of *how* a payer pays
 * (Full, Partial). `allows_partial` drives the checkout amount rule.
 */
class PaymentStructureModel {
  async listActive() {
    const r = await pool.query(
      `SELECT id, code, name, description, allows_partial, is_active, sort_order
       FROM payment_structures
       WHERE deleted_at IS NULL AND is_active = true
       ORDER BY sort_order ASC, name ASC`
    );
    return r.rows;
  }

  async findAll() {
    const r = await pool.query(
      `SELECT * FROM payment_structures
       WHERE deleted_at IS NULL
       ORDER BY sort_order ASC, name ASC`
    );
    return r.rows;
  }

  async findById(id) {
    const r = await pool.query(
      `SELECT * FROM payment_structures WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return r.rows[0] || null;
  }

  async findByCode(code) {
    const r = await pool.query(
      `SELECT * FROM payment_structures WHERE LOWER(code) = LOWER($1) AND deleted_at IS NULL`,
      [String(code).trim()]
    );
    return r.rows[0] || null;
  }

  async create({ code, name, description = null, allows_partial = false, sort_order = 0 }) {
    const r = await pool.query(
      `INSERT INTO payment_structures (code, name, description, allows_partial, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [code.trim(), name.trim(), description, allows_partial, sort_order]
    );
    return r.rows[0];
  }

  async update(id, fields) {
    const allowed = ['code', 'name', 'description', 'allows_partial', 'is_active', 'sort_order'];
    const sets = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = $${i++}`);
        values.push(typeof fields[key] === 'string' ? fields[key].trim() : fields[key]);
      }
    }
    if (!sets.length) return this.findById(id);
    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const r = await pool.query(
      `UPDATE payment_structures SET ${sets.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`,
      values
    );
    return r.rows[0] || null;
  }

  async softDelete(id) {
    const r = await pool.query(
      `UPDATE payment_structures SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    return !!r.rows[0];
  }
}

module.exports = new PaymentStructureModel();
