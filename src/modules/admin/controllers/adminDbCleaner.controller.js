const DbCleanerService = require('../services/db-cleaner.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { INTERNAL_SERVER_ERROR } = require('../../../shared/constants/statusCodes');

class AdminDbCleanerController {
  static listTables(req, res) {
    try {
      const tables = DbCleanerService.getConfiguredTables();
      return sendSuccess(res, tables, 'Configured clearable tables retrieved');
    } catch (err) {
      return sendError(res, err.message, INTERNAL_SERVER_ERROR);
    }
  }

  static async clearDb(req, res) {
    try {
      const { session_id, all, dry_run, include_users, tables } = req.body || {};

      if (!session_id && !all) {
        return sendError(
          res,
          'Must provide either session_id or all: true',
          422
        );
      }

      let result;
      if (session_id) {
        result = await DbCleanerService.clearBySession(session_id, {
          dryRun: !!dry_run,
        });
      } else {
        result = await DbCleanerService.clearAll({
          dryRun: !!dry_run,
          includeNonAdminUsers: include_users !== false,
          customTables: Array.isArray(tables) && tables.length ? tables : null,
        });
      }

      return sendSuccess(res, result, dry_run ? 'Dry run completed' : 'Database cleared successfully');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = AdminDbCleanerController;
