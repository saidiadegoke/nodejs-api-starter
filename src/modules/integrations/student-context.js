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
    registration_id: reg.id,
    user_id: userId,
    session_id: reg.session_id,
    university_id: reg.university_id,
    candidate_code: reg.jupeb_candidate_number || reg.provisional_candidate_code || null,
    attendance_registration_code: reg.attendance_registration_code || null,
    student_id: reg.attendance_student_id || null,
    is_result_released: Boolean(reg.is_result_released),
  };
}

module.exports = {
  resolveStudentContext,
};
