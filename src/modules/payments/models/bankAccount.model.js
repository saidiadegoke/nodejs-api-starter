const pool = require('../../../db/pool');

class BankAccount {
  constructor() {
    this.tableName = 'bank_accounts';
  }

  // Get the active bank account
  static async getActive() {
    const query = 'SELECT * FROM bank_accounts WHERE is_active = TRUE LIMIT 1';
    try {
      const result = await pool.query(query);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error fetching active bank account: ${error.message}`);
    }
  }

  // Get all bank accounts with pagination
  static async getAll(options = {}) {
    const {
      page = 1,
      limit = 50,
      is_active
    } = options;

    const offset = (page - 1) * limit;

    let whereConditions = [];
    let values = [];
    let paramIndex = 1;

    if (is_active !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`);
      values.push(is_active);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM bank_accounts ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const dataQuery = `
      SELECT * FROM bank_accounts 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);
    const dataResult = await pool.query(dataQuery, values);

    return {
      accounts: dataResult.rows,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Add a new bank account
  static async create(bankData) {
    const { bank_name, account_number, account_name, is_active = true } = bankData;
    const query = `
      INSERT INTO bank_accounts (bank_name, account_number, account_name, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [bank_name, account_number, account_name, is_active];
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating bank account: ${error.message}`);
    }
  }

  // Update a bank account
  static async update(id, data) {
    const { bank_name, account_number, account_name, is_active } = data;
    const query = `
      UPDATE bank_accounts
      SET bank_name = $1, account_number = $2, account_name = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    const values = [bank_name, account_number, account_name, is_active, id];
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating bank account: ${error.message}`);
    }
  }

  // Delete a bank account
  static async delete(id) {
    const query = 'DELETE FROM bank_accounts WHERE id = $1';
    try {
      await pool.query(query, [id]);
      return true;
    } catch (error) {
      throw new Error(`Error deleting bank account: ${error.message}`);
    }
  }

  // Set all accounts inactive and activate one
  static async setActive(id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE bank_accounts SET is_active = FALSE');
      await client.query('UPDATE bank_accounts SET is_active = TRUE WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Error setting active bank account: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = BankAccount; 