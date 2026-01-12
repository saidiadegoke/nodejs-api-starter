const EngineService = require('../services/engine.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } = require('../../../shared/constants/statusCodes');

class EngineController {
  /**
   * Get current engine version for a site
   */
  static async getEngineVersion(req, res) {
    try {
      const { siteId } = req.params;
      const engineInfo = await EngineService.getSiteEngineVersion(siteId, req.user.user_id);
      sendSuccess(res, engineInfo, 'Engine version retrieved successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : 
                        error.message === 'Unauthorized' ? UNAUTHORIZED : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get all available engine versions
   */
  static async getAvailableVersions(req, res) {
    try {
      const versions = await EngineService.getAvailableVersions();
      sendSuccess(res, versions, 'Available versions retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get details for a specific engine version
   */
  static async getVersionDetails(req, res) {
    try {
      const { version } = req.params;
      const versionInfo = await EngineService.getVersionDetails(version);
      
      if (!versionInfo) {
        return sendError(res, 'Version not found', NOT_FOUND);
      }
      
      sendSuccess(res, versionInfo, 'Version details retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update site to a new engine version
   */
  static async updateEngineVersion(req, res) {
    try {
      const { siteId } = req.params;
      const { version } = req.body;

      if (!version) {
        return sendError(res, 'Version is required', BAD_REQUEST);
      }

      const updatedSite = await EngineService.updateEngineVersion(
        siteId,
        version,
        req.user.user_id
      );
      
      sendSuccess(res, updatedSite, 'Engine version updated successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : 
                        error.message === 'Unauthorized' ? UNAUTHORIZED : 
                        error.message === 'Version not found' ? NOT_FOUND : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Rollback site to previous engine version
   */
  static async rollbackEngineVersion(req, res) {
    try {
      const { siteId } = req.params;
      const { version } = req.body; // Optional: specific version to rollback to

      const updatedSite = await EngineService.rollbackEngineVersion(
        siteId,
        version,
        req.user.user_id
      );
      
      sendSuccess(res, updatedSite, 'Engine version rolled back successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : 
                        error.message === 'Unauthorized' ? UNAUTHORIZED : 
                        error.message === 'No previous version' ? NOT_FOUND : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get engine version history for a site
   */
  static async getVersionHistory(req, res) {
    try {
      const { siteId } = req.params;
      const history = await EngineService.getVersionHistory(siteId, req.user.user_id);
      sendSuccess(res, history, 'Version history retrieved successfully', OK);
    } catch (error) {
      const statusCode = error.message === 'Site not found' ? NOT_FOUND : 
                        error.message === 'Unauthorized' ? UNAUTHORIZED : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }
}

module.exports = EngineController;


