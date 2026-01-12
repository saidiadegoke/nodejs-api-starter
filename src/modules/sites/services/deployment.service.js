const DeploymentModel = require('../models/deployment.model');
const SiteModel = require('../models/site.model');
const { logger } = require('../../../shared/utils/logger');

class DeploymentService {
  /**
   * Record a deployment event
   */
  static async recordDeployment(siteId, userId, data = {}) {
    try {
      // Verify site exists
      const site = await SiteModel.getSiteById(siteId);
      if (!site) {
        throw new Error('Site not found');
      }

      // Generate deployment URL
      const deploymentUrl = this.generateDeploymentUrl(site);

      // Create deployment record
      const deployment = await DeploymentModel.createDeployment(siteId, userId, {
        status: data.status || 'pending',
        deploymentUrl,
        errorMessage: data.errorMessage || null,
        metadata: {
          siteName: site.name,
          siteSlug: site.slug,
          siteStatus: site.status,
          templateId: site.template_id,
          engineVersion: site.engine_version,
          ...data.metadata,
        },
      });

      logger.info(`[DeploymentService] Deployment recorded: ${deployment.id} for site ${siteId}`);
      return deployment;
    } catch (error) {
      logger.error(`[DeploymentService] Error recording deployment:`, error);
      throw error;
    }
  }

  /**
   * Record site activation as deployment
   */
  static async recordSiteActivation(siteId, userId) {
    try {
      const site = await SiteModel.getSiteById(siteId);
      if (!site) {
        throw new Error('Site not found');
      }

      const deploymentUrl = this.generateDeploymentUrl(site);

      const deployment = await DeploymentModel.createDeployment(siteId, userId, {
        status: 'success',
        deploymentUrl,
        metadata: {
          type: 'activation',
          siteName: site.name,
          siteSlug: site.slug,
          activatedAt: new Date().toISOString(),
        },
      });

      // Set deployed_at timestamp
      await DeploymentModel.updateDeploymentStatus(deployment.id, 'success', null, deploymentUrl);

      logger.info(`[DeploymentService] Site activation recorded as deployment: ${deployment.id}`);
      return deployment;
    } catch (error) {
      logger.error(`[DeploymentService] Error recording site activation:`, error);
      throw error;
    }
  }

  /**
   * Record site status change
   */
  static async recordStatusChange(siteId, userId, oldStatus, newStatus, reason = null) {
    try {
      // Only record as deployment if activating
      if (newStatus === 'active' && oldStatus !== 'active') {
        return await this.recordSiteActivation(siteId, userId);
      }

      // For other status changes, update latest deployment if exists
      const latestDeployment = await DeploymentModel.getLatestDeployment(siteId);
      if (latestDeployment) {
        const metadata = latestDeployment.deployment_metadata || {};
        metadata.statusChanges = metadata.statusChanges || [];
        metadata.statusChanges.push({
          from: oldStatus,
          to: newStatus,
          reason,
          timestamp: new Date().toISOString(),
        });

        await DeploymentModel.updateDeploymentMetadata(latestDeployment.id, metadata);
      }

      return latestDeployment;
    } catch (error) {
      logger.error(`[DeploymentService] Error recording status change:`, error);
      throw error;
    }
  }

  /**
   * Get deployment history for a site
   */
  static async getDeploymentHistory(siteId, limit = 50, offset = 0) {
    try {
      const deployments = await DeploymentModel.getDeploymentsBySite(siteId, limit, offset);
      
      // Parse JSONB metadata
      return deployments.map(deployment => ({
        ...deployment,
        deployment_metadata: typeof deployment.deployment_metadata === 'string'
          ? JSON.parse(deployment.deployment_metadata)
          : deployment.deployment_metadata,
      }));
    } catch (error) {
      logger.error(`[DeploymentService] Error getting deployment history:`, error);
      throw error;
    }
  }

  /**
   * Get latest deployment for a site
   */
  static async getLatestDeployment(siteId) {
    try {
      const deployment = await DeploymentModel.getLatestDeployment(siteId);
      
      if (deployment) {
        return {
          ...deployment,
          deployment_metadata: typeof deployment.deployment_metadata === 'string'
            ? JSON.parse(deployment.deployment_metadata)
            : deployment.deployment_metadata,
        };
      }

      return null;
    } catch (error) {
      logger.error(`[DeploymentService] Error getting latest deployment:`, error);
      throw error;
    }
  }

  /**
   * Get deployment statistics
   */
  static async getDeploymentStats(siteId) {
    try {
      const stats = await DeploymentModel.getDeploymentStats(siteId);
      const count = await DeploymentModel.getDeploymentCount(siteId);
      const latest = await DeploymentModel.getLatestDeployment(siteId);

      return {
        total: count,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat.status] = parseInt(stat.count, 10);
          return acc;
        }, {}),
        latest: latest ? {
          ...latest,
          deployment_metadata: typeof latest.deployment_metadata === 'string'
            ? JSON.parse(latest.deployment_metadata)
            : latest.deployment_metadata,
        } : null,
      };
    } catch (error) {
      logger.error(`[DeploymentService] Error getting deployment stats:`, error);
      throw error;
    }
  }

  /**
   * Update deployment status
   */
  static async updateDeploymentStatus(deploymentId, status, errorMessage = null, deploymentUrl = null) {
    try {
      const deployment = await DeploymentModel.updateDeploymentStatus(
        deploymentId,
        status,
        errorMessage,
        deploymentUrl
      );

      logger.info(`[DeploymentService] Deployment ${deploymentId} status updated to ${status}`);
      return deployment;
    } catch (error) {
      logger.error(`[DeploymentService] Error updating deployment status:`, error);
      throw error;
    }
  }

  /**
   * Generate deployment URL for a site
   */
  static generateDeploymentUrl(site) {
    const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'smartstore.org';
    
    // Use custom domain if set, otherwise use subdomain
    if (site.primary_domain) {
      return `https://${site.primary_domain}`;
    }

    return `https://${site.slug}.${baseDomain}`;
  }
}

module.exports = DeploymentService;

