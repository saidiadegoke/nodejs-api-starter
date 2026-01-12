const PreviewService = require('./preview.service');
const { logger } = require('../../../shared/utils/logger');
const path = require('path');
const fs = require('fs');

// Cache for loaded engines
const engineCache = new Map();

class EngineLoaderService {
  /**
   * Load engine by version
   */
  static async loadEngine(version) {
    // Check cache first
    if (engineCache.has(version)) {
      return engineCache.get(version);
    }

    // Try to load from file system
    const enginePath = path.join(__dirname, '../../../site-engines', version);
    
    if (fs.existsSync(enginePath)) {
      try {
        const engine = require(enginePath);
        engineCache.set(version, engine);
        return engine;
      } catch (error) {
        logger.warn(`Failed to load engine ${version} from filesystem, using default:`, error.message);
      }
    }

    // Fallback to default engine (PreviewService)
    logger.info(`Using default engine for version ${version}`);
    const defaultEngine = this.getDefaultEngine();
    engineCache.set(version, defaultEngine);
    return defaultEngine;
  }

  /**
   * Get default engine (v1.0.0 - PreviewService)
   */
  static getDefaultEngine() {
    return {
      version: 'v1.0.0',
      name: 'Default Engine',
      description: 'Default rendering engine',
      renderSite: async (site, pageSlug) => {
        return await PreviewService.renderSite(site.id);
      },
      renderPage: async (site, pageSlug) => {
        // Get page by slug
        const PageModel = require('../models/page.model');
        const pages = await PageModel.getSitePages(site.id);
        const page = pages.find(p => p.slug === pageSlug);
        
        if (!page) {
          throw new Error('Page not found');
        }
        
        return await PreviewService.renderPage(site.id, page.id);
      },
    };
  }

  /**
   * Clear engine cache
   */
  static clearCache(version = null) {
    if (version) {
      engineCache.delete(version);
    } else {
      engineCache.clear();
    }
  }

  /**
   * Get available engine versions
   */
  static getAvailableVersions() {
    const enginesDir = path.join(__dirname, '../../../site-engines');
    
    if (!fs.existsSync(enginesDir)) {
      return [{ version: 'v1.0.0', name: 'Default Engine', isStable: true }];
    }

    const versions = [];
    
    try {
      const dirs = fs.readdirSync(enginesDir, { withFileTypes: true });
      dirs.forEach(dir => {
        if (dir.isDirectory()) {
          const version = dir.name;
          try {
            const enginePath = path.join(enginesDir, version, 'index.js');
            if (fs.existsSync(enginePath)) {
              const engine = require(enginePath);
              versions.push({
                version,
                name: engine.name || `Engine ${version}`,
                description: engine.description || '',
                isStable: engine.isStable !== false,
              });
            }
          } catch (error) {
            logger.warn(`Failed to load engine info for ${version}:`, error.message);
          }
        }
      });
    } catch (error) {
      logger.error('Error reading engines directory:', error);
    }

    // Always include default
    if (!versions.find(v => v.version === 'v1.0.0')) {
      versions.unshift({ version: 'v1.0.0', name: 'Default Engine', isStable: true });
    }

    return versions.sort((a, b) => {
      // Sort by version number (simple comparison)
      return a.version.localeCompare(b.version);
    });
  }
}

module.exports = EngineLoaderService;


