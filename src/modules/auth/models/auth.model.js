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

      // Role is required; assigned by the creation flow (e.g. register step)
      if (!role) {
        await client.query('ROLLBACK');
        throw new Error('Role is required');
      }
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = $2
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [user.id, role]
      );

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
   * Find a user by any of the supported login identifiers:
   *   - email                                          (case-insensitive)
   *   - phone
   *   - jupeb_registrations.provisional_candidate_code (interim reg no.)
   *   - jupeb_registrations.jupeb_candidate_number     (final matric no.)
   *
   * Lockdown rule: once a user has been assigned a `jupeb_candidate_number`
   * on any of their registrations, that matric becomes the ONLY identifier
   * that resolves to them. Email, phone, and provisional reg-codes stop
   * working — login attempts via those return the same "no such user"
   * response as a wrong identifier. This mirrors how real Nigerian
   * institutions hand off from interim portals to matric-only access.
   *
   * Re-entry exception: a student who already has a matric (from a prior
   * session) needs email / phone / code login to claim a NEW session's
   * code. We detect re-entry as "the user has an in-progress registration
   * without a matric yet" — i.e. some row with
   * `jupeb_candidate_number IS NULL` and a non-terminal status. While
   * such a row exists, the lockdown is released and any identifier
   * (including the prior matric) resolves the user.
   *
   * The JUPEB join is wrapped in a fallback so this still works in
   * environments where `jupeb_registrations` hasn't been migrated (e.g.
   * unit-test setup running against an empty DB).
   */
  static async findByIdentifier(identifier) {
    if (identifier === undefined || identifier === null || identifier === '') return undefined;
    const value = String(identifier).trim();

    try {
      // Single query — finds the user via any of the supported shapes,
      // then enforces the matric-lockdown rule via has_matric.
      //
      // has_matric: true ⇔ the user has ANY registration with a non-null
      // jupeb_candidate_number. When true, the WHERE clause demands the
      // supplied identifier matches one of the user's matric numbers —
      // unless `in_progress_no_matric` is also true, in which case the
      // user is mid-re-registration and the lockdown is released.
      const result = await pool.query(
        `WITH candidates AS (
           SELECT u.id AS user_id,
                  -- Matric-only lockdown applies to candidates (student /
                  -- user roles). Admins, registrars, program directors and
                  -- institution admins must always be reachable by email /
                  -- phone even if a test or admin tool incidentally
                  -- attached them to a registration.
                  EXISTS (
                    SELECT 1 FROM user_roles ur
                      JOIN roles ro ON ro.id = ur.role_id
                     WHERE ur.user_id = u.id
                       AND ro.name NOT IN ('student', 'user')
                  ) AS has_admin_role,
                  EXISTS (
                    SELECT 1 FROM jupeb_registrations rm
                     WHERE rm.user_id = u.id
                       AND rm.jupeb_candidate_number IS NOT NULL
                  ) AS has_matric,
                  -- Re-entry signal: user has an in-progress registration
                  -- (non-terminal, no matric yet). When present alongside
                  -- has_matric, the user is starting a fresh registration
                  -- in a new session and needs email/phone/code login.
                  EXISTS (
                    SELECT 1 FROM jupeb_registrations rip
                     WHERE rip.user_id = u.id
                       AND rip.jupeb_candidate_number IS NULL
                       AND rip.status NOT IN ('approved', 'rejected', 'withdrawn')
                  ) AS in_progress_no_matric,
                  EXISTS (
                    SELECT 1 FROM jupeb_registrations rmx
                     WHERE rmx.user_id = u.id
                       AND rmx.jupeb_candidate_number IS NOT NULL
                       AND UPPER(rmx.jupeb_candidate_number) = UPPER($1)
                  ) AS matric_match,
                  EXISTS (
                    SELECT 1 FROM jupeb_registrations rp
                     WHERE rp.user_id = u.id
                       AND UPPER(rp.provisional_candidate_code) = UPPER($1)
                  ) AS provisional_match
             FROM users u
            WHERE u.deleted_at IS NULL
              AND (
                    LOWER(u.email) = LOWER($1)
                 OR u.phone = $1
                 OR EXISTS (
                      SELECT 1 FROM jupeb_registrations rr
                       WHERE rr.user_id = u.id
                         AND (
                               UPPER(rr.provisional_candidate_code) = UPPER($1)
                            OR UPPER(rr.jupeb_candidate_number)    = UPPER($1)
                         )
                    )
              )
         )
         SELECT u.*, p.first_name, p.last_name, p.display_name, p.profile_photo_url
           FROM candidates c
           JOIN users u ON u.id = c.user_id
           LEFT JOIN profiles p ON u.id = p.user_id
          WHERE
              -- Admins / registrars / institution admins: any identifier
              -- resolves (no lockdown).
              c.has_admin_role = TRUE
           OR
              -- Candidate with matric AND a fresh in-progress registration:
              -- treat like a candidate without matric — any identifier works.
              (c.has_matric = TRUE AND c.in_progress_no_matric = TRUE AND (
                    LOWER(u.email) = LOWER($1)
                 OR u.phone = $1
                 OR c.provisional_match = TRUE
                 OR c.matric_match = TRUE
              ))
           OR
              -- Candidate with matric and no in-progress registration:
              -- ONLY matric resolves (post-finalization lockdown).
              (c.has_matric = TRUE AND c.in_progress_no_matric = FALSE AND c.matric_match = TRUE)
           OR
              -- Candidate without matric yet: email / phone / reg-code.
              (c.has_matric = FALSE AND (
                    LOWER(u.email) = LOWER($1)
                 OR u.phone = $1
                 OR c.provisional_match = TRUE
              ))
          LIMIT 1`,
        [value]
      );
      if (result.rows[0]) return result.rows[0];
      return undefined;
    } catch (err) {
      // Fall back to the original email/phone-only query when the JUPEB
      // tables aren't present (e.g. fresh schema without migration 002).
      // `42P01` = undefined table.
      if (err && err.code === '42P01') {
        const result = await pool.query(
          `SELECT u.*, p.first_name, p.last_name, p.display_name, p.profile_photo_url
             FROM users u
             LEFT JOIN profiles p ON u.id = p.user_id
            WHERE u.deleted_at IS NULL
              AND (LOWER(u.email) = LOWER($1) OR u.phone = $1)
            LIMIT 1`,
          [value]
        );
        return result.rows[0];
      }
      throw err;
    }
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

