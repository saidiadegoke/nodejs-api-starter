const EngineLoaderService = require('./engineLoader.service');
const PreviewService = require('./preview.service');
const { logger } = require('../../../shared/utils/logger');

class SiteRendererService {
  /**
   * Render site homepage
   */
  static async renderSite(site, pageSlug = null) {
    try {
      // Load engine for this site's version
      const engine = await EngineLoaderService.loadEngine(site.engine_version || 'v1.0.0');
      
      // Render using the engine
      return await engine.renderSite(site, pageSlug);
    } catch (error) {
      logger.error('Site rendering error:', error);
      // Fallback to PreviewService
      return await PreviewService.renderSite(site.id);
    }
  }

  /**
   * Render specific page
   * Pages come from template, not from site's pages table
   */
  static async renderPage(site, pageSlug) {
    try {
      // Load engine for this site's version
      const engine = await EngineLoaderService.loadEngine(site.engine_version || 'v1.0.0');
      
      // Render using the engine
      return await engine.renderPage(site, pageSlug);
    } catch (error) {
      logger.error('Page rendering error:', error);
      // Fallback to PreviewService (which uses template pages)
      const config = await PreviewService.previewSite(site.id, pageSlug);
      return PreviewService.generateHTML(config);
    }
  }
}

module.exports = SiteRendererService;

