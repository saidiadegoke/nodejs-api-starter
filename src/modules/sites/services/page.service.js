const PageModel = require('../models/page.model');
const SiteModel = require('../models/site.model');

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
    
    return await PageModel.createPage(pageData);
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

    return await PageModel.updatePage(pageId, siteId, updates);
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


