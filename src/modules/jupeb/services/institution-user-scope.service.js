const pool = require('../../../database/pool');
const universityModel = require('../models/university.model');
const UserUniversityModel = require('../../../utils/models/user-university.model');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * Set the user's primary JUPEB institution for RBAC data scoping
 * (admin / registrar ops). Keeps both representations in sync inside one
 * transaction:
 *   - profiles.jupeb_university_id — the denormalized "primary" pointer
 *     read by institution-scope checks, payment joins, etc.
 *   - user_universities           — the join-table source of truth.
 *
 * Passing null clears the scope: the profiles pointer is nulled and the
 * current primary user_universities row is unbound (soft-deleted).
 *
 * @param {string} targetUserId
 * @param {string|null} jupebUniversityId - null clears the binding
 * @param {string|null} actorUserId - the admin performing the change (audit)
 */
async function setProfileJupebUniversityId(targetUserId, jupebUniversityId, actorUserId = null) {
  if (!isUuid(targetUserId)) throw httpError(422, 'user_id must be a valid UUID');

  let nextVal = null;
  if (jupebUniversityId !== null && jupebUniversityId !== '') {
    if (!isUuid(jupebUniversityId)) throw httpError(422, 'jupeb_university_id must be a valid UUID or null');
    const uni = await universityModel.findById(jupebUniversityId);
    if (!uni || uni.status !== 'active') {
      throw httpError(404, 'JUPEB university not found or inactive');
    }
    nextVal = jupebUniversityId;
  }

  const userExists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [targetUserId]);
  if (!userExists.rowCount) throw httpError(404, 'User not found');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Denormalized pointer on profiles (insert the row if absent).
    let row;
    const upd = await client.query(
      `UPDATE profiles SET jupeb_university_id = $2, updated_at = NOW() WHERE user_id = $1
       RETURNING user_id, jupeb_university_id`,
      [targetUserId, nextVal]
    );
    if (upd.rowCount) {
      row = upd.rows[0];
    } else {
      const ins = await client.query(
        `INSERT INTO profiles (user_id, jupeb_university_id) VALUES ($1, $2)
         RETURNING user_id, jupeb_university_id`,
        [targetUserId, nextVal]
      );
      row = ins.rows[0];
    }

    // 2. Source-of-truth join table.
    if (nextVal) {
      await UserUniversityModel.bind(
        { userId: targetUserId, universityId: nextVal, isPrimary: true, createdBy: actorUserId },
        client
      );
    } else {
      // Clearing — unbind whatever the current primary is.
      const primary = await UserUniversityModel.findPrimary(targetUserId, client);
      if (primary) {
        await UserUniversityModel.unbind(targetUserId, primary.university_id, client);
      }
    }

    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  setProfileJupebUniversityId,
};
