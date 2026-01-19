const PlanConfigService = require('../services/planConfig.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');
const { logger } = require('../../../shared/utils/logger');

/**
 * Plan Configuration Controller
 * Admin endpoints for managing plan configurations
 */
class PlanConfigController {
  /**
   * Get all plan configurations
   * GET /admin/plan-configs
   */
  static async getAll(req, res) {
    try {
      const configs = await PlanConfigService.getAllConfigs(false); // Don't use cache for admin view
      sendSuccess(res, configs, 'Plan configurations retrieved successfully', OK);
    } catch (error) {
      logger.error('Error getting plan configs:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get plan configuration by type
   * GET /admin/plan-configs/:planType
   */
  static async getByType(req, res) {
    try {
      const { planType } = req.params;
      const config = await PlanConfigService.getConfigByType(planType, false);
      
      if (!config) {
        return sendError(res, 'Plan configuration not found', NOT_FOUND);
      }

      sendSuccess(res, config, 'Plan configuration retrieved successfully', OK);
    } catch (error) {
      logger.error('Error getting plan config:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Create plan configuration
   * POST /admin/plan-configs
   */
  static async create(req, res) {
    try {
      const planData = req.body;

      // Validate required fields
      if (!planData.plan_type || !planData.plan_name || !planData.limits) {
        return sendError(res, 'plan_type, plan_name, and limits are required', BAD_REQUEST);
      }

      const config = await PlanConfigService.createConfig(planData);
      sendSuccess(res, config, 'Plan configuration created successfully', CREATED);
    } catch (error) {
      logger.error('Error creating plan config:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update plan configuration
   * PUT /admin/plan-configs/:planType
   */
  static async update(req, res) {
    try {
      const { planType } = req.params;
      const updateData = req.body;

      const config = await PlanConfigService.updateConfig(planType, updateData);
      
      if (!config) {
        return sendError(res, 'Plan configuration not found', NOT_FOUND);
      }

      sendSuccess(res, config, 'Plan configuration updated successfully', OK);
    } catch (error) {
      logger.error('Error updating plan config:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Toggle plan active status
   * PATCH /admin/plan-configs/:planType/toggle-active
   */
  static async toggleActive(req, res) {
    try {
      const { planType } = req.params;
      const { is_active } = req.body;

      if (typeof is_active !== 'boolean') {
        return sendError(res, 'is_active must be a boolean', BAD_REQUEST);
      }

      const config = await PlanConfigService.toggleActive(planType, is_active);
      
      if (!config) {
        return sendError(res, 'Plan configuration not found', NOT_FOUND);
      }

      sendSuccess(res, config, `Plan configuration ${is_active ? 'activated' : 'deactivated'} successfully`, OK);
    } catch (error) {
      logger.error('Error toggling plan config active status:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete plan configuration (soft delete)
   * DELETE /admin/plan-configs/:planType
   */
  static async delete(req, res) {
    try {
      const { planType } = req.params;

      // Prevent deletion of 'free' plan
      if (planType === 'free') {
        return sendError(res, 'Cannot delete the free plan', FORBIDDEN);
      }

      const config = await PlanConfigService.deleteConfig(planType);
      
      if (!config) {
        return sendError(res, 'Plan configuration not found', NOT_FOUND);
      }

      sendSuccess(res, config, 'Plan configuration deleted successfully', OK);
    } catch (error) {
      logger.error('Error deleting plan config:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Clear plan configuration cache
   * POST /admin/plan-configs/clear-cache
   */
  static async clearCache(req, res) {
    try {
      PlanConfigService.clearCache();
      sendSuccess(res, null, 'Plan configuration cache cleared successfully', OK);
    } catch (error) {
      logger.error('Error clearing plan config cache:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = PlanConfigController;

