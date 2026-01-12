const StatusModel = require('../models/status.model');
const SiteService = require('./site.service');
const TemplateModel = require('../models/template.model');
const DeploymentService = require('./deployment.service');

class StatusService {
  /**
   * Get current site status
   */
  static async getStatus(siteId, userId) {
    // Verify ownership
    const site = await SiteService.getSiteById(siteId, userId);
    return {
      status: site.status,
      siteId: site.id,
      siteName: site.name,
    };
  }

  /**
   * Validate activation requirements
   */
  static async validateActivationRequirements(site) {
    const errors = [];

    // Check site name
    if (!site.name || site.name.trim().length === 0) {
      errors.push('Site name is required');
    }

    // Check site slug
    if (!site.slug || site.slug.trim().length === 0) {
      errors.push('Site slug is required');
    }

    // Check template is applied
    if (!site.template_id) {
      errors.push('A template must be applied before activating the site');
      return errors; // Early return if no template
    }

    // Check template exists and has pages
    const template = await TemplateModel.getTemplateById(site.template_id);
    if (!template) {
      errors.push('Template not found');
      return errors;
    }

    // Parse template config
    let templateConfig;
    try {
      templateConfig = typeof template.config === 'string' 
        ? JSON.parse(template.config) 
        : template.config;
    } catch (parseError) {
      errors.push('Template configuration is invalid');
      return errors;
    }

    // Check template has pages
    const pages = templateConfig?.pages || [];
    if (!Array.isArray(pages) || pages.length === 0) {
      errors.push('Template must include at least one page');
    }

    return errors;
  }

  /**
   * Update site status
   */
  static async updateStatus(siteId, newStatus, userId, reason) {
    // Verify ownership
    const site = await SiteService.getSiteById(siteId, userId);
    const oldStatus = site.status;

    // If activating, validate requirements
    if (newStatus === 'active' && oldStatus !== 'active') {
      const validationErrors = await this.validateActivationRequirements(site);
      if (validationErrors.length > 0) {
        throw new Error(`Cannot activate site: ${validationErrors.join(', ')}`);
      }
    }

    // Update status
    const updatedSite = await StatusModel.updateStatus(siteId, newStatus);

    // Record status change in history
    await StatusModel.recordStatusChange({
      siteId,
      oldStatus,
      newStatus,
      changedBy: userId,
      reason: reason || null,
    });

    // Record deployment when site is activated
    if (newStatus === 'active' && oldStatus !== 'active') {
      try {
        await DeploymentService.recordSiteActivation(siteId, userId);
      } catch (deploymentError) {
        // Log but don't fail status update if deployment recording fails
        const { logger } = require('../../../shared/utils/logger');
        logger.error(`[StatusService] Failed to record deployment for site ${siteId}:`, deploymentError);
      }
    } else if (oldStatus !== newStatus) {
      // Record status change in deployment metadata
      try {
        await DeploymentService.recordStatusChange(siteId, userId, oldStatus, newStatus, reason);
      } catch (deploymentError) {
        // Log but don't fail status update
        const { logger } = require('../../../shared/utils/logger');
        logger.error(`[StatusService] Failed to record status change in deployment:`, deploymentError);
      }
    }

    return updatedSite;
  }

  /**
   * Get status history
   */
  static async getStatusHistory(siteId, userId) {
    // Verify ownership
    await SiteService.getSiteById(siteId, userId);
    return await StatusModel.getStatusHistory(siteId);
  }
}

module.exports = StatusService;


