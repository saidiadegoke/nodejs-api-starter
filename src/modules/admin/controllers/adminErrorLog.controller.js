const AdminErrorLogService = require('../services/adminErrorLog.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, INTERNAL_SERVER_ERROR } = require('../../../shared/constants/statusCodes');

class AdminErrorLogController {
  static async getStats(req, res) {
    try {
      const stats = await AdminErrorLogService.getStats();
      sendSuccess(res, stats, 'Error stats retrieved');
    } catch (error) {
      sendError(res, 'Failed to fetch error stats', INTERNAL_SERVER_ERROR);
    }
  }

  static async list(req, res) {
    try {
      const { page, type, method, path, from, to } = req.query;
      const result = await AdminErrorLogService.list({
        page: parseInt(page) || 1,
        limit: 20,
        type,
        method,
        path,
        from,
        to,
      });
      sendSuccess(res, result, 'Error logs retrieved', OK);
    } catch (error) {
      sendError(res, 'Failed to fetch error logs', INTERNAL_SERVER_ERROR);
    }
  }

  static async getById(req, res) {
    try {
      const entry = await AdminErrorLogService.getById(req.params.id);
      if (!entry) {
        return sendError(res, 'Log entry not found', BAD_REQUEST);
      }
      sendSuccess(res, entry, 'Log detail retrieved', OK);
    } catch (error) {
      sendError(res, 'Failed to fetch log detail', INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = AdminErrorLogController;
