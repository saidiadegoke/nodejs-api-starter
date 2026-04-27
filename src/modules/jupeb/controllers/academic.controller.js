const academicService = require('../services/academic.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { CREATED, INTERNAL_SERVER_ERROR } = require('../../../shared/constants/statusCodes');

class AcademicController {
  static async listCourses(_req, res) {
    try {
      const rows = await academicService.listCourses();
      return sendSuccess(res, rows, 'Courses retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async createCourse(req, res) {
    try {
      const row = await academicService.createCourse(req.body, req.user.user_id);
      return sendSuccess(res, row, 'Course created', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async listResults(req, res) {
    try {
      const rows = await academicService.listResults(req.params.registrationId, req.user.user_id);
      return sendSuccess(res, rows, 'Results retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async upsertResults(req, res) {
    try {
      const rows = await academicService.upsertResults(req.params.registrationId, req.body, req.user.user_id);
      return sendSuccess(res, rows, 'Results saved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getScore(req, res) {
    try {
      const data = await academicService.getScore(req.params.registrationId, req.user.user_id);
      return sendSuccess(res, data, 'Score breakdown');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async recomputeScore(req, res) {
    try {
      const row = await academicService.recomputeScore(req.params.registrationId, req.user.user_id);
      return sendSuccess(res, row, 'Score recomputed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = AcademicController;
