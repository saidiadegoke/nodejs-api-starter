const pool = require('../../../db/pool');

const USER_LIST_SELECT = `
  SELECT
    u.id,
    u.email,
    u.phone,
    u.status,
    u.email_verified,
    u.phone_verified,
    u.created_at,
    u.updated_at,
    p.first_name,
    p.last_name,
    p.display_name,
    p.jupeb_university_id,
    COALESCE(
      (
        SELECT array_agg(r.name ORDER BY r.name)
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = u.id
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      ),
      ARRAY[]::text[]
    ) AS roles
  FROM users u
  LEFT JOIN profiles p ON u.id = p.user_id
`;

class User {
  /**
   * Find all users (non-deleted) with profile and role names
   */
  static async findAll(limit = 10, offset = 0, q = null) {
    const values = [limit, offset];
    let searchClause = '';
    if (q) {
      const pattern = `%${q}%`;
      searchClause = `
        AND (
          u.email ILIKE $3
          OR p.first_name ILIKE $3
          OR p.last_name ILIKE $3
          OR p.display_name ILIKE $3
        )`;
      values.push(pattern);
    }
    const result = await pool.query(
      `${USER_LIST_SELECT}
       WHERE u.deleted_at IS NULL${searchClause}
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      values
    );
    return result.rows;
  }

  /**
   * Count total non-deleted users
   */
  static async count(q = null) {
    if (q) {
      const pattern = `%${q}%`;
      const result = await pool.query(
        `SELECT COUNT(*) FROM users u
         LEFT JOIN profiles p ON u.id = p.user_id
         WHERE u.deleted_at IS NULL
         AND (
           u.email ILIKE $1
           OR p.first_name ILIKE $1
           OR p.last_name ILIKE $1
           OR p.display_name ILIKE $1
         )`,
        [pattern]
      );
      return parseInt(result.rows[0].count, 10);
    }
    const result = await pool.query(
      'SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Find user by ID with profile and roles
   */
  static async findById(id) {
    const result = await pool.query(
      `${USER_LIST_SELECT}
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    return result.rows[0];
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );
    return result.rows[0];
  }

  /**
   * Create new user
   */
  static async create(userData) {
    const { email, username, password_hash, full_name, phone, role } = userData;
    if (!role) {
      throw new Error('Role is required');
    }
    const result = await pool.query(
      'INSERT INTO users (email, username, password_hash, full_name, phone, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, username, full_name, phone, role, created_at',
      [email, username, password_hash, full_name, phone, role]
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
