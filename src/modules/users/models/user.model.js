const pool = require('../../../db/pool');

class User {
  /**
   * Find all users
   */
  static async findAll(limit = 10, offset = 0) {
    const result = await pool.query(
      'SELECT id, email, username, full_name, phone, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  }

  /**
   * Count total users
   */
  static async count() {
    const result = await pool.query('SELECT COUNT(*) FROM users');
    return parseInt(result.rows[0].count);
  }

  /**
   * Find user by ID
   */
  static async findById(id) {
    const result = await pool.query(
      'SELECT id, email, username, full_name, phone, role, is_active, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  /**
   * Create new user
   */
  static async create(userData) {
    const { email, username, password_hash, full_name, phone, role } = userData;
    const result = await pool.query(
      'INSERT INTO users (email, username, password_hash, full_name, phone, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, username, full_name, phone, role, created_at',
      [email, username, password_hash, full_name, phone, role || 'user']
    );
    return result.rows[0];
  }

  /**
   * Update user
   */
  static async update(id, userData) {
    const { full_name, phone, is_active } = userData;
    const result = await pool.query(
      'UPDATE users SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone), is_active = COALESCE($3, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, email, username, full_name, phone, role, is_active, updated_at',
      [full_name, phone, is_active, id]
    );
    return result.rows[0];
  }

  /**
   * Delete user
   */
  static async delete(id) {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  }
}

module.exports = User;

