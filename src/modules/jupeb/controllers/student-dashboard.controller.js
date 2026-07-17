const StudentDashboardService = require('../services/student-dashboard.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, INTERNAL_SERVER_ERROR } = require('../../../shared/constants/statusCodes');

function statusOf(err) {
  return err.status || err.statusCode || INTERNAL_SERVER_ERROR;
}

class StudentDashboardController {
  static async getHome(req, res) {
    try {
      const data = await StudentDashboardService.getHome(req.user.user_id);
      return sendSuccess(res, data, 'Dashboard home', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async getCourses(req, res) {
    try {
      const data = await StudentDashboardService.getCourses(req.user.user_id);
      return sendSuccess(res, data, 'Dashboard courses', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async getResults(req, res) {
    try {
      const data = await StudentDashboardService.getResults(req.user.user_id);
      return sendSuccess(res, data, 'Dashboard results', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }
}

module.exports = StudentDashboardController;
