const pool = require('../../../db/pool');
const { getUserRoles } = require('../../../shared/middleware/rbac.middleware');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function getProfileJupebUniversityId(userId) {
  const r = await pool.query(`SELECT jupeb_university_id FROM profiles WHERE user_id = $1`, [userId]);
  return r.rows[0]?.jupeb_university_id || null;
}

/**
 * Enforce profiles.jupeb_university_id for program_director / institution_admin.
 * Admins bypass scope.
 */
async function assertInstitutionUniversityAccess(userId, universityId) {
  const roles = await getUserRoles(userId);
  if (roles.includes('admin') || roles.includes('super_admin')) return;
  if (!roles.includes('program_director') && !roles.includes('institution_admin')) return;
  const scoped = await getProfileJupebUniversityId(userId);
  if (!scoped) {
    throw httpError(403, 'Institution users must have profiles.jupeb_university_id set for JUPEB actions');
  }
  if (String(scoped) !== String(universityId)) {
    throw httpError(403, 'University is outside your institution scope');
  }
}

/**
 * For list endpoints: if caller is scoped institution role, force their university id.
 */
async function effectiveInstitutionListUniversityId(userId, queryUniversityId) {
  const roles = await getUserRoles(userId);
  if (roles.includes('admin') || roles.includes('super_admin')) {
    return queryUniversityId || null;
  }
  if (!roles.includes('program_director') && !roles.includes('institution_admin')) {
    return queryUniversityId || null;
  }
  const scoped = await getProfileJupebUniversityId(userId);
  if (!scoped) {
    throw httpError(403, 'Institution users must have profiles.jupeb_university_id set for JUPEB actions');
  }
  if (queryUniversityId && String(queryUniversityId) !== String(scoped)) {
    throw httpError(403, 'Cannot list registrations for a university outside your scope');
  }
  return scoped;
}

module.exports = {
  getProfileJupebUniversityId,
  assertInstitutionUniversityAccess,
  effectiveInstitutionListUniversityId,
};
