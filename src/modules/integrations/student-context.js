const registrationModel = require('../jupeb/models/registration.model');

function httpError(status, message, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

const institutionScope = require('../jupeb/utils/institution-scope');
const rbacMiddleware = require('../../shared/middleware/rbac.middleware');

/**
 * Resolve the authenticated student's latest registration into a normalized
 * context object for Attendance / CRMS providers.
 *
 * Can resolve by candidate_code (for admins, institution staff, or candidate lookup),
 * or by userId (authenticated student).
 */
async function resolveStudentContext(userIdOrOptions, maybeOptions = {}) {
  let userId = null;
  let candidateCode = null;

  if (typeof userIdOrOptions === 'object' && userIdOrOptions !== null) {
    userId = userIdOrOptions.userId || userIdOrOptions.user_id || null;
    candidateCode = userIdOrOptions.candidateCode || userIdOrOptions.candidate_code || null;
  } else {
    userId = userIdOrOptions || null;
    candidateCode = maybeOptions.candidateCode || maybeOptions.candidate_code || null;
  }

  if (candidateCode) {
    candidateCode = String(candidateCode).trim();
  }

  if (!userId && !candidateCode) {
    throw httpError(401, 'Authentication required');
  }

  let reg = null;

  if (candidateCode) {
    reg = await registrationModel.findByCandidateCode(candidateCode);
    if (!reg) {
      throw httpError(404, `No registration found for candidate code: ${candidateCode}`, {
        error_code: 'registration_not_found',
      });
    }

    if (userId) {
      const passedRoles = (Array.isArray(maybeOptions.roles) && maybeOptions.roles) ||
        (typeof userIdOrOptions === 'object' && Array.isArray(userIdOrOptions?.roles) && userIdOrOptions.roles);
      const roles = passedRoles || (await rbacMiddleware.getUserRoles(userId));
      const isStaffOrAdmin = roles.some((r) =>
        ['admin', 'super_admin', 'program_director', 'institution_admin', 'registrar'].includes(r)
      );
      if (!isStaffOrAdmin && reg.user_id && String(reg.user_id) !== String(userId)) {
        throw httpError(403, 'You are not authorized to access this candidate', {
          error_code: 'unauthorized_candidate_access',
        });
      }
      await institutionScope.assertInstitutionUniversityAccess(userId, reg.university_id);
    }
  } else {
    reg = await registrationModel.findLatestForUser(userId);
    if (!reg) {
      throw httpError(404, 'No registration found for current user', {
        error_code: 'registration_not_found',
      });
    }
  }

  return {
    registration_id: reg.id,
    user_id: reg.user_id || userId,
    session_id: reg.session_id,
    university_id: reg.university_id,
    candidate_code: reg.jupeb_candidate_number || reg.provisional_candidate_code || reg.institution_issued_code || null,
    attendance_registration_code: reg.attendance_registration_code || null,
    student_id: reg.attendance_student_id || null,
    is_result_released: Boolean(reg.is_result_released),
  };
}

module.exports = {
  resolveStudentContext,
};
