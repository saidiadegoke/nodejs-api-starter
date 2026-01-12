const EngineLoaderService = require('./engineLoader.service');
const SiteService = require('./site.service');
const EngineModel = require('../models/engine.model');
const { logger } = require('../../../shared/utils/logger');

class EngineService {
  /**
   * Get current engine version for a site
   */
  static async getSiteEngineVersion(siteId, userId) {
    // Verify ownership
    const site = await SiteService.getSiteById(siteId, userId);
    
    const currentVersion = site.engine_version || 'v1.0.0';
    const availableVersions = await this.getAvailableVersions();
    const currentVersionInfo = availableVersions.find(v => v.version === currentVersion);
    
    return {
      siteId: site.id,
      currentVersion,
      currentVersionInfo: currentVersionInfo || {
        version: currentVersion,
        name: 'Default Engine',
        isStable: true,
      },
      availableVersions,
      canUpdate: availableVersions.some(v => v.version !== currentVersion),
    };
  }

  /**
   * Get all available engine versions
   */
  static async getAvailableVersions() {
    return EngineLoaderService.getAvailableVersions();
  }

  /**
   * Get details for a specific engine version
   */
  static async getVersionDetails(version) {
    const versions = await this.getAvailableVersions();
    const versionInfo = versions.find(v => v.version === version);
    
    if (!versionInfo) {
      return null;
    }

    // Try to load the engine to get more details
    try {
      const engine = await EngineLoaderService.loadEngine(version);
      return {
        ...versionInfo,
        description: engine.description || versionInfo.description,
        breakingChanges: engine.breakingChanges || [],
        migrationRequired: engine.migrationRequired || false,
      };
    } catch (error) {
      logger.warn(`Could not load engine ${version} for details:`, error.message);
      return versionInfo;
    }
  }

  /**
   * Update site to a new engine version
   */
  static async updateEngineVersion(siteId, newVersion, userId) {
    // Verify ownership
    const site = await SiteService.getSiteById(siteId, userId);
    const oldVersion = site.engine_version || 'v1.0.0';
    
    // Validate version exists
    const availableVersions = await this.getAvailableVersions();
    const versionExists = availableVersions.some(v => v.version === newVersion);
    
    if (!versionExists) {
      throw new Error('Version not found');
    }

    // Check if version is the same
    if (oldVersion === newVersion) {
      throw new Error('Site is already using this version');
    }

    // Try to load the new engine to validate it
    try {
      await EngineLoaderService.loadEngine(newVersion);
    } catch (error) {
      throw new Error(`Failed to load engine version ${newVersion}: ${error.message}`);
    }

    // Update site engine version
    const updatedSite = await EngineModel.updateEngineVersion(siteId, newVersion);

    // Record version change in history
    await EngineModel.recordVersionChange({
      siteId,
      oldVersion,
      newVersion,
      changedBy: userId,
    });

    // Clear engine cache for this site (if needed)
    EngineLoaderService.clearCache(newVersion);

    return updatedSite;
  }

  /**
   * Rollback site to previous engine version
   */
  static async rollbackEngineVersion(siteId, targetVersion, userId) {
    // Verify ownership
    const site = await SiteService.getSiteById(siteId, userId);
    
    // Get version history
    const history = await EngineModel.getVersionHistory(siteId);
    
    if (history.length === 0) {
      throw new Error('No previous version to rollback to');
    }

    // If target version specified, use it; otherwise use previous version
    const rollbackVersion = targetVersion || history[0].old_version;
    const currentVersion = site.engine_version || 'v1.0.0';

    if (rollbackVersion === currentVersion) {
      throw new Error('Site is already using this version');
    }

    // Validate version exists
    const availableVersions = await this.getAvailableVersions();
    const versionExists = availableVersions.some(v => v.version === rollbackVersion);
    
    if (!versionExists) {
      throw new Error('Version not found');
    }

    // Update site engine version
    const updatedSite = await EngineModel.updateEngineVersion(siteId, rollbackVersion);

    // Record rollback in history
    await EngineModel.recordVersionChange({
      siteId,
      oldVersion: currentVersion,
      newVersion: rollbackVersion,
      changedBy: userId,
      isRollback: true,
    });

    // Clear engine cache
    EngineLoaderService.clearCache(rollbackVersion);

    return updatedSite;
  }

  /**
   * Get engine version history for a site
   */
  static async getVersionHistory(siteId, userId) {
    // Verify ownership
    await SiteService.getSiteById(siteId, userId);
    return await EngineModel.getVersionHistory(siteId);
  }
}

module.exports = EngineService;


