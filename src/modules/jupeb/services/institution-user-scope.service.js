const pool = require('../../../db/pool');
const universityModel = require('../models/university.model');

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
 * Set profiles.jupeb_university_id for institution RBAC data scoping (admin / registrar ops).
 * @param {string} targetUserId
 * @param {string|null} jupebUniversityId - null clears binding
 */
async function setProfileJupebUniversityId(targetUserId, jupebUniversityId) {
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

  const upd = await pool.query(
    `UPDATE profiles SET jupeb_university_id = $2, updated_at = NOW() WHERE user_id = $1
     RETURNING user_id, jupeb_university_id`,
    [targetUserId, nextVal]
  );
  if (upd.rowCount) return upd.rows[0];

  const userExists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [targetUserId]);
  if (!userExists.rowCount) throw httpError(404, 'User not found');

  const ins = await pool.query(
    `INSERT INTO profiles (user_id, jupeb_university_id) VALUES ($1, $2)
     RETURNING user_id, jupeb_university_id`,
    [targetUserId, nextVal]
  );
  return ins.rows[0];
}

module.exports = {
  setProfileJupebUniversityId,
};
