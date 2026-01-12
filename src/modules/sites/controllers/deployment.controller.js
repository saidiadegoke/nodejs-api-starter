const DeploymentService = require('../services/deployment.service');
const SiteService = require('../services/site.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class DeploymentController {
  /**
   * Get deployment history for a site
   * GET /sites/:siteId/deployments
   */
  static async getDeployments(req, res) {
    try {
      const { siteId } = req.params;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      // Verify site ownership
      await SiteService.getSiteById(siteId, req.user.user_id);

      const deployments = await DeploymentService.getDeploymentHistory(siteId, limit, offset);
      sendSuccess(res, deployments, 'Deployment history retrieved successfully', OK);
    } catch (error) {
      const statusCode = error.message.includes('not found') ? NOT_FOUND : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get latest deployment for a site
   * GET /sites/:siteId/deployments/latest
   */
  static async getLatestDeployment(req, res) {
    try {
      const { siteId } = req.params;

      // Verify site ownership
      await SiteService.getSiteById(siteId, req.user.user_id);

      const deployment = await DeploymentService.getLatestDeployment(siteId);
      
      if (!deployment) {
        return sendError(res, 'No deployments found for this site', NOT_FOUND);
      }

      sendSuccess(res, deployment, 'Latest deployment retrieved successfully', OK);
    } catch (error) {
      const statusCode = error.message.includes('not found') ? NOT_FOUND : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get deployment statistics
   * GET /sites/:siteId/deployments/stats
   */
  static async getDeploymentStats(req, res) {
    try {
      const { siteId } = req.params;

      // Verify site ownership
      await SiteService.getSiteById(siteId, req.user.user_id);

      const stats = await DeploymentService.getDeploymentStats(siteId);
      sendSuccess(res, stats, 'Deployment statistics retrieved successfully', OK);
    } catch (error) {
      const statusCode = error.message.includes('not found') ? NOT_FOUND : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }

  /**
   * Get deployment by ID
   * GET /sites/:siteId/deployments/:deploymentId
   */
  static async getDeploymentById(req, res) {
    try {
      const { siteId, deploymentId } = req.params;

      // Verify site ownership
      await SiteService.getSiteById(siteId, req.user.user_id);

      const DeploymentModel = require('../models/deployment.model');
      const deployment = await DeploymentModel.getDeploymentById(deploymentId);

      if (!deployment) {
        return sendError(res, 'Deployment not found', NOT_FOUND);
      }

      if (deployment.site_id !== parseInt(siteId)) {
        return sendError(res, 'Deployment does not belong to this site', BAD_REQUEST);
      }

      // Parse metadata
      const parsedDeployment = {
        ...deployment,
        deployment_metadata: typeof deployment.deployment_metadata === 'string'
          ? JSON.parse(deployment.deployment_metadata)
          : deployment.deployment_metadata,
      };

      sendSuccess(res, parsedDeployment, 'Deployment retrieved successfully', OK);
    } catch (error) {
      const statusCode = error.message.includes('not found') ? NOT_FOUND : BAD_REQUEST;
      sendError(res, error.message, statusCode);
    }
  }
}

module.exports = DeploymentController;

