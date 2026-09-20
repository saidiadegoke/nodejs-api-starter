const resultsReleaseModel = require('../models/results-release.model');
const sessionModel = require('../models/session.model');
const { assertInstitutionUniversityAccess, effectiveInstitutionListUniversityId } = require('../utils/institution-scope');

function httpError(status, message, details = null) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  if (details) err.details = details;
  return err;
}

class ResultsReleaseService {
  async releaseToInstitutions(userId, { academic_year, session_id, release = true } = {}) {
    const session = await resultsReleaseModel.findSession(session_id || academic_year);
    if (!session) {
      throw httpError(404, 'Academic session not found', { error_code: 'session_not_found' });
    }

    const updated = await resultsReleaseModel.updateSessionRelease(session.id, release, userId);

    // Audit event log
    try {
      await sessionModel.insertEvent(session.id, 'results_released_to_institutions', {
        released: Boolean(release),
        academic_year: session.academic_year,
        released_by: userId,
      }, userId);
    } catch {
      // Non-blocking audit log
    }

    return {
      session_id: updated.id,
      academic_year: updated.academic_year,
      results_released_to_institutions: updated.results_released_to_institutions,
      results_released_at: updated.results_released_at,
      released_by: updated.results_released_by,
    };
  }

  async getInstitutionResults(userId, query = {}) {
    const session = await resultsReleaseModel.findSession(query.session_id || query.academic_year);
    if (!session) {
      throw httpError(404, 'Academic session not found', { error_code: 'session_not_found' });
    }

    const universityId = await effectiveInstitutionListUniversityId(userId, query.university_id);
    if (!universityId) {
      throw httpError(400, 'University ID is required for institution results', {
        error_code: 'university_id_required',
      });
    }

    // Tier 1 Gate: JUPEB Registrar release
    if (!session.results_released_to_institutions) {
      throw httpError(
        403,
        'JUPEB has not yet released the results for this academic session to institutions.',
        {
          error_code: 'RESULTS_NOT_YET_RELEASED',
          academic_year: session.academic_year,
        }
      );
    }

    const instSession = await resultsReleaseModel.findInstitutionSessionResult(session.id, universityId);
    const candidatesResult = await resultsReleaseModel.listInstitutionCandidates(session.id, universityId, {
      q: query.q,
      limit: Math.min(Number(query.limit) || 50, 200),
      offset: Number(query.offset) || 0,
    });

    return {
      session: {
        id: session.id,
        academic_year: session.academic_year,
        results_released_to_institutions: session.results_released_to_institutions,
        results_released_at: session.results_released_at,
      },
      institution_release: {
        university_id: universityId,
        results_released_to_students: Boolean(instSession?.results_released_to_students),
        students_results_released_at: instSession?.students_results_released_at || null,
      },
      pagination: {
        total: candidatesResult.total,
        limit: Math.min(Number(query.limit) || 50, 200),
        offset: Number(query.offset) || 0,
      },
      candidates: candidatesResult.candidates,
    };
  }

  async releaseToStudents(userId, { academic_year, session_id, release_all = true, registration_ids = [], university_id } = {}) {
    const session = await resultsReleaseModel.findSession(session_id || academic_year);
    if (!session) {
      throw httpError(404, 'Academic session not found', { error_code: 'session_not_found' });
    }

    // Precondition: Tier 1 release must have already occurred
    if (!session.results_released_to_institutions) {
      throw httpError(
        400,
        'Cannot release results to students before central JUPEB release.',
        {
          error_code: 'CENTRAL_RELEASE_REQUIRED',
          academic_year: session.academic_year,
        }
      );
    }

    const universityId = await effectiveInstitutionListUniversityId(userId, university_id);
    if (!universityId) {
      throw httpError(400, 'University ID is required to release student results', {
        error_code: 'university_id_required',
      });
    }

    await assertInstitutionUniversityAccess(userId, universityId);

    let releasedCount = 0;
    let instRecord = null;

    if (release_all) {
      instRecord = await resultsReleaseModel.upsertInstitutionSessionResult(session.id, universityId, true, userId);
      const releasedIds = await resultsReleaseModel.releaseAllRegistrationsForInstitution(session.id, universityId, userId);
      releasedCount = releasedIds.length;
    } else if (Array.isArray(registration_ids) && registration_ids.length > 0) {
      const releasedIds = await resultsReleaseModel.releaseRegistrationsByIds(
        session.id,
        universityId,
        registration_ids,
        userId
      );
      releasedCount = releasedIds.length;
      instRecord = await resultsReleaseModel.findInstitutionSessionResult(session.id, universityId);
    } else {
      throw httpError(400, 'Either release_all must be true or registration_ids must be provided', {
        error_code: 'invalid_release_parameters',
      });
    }

    return {
      session_id: session.id,
      academic_year: session.academic_year,
      university_id: universityId,
      release_all: Boolean(release_all),
      released_count: releasedCount,
      results_released_to_students: Boolean(instRecord?.results_released_to_students),
      students_results_released_at: instRecord?.students_results_released_at || null,
    };
  }

  async checkStudentReleaseAccess(studentContext) {
    const { session_id, university_id, registration_id } = studentContext;

    if (!session_id || !university_id || !registration_id) {
      return true; // No gating info available, permit upstream to resolve
    }

    const status = await resultsReleaseModel.checkStudentReleaseStatus(
      session_id,
      university_id,
      registration_id
    );

    if (!status) {
      return true;
    }

    // Gate 1: Check if Registrar has released results to institutions
    if (!status.results_released_to_institutions) {
      throw httpError(
        403,
        'Results for the active session have not yet been released by JUPEB.',
        {
          error_code: 'RESULTS_NOT_YET_RELEASED',
        }
      );
    }

    // Gate 2: Check if the student's institution has released results to students (either bulk or candidate)
    if (!status.institution_released_to_all && !status.registration_released) {
      throw httpError(
        403,
        'Results have not yet been released by your institution. Please contact your institution coordinator or check clearance status.',
        {
          error_code: 'INSTITUTION_HOLD',
        }
      );
    }

    return true;
  }
}

module.exports = new ResultsReleaseService();
