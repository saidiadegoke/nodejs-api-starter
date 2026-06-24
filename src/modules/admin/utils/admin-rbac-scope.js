const { getUserRoles } = require('../../../shared/middleware/rbac.middleware');
const { getProfileJupebUniversityId } = require('../../jupeb/utils/institution-scope');

const INSTITUTION_SCOPED_ROLES = new Set(['institution_admin', 'program_director']);
const FULL_ACCESS_ROLES = new Set(['admin', 'super_admin', 'registrar']);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Resolve admin RBAC list/mutation scope for the caller.
 *
 * - admin / super_admin / registrar → full visibility
 * - institution_admin / program_director → university-scoped users;
 *   roles limited to system roles + custom roles created by caller
 *
 * @returns {Promise<{ mode: 'full' } | { mode: 'institution', universityId: string, actorId: string }>}
 */
async function resolveAdminRbacScope(userId) {
  const roles = await getUserRoles(userId);
  if (roles.some((r) => FULL_ACCESS_ROLES.has(r))) {
    return { mode: 'full' };
  }
  if (!roles.some((r) => INSTITUTION_SCOPED_ROLES.has(r))) {
    return { mode: 'full' };
  }

  const universityId = await getProfileJupebUniversityId(userId);
  if (!universityId) {
    throw httpError(
      403,
      'Institution users must have profiles.jupeb_university_id set for admin user and role management'
    );
  }

  return { mode: 'institution', universityId, actorId: userId };
}

/**
 * @param {object} role - role row from DB
 * @param {{ mode: string, actorId?: string }} scope
 */
function assertRoleAccessible(role, scope) {
  if (!role) throw httpError(404, 'Role not found');
  if (scope.mode === 'full') return;
  if (role.is_system) return;
  if (String(role.created_by) !== String(scope.actorId)) {
    throw httpError(403, 'Access denied. You can only manage roles you created.');
  }
}

/**
 * @param {object|null} user - user row with jupeb_university_id from profile
 * @param {{ mode: string, universityId?: string }} scope
 */
function assertUserAccessible(user, scope) {
  if (!user) throw httpError(404, 'User not found');
  if (scope.mode === 'full') return;
  if (String(user.jupeb_university_id) !== String(scope.universityId)) {
    throw httpError(403, 'Access denied. User is outside your institution scope.');
  }
}

module.exports = {
  resolveAdminRbacScope,
  assertRoleAccessible,
  assertUserAccessible,
  INSTITUTION_SCOPED_ROLES,
  FULL_ACCESS_ROLES,
};
