const registrationModel = require('../jupeb/models/registration.model');

function httpError(status, message, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

/** Staging attendance mock JUPEB numbers (269012001 … 269012020). */
const DEFAULT_ATTENDANCE_MOCK_CANDIDATE_CODES = Array.from({ length: 20 }, (_, i) =>
  String(269012001 + i)
);

function attendanceMockStudentsEnabled() {
  const raw = process.env.ATTENDANCE_MOCK_STUDENTS;
  if (raw === undefined || raw === null || raw === '') {
    // Default on for non-production so staging CRP users can hit attendance mocks.
    return process.env.NODE_ENV !== 'production';
  }
  return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
}

function attendanceMockCandidateCodes() {
  const raw = process.env.ATTENDANCE_MOCK_CANDIDATE_CODES;
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_ATTENDANCE_MOCK_CANDIDATE_CODES;
}

/** Stable pick so the same CRP user always maps to the same mock student. */
function mockCandidateCodeForUser(userId) {
  const codes = attendanceMockCandidateCodes();
  if (!codes.length) return null;
  const s = String(userId || '');
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return codes[hash % codes.length];
}

function pickIdentityOverrides(query = {}) {
  const out = {};
  for (const key of ['student_id', 'registration_id', 'candidate_code']) {
    const v = query[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      out[key] = String(v).trim();
    }
  }
  return out;
}

function applyAttendanceIdentity(ctx, { query = {}, forceMock = false } = {}) {
  const overrides = pickIdentityOverrides(query);
  const mockEnabled = forceMock || attendanceMockStudentsEnabled();
  const mapped =
    overrides.candidate_code ||
    (mockEnabled ? mockCandidateCodeForUser(ctx.user_id) : null);

  return {
    ...ctx,
    // Keep CRP ids on the context for local use, but mark explicit upstream overrides
    // separately — attendance rejects CRP registration UUIDs when candidate_code is set.
    explicit_student_id: overrides.student_id || null,
    explicit_registration_id: overrides.registration_id || null,
    candidate_code: mapped || ctx.candidate_code,
    jupeb_candidate_number: mapped || ctx.jupeb_candidate_number,
    attendance_mock_mapped: Boolean(mockEnabled && mapped && !overrides.candidate_code),
  };
}

/**
 * Resolve the authenticated student's latest registration into a normalized
 * context object for Attendance / CRMS providers.
 *
 * Options:
 * - query: optional upstream identity overrides (student_id, registration_id, candidate_code)
 * - forAttendance: when true, staging mock mapping / missing-registration fallback apply
 */
async function resolveStudentContext(userId, { query = {}, forAttendance = false } = {}) {
  if (!userId) {
    throw httpError(401, 'Authentication required');
  }

  const overrides = pickIdentityOverrides(query);
  const mockEnabled = forAttendance && attendanceMockStudentsEnabled();
  const reg = await registrationModel.findLatestForUser(userId);

  if (!reg) {
    // Allow attendance staging without a CRP registration when mocks are on
    // or the client supplied identity overrides.
    if (forAttendance && (mockEnabled || Object.keys(overrides).length > 0)) {
      const synthetic = {
        user_id: userId,
        registration_id: null,
        university_id: null,
        session_id: null,
        candidate_code: null,
        provisional_candidate_code: null,
        jupeb_candidate_number: null,
        status: null,
        subject_combination_id: null,
        synthetic: true,
      };
      return applyAttendanceIdentity(synthetic, { query, forceMock: mockEnabled });
    }

    throw httpError(404, 'No registration found for current user', {
      error_code: 'registration_not_found',
    });
  }

  const base = {
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

  if (!forAttendance) return base;
  return applyAttendanceIdentity(base, { query, forceMock: mockEnabled });
}

module.exports = {
  resolveStudentContext,
  attendanceMockStudentsEnabled,
  attendanceMockCandidateCodes,
  mockCandidateCodeForUser,
  DEFAULT_ATTENDANCE_MOCK_CANDIDATE_CODES,
};
