const StatusService = require('../services/status.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } = require('../../../shared/constants/statusCodes');

class StatusController {
  /**
   * Get current site status
   */
  static async getStatus(req, res) {
    try {
      const { siteId } = req.params;
      const status = await StatusService.getStatus(siteId, req.user.user_id);
      sendSuccess(res, status, 'Status retrieved successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : 
                        error.message === 'Unauthorized' ? UNAUTHORIZED : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Update site status
   */
  static async updateStatus(req, res) {
    try {
      const { siteId } = req.params;
      const { status, reason } = req.body;

      // Validate status
      const validStatuses = ['active', 'draft', 'suspended'];
      if (!validStatuses.includes(status)) {
        return sendError(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, BAD_REQUEST);
      }

      // Suspended status requires reason
      if (status === 'suspended' && !reason) {
        return sendError(res, 'Reason is required when suspending a site', BAD_REQUEST);
      }

      const updatedSite = await StatusService.updateStatus(
        siteId,
        status,
        req.user.user_id,
        reason
      );
      sendSuccess(res, updatedSite, 'Status updated successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : 
                        error.message === 'Unauthorized' ? UNAUTHORIZED : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get status history
   */
  static async getStatusHistory(req, res) {
    try {
      const { siteId } = req.params;
      const history = await StatusService.getStatusHistory(siteId, req.user.user_id);
      sendSuccess(res, history, 'Status history retrieved successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : 
                        error.message === 'Unauthorized' ? UNAUTHORIZED : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }
}

module.exports = StatusController;


