const CrmsService = require('../services/crms.service');
const { sendSuccess, sendError } = require('../../../utils/utils/response');
const { OK, INTERNAL_SERVER_ERROR } = require('../../../utils/constants/statusCodes');

function statusOf(err) {
  return err.status || err.statusCode || INTERNAL_SERVER_ERROR;
}

class CrmsController {
  static async getHomeSummary(req, res) {
    try {
      console.info('req.user', req.user);
      const data = await CrmsService.getHomeSummary(req.user.user_id, req.query);
      return sendSuccess(res, data, 'CRMS home summary', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async getCourses(req, res) {
    try {
      const data = await CrmsService.getCourses(req.user.user_id, req.query);
      return sendSuccess(res, data, 'CRMS courses', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async getResults(req, res) {
    try {
      const data = await CrmsService.getResults(req.user.user_id, req.query);
      return sendSuccess(res, data, 'CRMS results', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }
}

module.exports = CrmsController;
