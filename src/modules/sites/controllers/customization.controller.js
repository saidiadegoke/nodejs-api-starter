const CustomizationService = require('../services/customization.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST } = require('../../../shared/constants/statusCodes');

class CustomizationController {
  /**
   * Get customization settings
   */
  static async getCustomization(req, res) {
    try {
      const { siteId } = req.params;
      const customization = await CustomizationService.getCustomization(siteId, req.user.user_id);
      sendSuccess(res, customization, 'Customization retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update customization settings
   */
  static async updateCustomization(req, res) {
    try {
      const { siteId } = req.params;
      const customization = await CustomizationService.updateCustomization(siteId, req.body, req.user.user_id);
      sendSuccess(res, customization, 'Customization updated successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Reset customization to default
   */
  static async resetCustomization(req, res) {
    try {
      const { siteId } = req.params;
      const customization = await CustomizationService.resetCustomization(siteId, req.user.user_id);
      sendSuccess(res, customization, 'Customization reset successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = CustomizationController;

