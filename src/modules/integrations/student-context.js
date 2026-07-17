const registrationModel = require('../jupeb/models/registration.model');

function httpError(status, message, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

/**
 * Resolve the authenticated student's latest registration into a normalized
 * context object for Attendance / CRMS providers.
 */
async function resolveStudentContext(userId) {
  if (!userId) {
    throw httpError(401, 'Authentication required');
  }

  const reg = await registrationModel.findLatestForUser(userId);
  if (!reg) {
    throw httpError(404, 'No registration found for current user', {
      error_code: 'registration_not_found',
    });
  }

  return {
    user_id: userId,
    registration_id: reg.id,
    university_id: reg.university_id,
    session_id: reg.session_id,
    candidate_code: reg.jupeb_candidate_number || reg.provisional_candidate_code || null,
    provisional_candidate_code: reg.provisional_candidate_code || null,
    jupeb_candidate_number: reg.jupeb_candidate_number || null,
    status: reg.status,
    subject_combination_id: reg.subject_combination_id,
  };
}

module.exports = { resolveStudentContext };
