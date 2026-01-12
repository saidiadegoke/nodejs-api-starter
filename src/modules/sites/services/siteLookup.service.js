const SiteModel = require('../models/site.model');

// Simple in-memory cache (can be replaced with Redis later)
const siteCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class SiteLookupService {
  /**
   * Get site by hostname (with caching)
   */
  static async getSiteByHostname(hostname) {
    // Check cache first
    const cacheKey = `site:${hostname}`;
    const cached = siteCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.site;
    }
    
    // Lookup in database
    const site = await SiteModel.getSiteByHostname(hostname);
    
    if (site) {
      // Cache the result
      siteCache.set(cacheKey, {
        site,
        timestamp: Date.now(),
      });
    }
    
    return site;
  }

  /**
   * Get site by subdomain
   */
  static async getSiteBySubdomain(subdomain) {
    return await SiteModel.getSiteBySlug(subdomain);
  }

  /**
   * Get site by custom domain
   */
  static async getSiteByCustomDomain(domain) {
    return await SiteModel.getSiteByCustomDomain(domain);
  }

  /**
   * Clear cache for a site
   */
  static clearCache(hostname) {
    const cacheKey = `site:${hostname}`;
    siteCache.delete(cacheKey);
  }

  /**
   * Clear all cache
   */
  static clearAllCache() {
    siteCache.clear();
  }
}

module.exports = SiteLookupService;


