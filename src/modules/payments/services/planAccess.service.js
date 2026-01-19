const SubscriptionService = require('./subscription.service');
const SubscriptionModel = require('../models/subscription.model');
const SitePageUsageModel = require('../models/sitePageUsage.model');
const SiteModel = require('../../sites/models/site.model');
const CustomDomainModel = require('../../sites/models/customDomain.model');

/**
 * Plan Access Service
 * Middleware service for checking plan-based feature access
 */
class PlanAccessService {
  /**
   * Get user's current plan
   */
  static async getUserPlan(userId) {
    return await SubscriptionService.getCurrentSubscription(userId);
  }

  /**
   * Get plan limits for a plan type
   */
  static async getPlanLimits(planType) {
    const config = await SubscriptionService.getPlanConfig(planType);
    return config.limits;
  }

  /**
   * Check if user can create more pages for a site
   * Returns: { allowed: boolean, message?: string, limit?: number, current?: number }
   */
  static async checkPageLimit(userId, siteId) {
    // Get user's plan
    const subscription = await SubscriptionService.getCurrentSubscription(userId);
    const planLimits = subscription.limits || {};
    
    // Get site's page usage
    let usage = await SitePageUsageModel.findBySiteId(siteId);
    
    // If no usage record exists, create one
    if (!usage) {
      // Count actual pages from pages table
      const pool = require('../../../db/pool');
      const pageCountResult = await pool.query(
        'SELECT COUNT(*) as count FROM pages WHERE site_id = $1',
        [siteId]
      );
      const pageCount = parseInt(pageCountResult.rows[0].count) || 0;
      
      // Create usage record with current plan limit
      usage = await SitePageUsageModel.upsert(siteId, {
        page_count: pageCount,
        plan_limit: planLimits.pages || 5
      });
    }

    const currentPages = usage.page_count || 0;
    const planLimit = planLimits.pages || 5;
    const additionalPages = usage.additional_pages || 0;
    const totalLimit = planLimit === -1 ? -1 : planLimit + additionalPages; // -1 means unlimited

    // Check if unlimited
    if (totalLimit === -1) {
      return {
        allowed: true,
        limit: -1,
        current: currentPages
      };
    }

    // Check if under limit
    if (currentPages < totalLimit) {
      return {
        allowed: true,
        limit: totalLimit,
        current: currentPages,
        remaining: totalLimit - currentPages
      };
    }

    // Over limit
    return {
      allowed: false,
      message: `Page limit reached (${currentPages}/${totalLimit}). Upgrade your plan to add more pages.`,
      limit: totalLimit,
      current: currentPages
    };
  }

  /**
   * Check if user can add custom domains
   * Returns: { allowed: boolean, message?: string, limit?: number, current?: number }
   */
  static async checkCustomDomainAccess(userId, siteId) {
    // Get user's plan
    const subscription = await SubscriptionService.getCurrentSubscription(userId);
    const planLimits = subscription.limits || {};
    const domainLimit = planLimits.custom_domains || 0;

    // Free plan doesn't allow custom domains
    if (domainLimit === 0) {
      return {
        allowed: false,
        message: 'Custom domains require Small Scale plan or higher. Please upgrade to add custom domains.',
        limit: 0,
        current: 0
      };
    }

    // Unlimited domains
    if (domainLimit === -1) {
      return {
        allowed: true,
        limit: -1,
        current: 0
      };
    }

    // Count current custom domains for user's sites
    const userSites = await SiteModel.getUserSites(userId);
    const siteIds = userSites.map(site => site.id);
    
    if (siteIds.length === 0) {
      return {
        allowed: true,
        limit: domainLimit,
        current: 0,
        remaining: domainLimit
      };
    }

    const pool = require('../../../db/pool');
    const domainCountResult = await pool.query(
      `SELECT COUNT(*) as count FROM custom_domains 
       WHERE site_id = ANY($1::int[]) AND verified = true`,
      [siteIds]
    );
    const currentDomains = parseInt(domainCountResult.rows[0].count) || 0;

    if (currentDomains < domainLimit) {
      return {
        allowed: true,
        limit: domainLimit,
        current: currentDomains,
        remaining: domainLimit - currentDomains
      };
    }

    return {
      allowed: false,
      message: `Custom domain limit reached (${currentDomains}/${domainLimit}). Upgrade your plan to add more custom domains.`,
      limit: domainLimit,
      current: currentDomains
    };
  }

  /**
   * Check if user can create more sites
   * Returns: { allowed: boolean, message?: string, limit?: number, current?: number }
   */
  static async checkSiteLimit(userId) {
    // Get user's plan
    const subscription = await SubscriptionService.getCurrentSubscription(userId);
    const planLimits = subscription.limits || {};
    const siteLimit = planLimits.sites || 1;

    // Unlimited sites
    if (siteLimit === -1) {
      return {
        allowed: true,
        limit: -1,
        current: 0
      };
    }

    // Count current sites
    const userSites = await SiteModel.getUserSites(userId);
    const currentSites = userSites.length || 0;

    if (currentSites < siteLimit) {
      return {
        allowed: true,
        limit: siteLimit,
        current: currentSites,
        remaining: siteLimit - currentSites
      };
    }

    return {
      allowed: false,
      message: `Site limit reached (${currentSites}/${siteLimit}). Upgrade your plan to create more sites.`,
      limit: siteLimit,
      current: currentSites
    };
  }

  /**
   * Check if user can upgrade to a plan
   */
  static async canUpgrade(userId, newPlanType) {
    const currentSubscription = await SubscriptionService.getCurrentSubscription(userId);
    // Get plan order from display order in database
    const planOrder = ['free', 'small_scale', 'medium_scale', 'large_scale'];
    const currentPlanIndex = planOrder.indexOf(currentSubscription.plan_type);
    const newPlanIndex = planOrder.indexOf(newPlanType);

    if (newPlanIndex === -1) {
      return { allowed: false, message: 'Invalid plan type' };
    }

    if (newPlanIndex <= currentPlanIndex) {
      return { allowed: false, message: 'New plan must be higher than current plan' };
    }

    return { allowed: true };
  }

  /**
   * Check if user has access to a feature
   */
  static async hasFeature(userId, feature) {
    const subscription = await SubscriptionService.getCurrentSubscription(userId);
    return subscription.features?.includes(feature) || false;
  }

  /**
   * Update site page usage after page creation/deletion
   */
  static async updateSitePageUsage(siteId) {
    const pool = require('../../../db/pool');
    
    // Count actual pages
    const pageCountResult = await pool.query(
      'SELECT COUNT(*) as count FROM pages WHERE site_id = $1',
      [siteId]
    );
    const pageCount = parseInt(pageCountResult.rows[0].count) || 0;

    // Get site owner's plan
    const site = await SiteModel.getSiteById(siteId);
    if (!site) {
      throw new Error('Site not found');
    }

    const subscription = await SubscriptionService.getCurrentSubscription(site.owner_id);
    const planLimit = subscription.limits?.pages || 5;

    // Update usage record
    return await SitePageUsageModel.upsert(siteId, {
      page_count: pageCount,
      plan_limit: planLimit
    });
  }
}

module.exports = PlanAccessService;

