const AdminAuditService = require('../services/adminAudit.service');
const { sendError, sendPaginated } = require('../../../shared/utils/response');

class AdminAuditController {
  static async list(req, res) {
    try {
      const {
        admin_user_id,
        action,
        resource_type,
        start_date,
        end_date,
        page = 1,
        limit = 20,
      } = req.query;

      const { logs, total } = await AdminAuditService.list({
        admin_user_id,
        action,
        resource_type,
        start_date,
        end_date,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return sendPaginated(res, logs, page, limit, total);
    } catch (err) {
      console.error('AdminAuditController.list error:', err);
      return sendError(res, 'Failed to retrieve audit logs', 500);
    }
  }
}

module.exports = AdminAuditController;
