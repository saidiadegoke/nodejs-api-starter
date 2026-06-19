const pool = require('../../../db/pool');

const USER_LIST_SELECT = `
  SELECT
    u.id,
    u.email,
    u.phone,
    u.status,
    u.email_verified,
    u.phone_verified,
    u.last_login_at,
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
   * Update user fields across users + profiles tables, then return
   * the full enriched user object via USER_LIST_SELECT.
   */
  static async update(id, userData) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userFields = {};
      if (userData.email !== undefined) userFields.email = userData.email;
      if (userData.phone !== undefined) userFields.phone = userData.phone;
      if (userData.status !== undefined) userFields.status = userData.status;

      if (Object.keys(userFields).length) {
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(userFields)) {
          sets.push(`${k} = $${i++}`);
          vals.push(v);
        }
        sets.push('updated_at = CURRENT_TIMESTAMP');
        vals.push(id);
        await client.query(
          `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} AND deleted_at IS NULL`,
          vals
        );
      }

      const profileFields = {};
      if (userData.first_name !== undefined) profileFields.first_name = userData.first_name;
      if (userData.last_name !== undefined) profileFields.last_name = userData.last_name;
      if (userData.display_name !== undefined) profileFields.display_name = userData.display_name;

      if (Object.keys(profileFields).length) {
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(profileFields)) {
          sets.push(`${k} = $${i++}`);
          vals.push(v);
        }
        sets.push('updated_at = CURRENT_TIMESTAMP');
        vals.push(id);
        await client.query(
          `UPDATE profiles SET ${sets.join(', ')} WHERE user_id = $${i}`,
          vals
        );
      }

      await client.query('COMMIT');

      const result = await pool.query(
        `${USER_LIST_SELECT} WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [id]
      );
      return result.rows[0];
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Delete user
   */
  static async delete(id) {
    const result = await pool.query(
      'UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [id]
    );
    return result.rows[0];
  }
}

module.exports = User;
