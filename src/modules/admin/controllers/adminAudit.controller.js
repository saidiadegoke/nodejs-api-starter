const AdminAuditService = require('../services/adminAudit.service');
const { sendError, sendPaginated } = require('../../../shared/utils/response');

class AdminAuditController {
  static async list(req, res) {
    try {
      const {
        admin_user_id,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        university_id,
        jupeb_university_id,
        start_date,
        end_date,
        q,
        page = 1,
        limit = 20,
      } = req.query;

      const { logs, total, page: safePage, limit: safeLimit } = await AdminAuditService.list(
        {
          admin_user_id,
          actor_user_id,
          action,
          resource_type,
          resource_id,
          university_id,
          jupeb_university_id,
          start_date,
          end_date,
          q,
          page,
          limit,
        },
        req.user && req.user.user_id
      );

      return sendPaginated(res, logs, safePage, safeLimit, total);
    } catch (err) {
      console.error('AdminAuditController.list error:', err);
      return sendError(res, err.message || 'Failed to retrieve audit logs', err.status || 500);
    }
  }

  static async exportCsv(req, res) {
    try {
      const {
        admin_user_id,
        actor_user_id,
        action,
        resource_type,
        resource_id,
        university_id,
        jupeb_university_id,
        start_date,
        end_date,
        q,
      } = req.query;

      const csv = await AdminAuditService.exportCsv(
        {
          admin_user_id,
          actor_user_id,
          action,
          resource_type,
          resource_id,
          university_id,
          jupeb_university_id,
          start_date,
          end_date,
          q,
        },
        req.user && req.user.user_id
      );

      const filename = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(csv);
    } catch (err) {
      console.error('AdminAuditController.exportCsv error:', err);
      return sendError(res, err.message || 'Failed to export audit logs', err.status || 500);
    }
  }
}

module.exports = AdminAuditController;
