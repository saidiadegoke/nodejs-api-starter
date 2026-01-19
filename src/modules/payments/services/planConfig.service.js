const PlanConfigModel = require('../models/planConfig.model');

// In-memory cache for plan configs (refreshed periodically or on update)
let planConfigCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Plan Configuration Service
 * Manages plan configurations with caching for performance
 */
class PlanConfigService {
  /**
   * Get all plan configurations (with caching)
   */
  static async getAllConfigs(useCache = true) {
    const now = Date.now();

    // Check cache
    if (useCache && planConfigCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL) {
      return planConfigCache;
    }

    // Load from database
    const configs = await PlanConfigModel.getAll({ active_only: false });
    
    // Process JSONB fields
    const processedConfigs = configs.map(config => ({
      ...config,
      prices: typeof config.prices === 'string' ? JSON.parse(config.prices) : config.prices,
      limits: typeof config.limits === 'string' ? JSON.parse(config.limits) : config.limits,
      features: typeof config.features === 'string' ? JSON.parse(config.features) : config.features,
      metadata: typeof config.metadata === 'string' ? JSON.parse(config.metadata) : config.metadata
    }));

    // Update cache
    planConfigCache = processedConfigs;
    cacheTimestamp = now;

    return processedConfigs;
  }

  /**
   * Get plan configuration by type (with caching)
   */
  static async getConfigByType(planType, useCache = true) {
    const configs = await this.getAllConfigs(useCache);
    const config = configs.find(c => c.plan_type === planType);

    if (!config) {
      throw new Error(`Plan configuration not found: ${planType}`);
    }

    return config;
  }

  /**
   * Get all active public plans (for plan selection UI)
   */
  static async getPublicPlans() {
    const configs = await PlanConfigModel.getAll({ active_only: true, public_only: true });
    
    return configs.map(config => ({
      id: config.plan_type,
      name: config.plan_name,
      description: config.description,
      prices: typeof config.prices === 'string' ? JSON.parse(config.prices) : config.prices,
      default_currency: config.default_currency || 'NGN',
      limits: typeof config.limits === 'string' ? JSON.parse(config.limits) : config.limits,
      features: typeof config.features === 'string' ? JSON.parse(config.features) : config.features,
      display_order: config.display_order
    })).sort((a, b) => a.display_order - b.display_order);
  }

  /**
   * Get plan limits for a plan type
   */
  static async getPlanLimits(planType) {
    const config = await this.getConfigByType(planType);
    return config.limits;
  }

  /**
   * Get plan features for a plan type
   */
  static async getPlanFeatures(planType) {
    const config = await this.getConfigByType(planType);
    return config.features || [];
  }

  /**
   * Create plan configuration
   */
  static async createConfig(planData) {
    const config = await PlanConfigModel.create(planData);
    // Invalidate cache
    planConfigCache = null;
    cacheTimestamp = null;
    return config;
  }

  /**
   * Update plan configuration
   */
  static async updateConfig(planType, updateData) {
    const config = await PlanConfigModel.update(planType, updateData);
    // Invalidate cache
    planConfigCache = null;
    cacheTimestamp = null;
    return config;
  }

  /**
   * Delete plan configuration
   */
  static async deleteConfig(planType) {
    const config = await PlanConfigModel.delete(planType);
    // Invalidate cache
    planConfigCache = null;
    cacheTimestamp = null;
    return config;
  }

  /**
   * Toggle plan active status
   */
  static async toggleActive(planType, isActive) {
    const config = await PlanConfigModel.toggleActive(planType, isActive);
    // Invalidate cache
    planConfigCache = null;
    cacheTimestamp = null;
    return config;
  }

  /**
   * Clear cache (useful for manual refresh)
   */
  static clearCache() {
    planConfigCache = null;
    cacheTimestamp = null;
  }

  /**
   * Convert plan config to format expected by SubscriptionService
   */
  static formatForSubscriptionService(config) {
    return {
      name: config.plan_name,
      prices: typeof config.prices === 'string' ? JSON.parse(config.prices) : config.prices,
      default_currency: config.default_currency || 'NGN',
      limits: typeof config.limits === 'string' ? JSON.parse(config.limits) : config.limits,
      features: typeof config.features === 'string' ? JSON.parse(config.features) : config.features
    };
  }
}

module.exports = PlanConfigService;

