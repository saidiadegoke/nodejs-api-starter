const AdminSettingsService = require('../services/adminSettings.service');
const AdminAuditService = require('../services/adminAudit.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');

class AdminSettingsController {
  static async getAll(req, res) {
    try {
      const settings = await AdminSettingsService.getAll();
      return sendSuccess(res, settings, 'Settings retrieved');
    } catch (err) {
      console.error('AdminSettingsController.getAll error:', err);
      return sendError(res, 'Failed to retrieve settings', 500);
    }
  }

  static async update(req, res) {
    try {
      const { key, value, description } = req.body;

      if (!key) return sendError(res, 'Setting key is required', 400);
      if (value === undefined) return sendError(res, 'Setting value is required', 400);

      const adminUserId = req.user.user_id;
      const setting = await AdminSettingsService.set(key, value, description, adminUserId);

      await AdminAuditService.log(
        adminUserId,
        'update_setting',
        'platform_setting',
        key,
        { value, description },
        req
      );

      return sendSuccess(res, setting, 'Setting updated');
    } catch (err) {
      console.error('AdminSettingsController.update error:', err);
      return sendError(res, 'Failed to update setting', 500);
    }
  }
}

module.exports = AdminSettingsController;
