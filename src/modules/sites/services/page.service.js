const PageModel = require('../models/page.model');
const SiteModel = require('../models/site.model');
const FormInstanceService = require('../../formSubmissions/services/form-instance.service');
const { logger } = require('../../../shared/utils/logger');

class PageService {
  /**
   * Get all pages for a site
   */
  static async getSitePages(siteId, userId) {
    // Verify site ownership
    await this.verifySiteOwnership(siteId, userId);
    return await PageModel.getSitePages(siteId);
  }

  /**
   * Get page by ID
   */
  static async getPageById(pageId, siteId, userId) {
    // Verify site ownership
    await this.verifySiteOwnership(siteId, userId);
    return await PageModel.getPageById(pageId, siteId);
  }

  /**
   * Create page
   */
  static async createPage(pageData, userId) {
    const { siteId } = pageData;
    // Verify site ownership
    await this.verifySiteOwnership(siteId, userId);
    
    // Get site to use its default layout if page doesn't have one
    const site = await SiteModel.getSiteById(siteId);
    if (!site) {
      throw new Error('Site not found');
    }
    
    // Use site default layout if page doesn't specify one
    if (!pageData.layoutId && site.default_layout_id) {
      pageData.layoutId = site.default_layout_id;
    } else if (!pageData.layoutId) {
      pageData.layoutId = 'header-main-footer'; // Fallback
    }
    
    const page = await PageModel.createPage(pageData);
    if (page && pageData.content && typeof pageData.content === 'object' && (pageData.content.regions || pageData.content.blocks)) {
      try {
        const { synced } = await FormInstanceService.syncFormInstancesForPage(siteId, page.id, pageData.content);
        if (synced > 0) logger.info(`[PageService] Synced ${synced} form instance(s) for page ${page.id}`);
      } catch (err) {
        logger.warn('[PageService] Form instance sync failed after page create:', err.message);
      }
    }
    return page;
  }

  /**
   * Update page
   */
  static async updatePage(pageId, siteId, updates, userId) {
    // Verify site ownership
    await this.verifySiteOwnership(siteId, userId);
    
    // Create version before updating
    const currentPage = await PageModel.getPageById(pageId, siteId);
    if (currentPage && currentPage.content) {
      await PageModel.createPageVersion(pageId, currentPage.content, userId);
    }

    const page = await PageModel.updatePage(pageId, siteId, updates);
    if (page && updates.content && typeof updates.content === 'object' && (updates.content.regions || updates.content.blocks)) {
      try {
        const { synced } = await FormInstanceService.syncFormInstancesForPage(siteId, pageId, updates.content);
        if (synced > 0) logger.info(`[PageService] Synced ${synced} form instance(s) for page ${pageId}`);
      } catch (err) {
        logger.warn('[PageService] Form instance sync failed after page update:', err.message);
      }
    }
    return page;
  }

  /**
   * Delete page
   */
  static async deletePage(pageId, siteId, userId) {
    // Verify site ownership
    await this.verifySiteOwnership(siteId, userId);
    return await PageModel.deletePage(pageId, siteId);
  }

  /**
   * Get page versions
   */
  static async getPageVersions(pageId, siteId, userId) {
    // Verify site ownership
    await this.verifySiteOwnership(siteId, userId);
    return await PageModel.getPageVersions(pageId);
  }

  /**
   * Verify site ownership
   */
  static async verifySiteOwnership(siteId, userId) {
    const site = await SiteModel.getSiteById(siteId);
    if (!site) {
      throw new Error('Site not found');
    }
    if (site.owner_id !== userId) {
      throw new Error('Unauthorized');
    }
  }
}

module.exports = PageService;


