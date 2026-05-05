const pool = require('../../../db/pool');

class BankAccount {
  static async getActive() {
    const result = await pool.query(
      'SELECT * FROM bank_accounts WHERE is_active = TRUE ORDER BY updated_at DESC NULLS LAST LIMIT 1'
    );
    return result.rows[0] || null;
  }

  static async getAll(options = {}) {
    const page = parseInt(options.page, 10) || 1;
    const limit = parseInt(options.limit, 10) || 50;
    const offset = (page - 1) * limit;
    const values = [];
    let where = 'WHERE 1=1';
    let i = 1;
    if (options.is_active !== undefined) {
      where += ` AND is_active = $${i++}`;
      values.push(options.is_active);
    }
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM bank_accounts ${where}`, values);
    const total = countResult.rows[0].total;
    const dataResult = await pool.query(
      `SELECT * FROM bank_accounts ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    );
    return {
      accounts: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  static async create(data) {
    const { bank_name, account_number, account_name, is_active = true } = data;
    const result = await pool.query(
      `INSERT INTO bank_accounts (bank_name, account_number, account_name, is_active)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [bank_name, account_number, account_name, is_active]
    );
    return result.rows[0];
  }

  static async update(id, data) {
    const { bank_name, account_number, account_name, is_active } = data;
    const result = await pool.query(
      `UPDATE bank_accounts SET bank_name = $1, account_number = $2, account_name = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 RETURNING *`,
      [bank_name, account_number, account_name, is_active, id]
    );
    return result.rows[0];
  }

  static async delete(id) {
    await pool.query('DELETE FROM bank_accounts WHERE id = $1', [id]);
    return true;
  }

  static async setActive(id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE bank_accounts SET is_active = FALSE');
      await client.query('UPDATE bank_accounts SET is_active = TRUE WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

module.exports = BankAccount;
