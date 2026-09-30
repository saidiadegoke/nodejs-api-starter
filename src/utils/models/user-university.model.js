/**
 * User ↔ University associations.
 *
 * Source of truth for which universities a user is associated with.
 * profiles.jupeb_university_id is kept as the denormalized "primary"
 * pointer for back-compat (institution-scope lookups, payment joins).
 */

const pool = require('../../database/pool');

class UserUniversityModel {
  /**
   * Bind a user to a university. Optionally mark as primary, in which case
   * any existing primary for the same user is demoted in the same query.
   * Caller may pass an open transactional client.
   *
   * Returns the inserted (or existing, if already bound) row.
   */
  static async bind({ userId, universityId, role = null, isPrimary = false, createdBy = null }, client = pool) {
    if (isPrimary) {
      await client.query(
        `UPDATE user_universities
            SET is_primary = false, updated_at = NOW()
          WHERE user_id = $1 AND deleted_at IS NULL AND is_primary = true`,
        [userId]
      );
    }
    const result = await client.query(
      `INSERT INTO user_universities (user_id, university_id, role, is_primary, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, university_id) DO UPDATE
         SET role        = COALESCE(EXCLUDED.role, user_universities.role),
             is_primary  = EXCLUDED.is_primary OR user_universities.is_primary,
             deleted_at  = NULL,
             updated_at  = NOW()
       RETURNING *`,
      [userId, universityId, role, isPrimary, createdBy]
    );
    return result.rows[0];
  }

  /** Active bindings for a user, primary first then most recent. */
  static async listActiveByUser(userId, client = pool) {
    const result = await client.query(
      `SELECT uu.*, u.name AS university_name, u.short_name
         FROM user_universities uu
         JOIN jupeb_universities u ON u.id = uu.university_id
        WHERE uu.user_id = $1 AND uu.deleted_at IS NULL
        ORDER BY uu.is_primary DESC, uu.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async findPrimary(userId, client = pool) {
    const result = await client.query(
      `SELECT * FROM user_universities
        WHERE user_id = $1 AND is_primary = true AND deleted_at IS NULL
        LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  static async unbind(userId, universityId, client = pool) {
    const result = await client.query(
      `UPDATE user_universities
          SET deleted_at = NOW(), is_primary = false, updated_at = NOW()
        WHERE user_id = $1 AND university_id = $2 AND deleted_at IS NULL
        RETURNING *`,
      [userId, universityId]
    );
    return result.rows[0] || null;
  }
}

module.exports = UserUniversityModel;
