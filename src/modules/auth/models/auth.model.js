const pool = require('../../../db/pool');
const bcrypt = require('bcryptjs');

class AuthModel {
  /**
   * Create new user with profile
   */
  static async createUser(userData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const { email, phone, password, first_name, last_name, role } = userData;
      
      // Hash password
      const password_hash = await bcrypt.hash(password, 10);
      
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, phone, password_hash, status) 
         VALUES ($1, $2, $3, 'active') 
         RETURNING id, email, phone, email_verified, phone_verified, status, created_at`,
        [email, phone, password_hash]
      );
      
      const user = userResult.rows[0];
      
      // Create profile
      await client.query(
        `INSERT INTO profiles (user_id, first_name, last_name, display_name) 
         VALUES ($1, $2, $3, $4)`,
        [user.id, first_name, last_name, `${first_name} ${last_name}`]
      );
      
      // Automatically assign "user" role to all new users
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = 'user'
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [user.id]
      );
      
      // Assign additional role if provided (e.g., admin can be added later)
      if (role && role !== 'user') {
        await client.query(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT $1, id FROM roles WHERE name = $2
           ON CONFLICT (user_id, role_id) DO NOTHING`,
          [user.id, role]
        );
      }
      
      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find user by email or phone
   */
  static async findByIdentifier(identifier) {
    const result = await pool.query(
      `SELECT u.*, p.first_name, p.last_name, p.display_name, p.profile_photo_url, p.rating_average
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE (u.email = $1 OR u.phone = $1)
       AND u.deleted_at IS NULL`,
      [identifier]
    );
    return result.rows[0];
  }

  /**
   * Verify password
   */
  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Create user session
   */
  static async createSession(userId, refreshTokenHash, deviceInfo = {}) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    const result = await pool.query(
      `INSERT INTO user_sessions (user_id, refresh_token_hash, device_info, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at, expires_at`,
      [
        userId, 
        refreshTokenHash, 
        JSON.stringify(deviceInfo),
        expiresAt,
        deviceInfo.ip_address || null,
        deviceInfo.user_agent || null
      ]
    );
    
    return result.rows[0];
  }

  /**
   * Find session by ID
   */
  static async findSession(sessionId) {
    const result = await pool.query(
      `SELECT * FROM user_sessions 
       WHERE id = $1 AND is_revoked = false AND expires_at > NOW()`,
      [sessionId]
    );
    return result.rows[0];
  }

  /**
   * Revoke session
   */
  static async revokeSession(sessionId) {
    await pool.query(
      `UPDATE user_sessions 
       SET is_revoked = true, revoked_at = NOW(), revoked_reason = 'user_logout'
       WHERE id = $1`,
      [sessionId]
    );
  }

  /**
   * Get user roles
   */
  static async getUserRoles(userId) {
    const result = await pool.query(
      `SELECT r.name, r.display_name 
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [userId]
    );
    return result.rows;
  }
}

module.exports = AuthModel;

