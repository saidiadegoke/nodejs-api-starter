const registrationModel = require('../models/registration.model');
const courseModel = require('../models/course.model');
const registrationResultModel = require('../models/registration-result.model');
const registrationScoreModel = require('../models/registration-score.model');
const {
  isValidGrade,
  normalizeGrade,
  gradeToPlusOneAwarded,
  aggregateScoresFromResults,
} = require('../utils/academic-scoring');
const { getUserRoles } = require('../../../shared/middleware/rbac.middleware');

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

const ROLE_RESULT_ENTRY = new Set(['registrar', 'institution_admin', 'admin', 'super_admin']);
const ROLE_COURSE_WRITE = new Set(['registrar', 'admin', 'super_admin']);
const ROLE_RECOMPUTE = new Set(['registrar', 'admin', 'super_admin']);
const ROLE_SCORE_PRIVILEGED_READ = new Set([
  'registrar',
  'institution_admin',
  'program_director',
  'admin',
  'super_admin',
]);

async function userHasAnyRole(userId, set) {
  const roles = await getUserRoles(userId);
  return roles.some((r) => set.has(r));
}

class AcademicService {
  async listCourses() {
    return courseModel.listActive();
  }

  async createCourse(body, userId) {
    const ok = await userHasAnyRole(userId, ROLE_COURSE_WRITE);
    if (!ok) throw httpError(403, 'Forbidden');
    const code = body && body.code ? String(body.code).trim() : '';
    const title = body && body.title ? String(body.title).trim() : '';
    if (!code || !title) throw httpError(422, 'code and title are required');
    try {
      return await courseModel.create({ code, title, status: 'active' });
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'Course code already exists');
      throw e;
    }
  }

  async assertRegistrationExists(registrationId) {
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    return reg;
  }

  async assertCanReadAcademic(registration, userId) {
    if (registration.user_id && registration.user_id === userId) return;
    const ok = await userHasAnyRole(userId, ROLE_SCORE_PRIVILEGED_READ);
    if (!ok) throw httpError(403, 'Forbidden');
  }

  async assertCanEnterResults(userId) {
    const ok = await userHasAnyRole(userId, ROLE_RESULT_ENTRY);
    if (!ok) throw httpError(403, 'Forbidden');
  }

  async assertCanRecompute(userId) {
    const ok = await userHasAnyRole(userId, ROLE_RECOMPUTE);
    if (!ok) throw httpError(403, 'Forbidden');
  }

  async listResults(registrationId, userId) {
    const reg = await this.assertRegistrationExists(registrationId);
    await this.assertCanReadAcademic(reg, userId);
    return registrationResultModel.findByRegistrationId(registrationId);
  }

  async getScore(registrationId, userId) {
    const reg = await this.assertRegistrationExists(registrationId);
    await this.assertCanReadAcademic(reg, userId);
    const results = await registrationResultModel.findByRegistrationId(registrationId);
    const aggregate = aggregateScoresFromResults(results);
    const snapshot = await registrationScoreModel.findByRegistrationId(registrationId);
    return {
      registration_id: registrationId,
      results,
      aggregate,
      snapshot,
    };
  }

  async upsertResults(registrationId, body, userId) {
    await this.assertCanEnterResults(userId);
    await this.assertRegistrationExists(registrationId);
    const results = body && Array.isArray(body.results) ? body.results : null;
    if (!results || !results.length) {
      throw httpError(422, 'results must be a non-empty array of { course_id, grade }');
    }
    const out = [];
    for (const row of results) {
      if (!row || !isUuid(row.course_id)) {
        throw httpError(422, 'Each result requires a valid course_id UUID');
      }
      const grade = row.grade !== undefined ? normalizeGrade(row.grade) : '';
      if (!isValidGrade(grade)) {
        throw httpError(422, `Invalid grade for course ${row.course_id}; use A–F`);
      }
      const course = await courseModel.findById(row.course_id);
      if (!course || course.status !== 'active') {
        throw httpError(404, `Course not found or inactive: ${row.course_id}`);
      }
      const plus = gradeToPlusOneAwarded(grade);
      const saved = await registrationResultModel.upsertRow({
        registration_id: registrationId,
        course_id: row.course_id,
        grade,
        plus_one_awarded: plus,
        entered_by: userId,
      });
      out.push(saved);
    }
    await this._recomputeSnapshot(registrationId);
    return out;
  }

  async recomputeScore(registrationId, userId) {
    await this.assertCanRecompute(userId);
    await this.assertRegistrationExists(registrationId);
    return this._recomputeSnapshot(registrationId);
  }

  async _recomputeSnapshot(registrationId) {
    const results = await registrationResultModel.findByRegistrationId(registrationId);
    const aggregate = aggregateScoresFromResults(results);
    return registrationScoreModel.upsertSnapshot({
      registration_id: registrationId,
      passed_courses_count: aggregate.passed_courses_count,
      failed_courses_count: aggregate.failed_courses_count,
      plus_one_total: aggregate.plus_one_total,
    });
  }
}

module.exports = new AcademicService();
