/**
 * Ads Service
 *
 * Business logic for ad management
 */

const AdPlacementModel = require('../models/ad-placement.model');
const CustomAdModel = require('../models/custom-ad.model');
const AdImpressionModel = require('../models/ad-impression.model');
const AdSenseConfigModel = require('../models/adsense-config.model');

class AdsService {
  // ========== Ad Placements ==========

  /**
   * Get all ad placements
   */
  static async getAllPlacements() {
    return await AdPlacementModel.getAll();
  }

  /**
   * Get enabled placements for a location
   */
  static async getEnabledPlacements(locationType) {
    return await AdPlacementModel.getEnabledByLocation(locationType);
  }

  /**
   * Get placement configuration with ad details
   */
  static async getPlacementConfig(placementKey) {
    const placement = await AdPlacementModel.getByKey(placementKey);

    if (!placement || !placement.is_enabled) {
      return null;
    }

    const config = { placement };

    // Get AdSense config if applicable
    if (placement.ad_type === 'google_adsense' || placement.ad_type === 'both') {
      const adsenseConfig = await AdSenseConfigModel.getByPlacementKey(placementKey);
      if (adsenseConfig && adsenseConfig.is_active) {
        config.adsense = adsenseConfig;
      }
    }

    // Get custom ad if applicable
    if (placement.ad_type === 'custom_b2b' || placement.ad_type === 'both') {
      const customAd = await CustomAdModel.getRandomForPlacement(placementKey);
      if (customAd) {
        config.customAd = customAd;
      }
    }

    return config;
  }

  /**
   * Update placement settings
   */
  static async updatePlacement(placementKey, updates) {
    return await AdPlacementModel.update(placementKey, updates);
  }

  /**
   * Toggle placement enabled status
   */
  static async togglePlacement(placementKey, isEnabled) {
    return await AdPlacementModel.toggleEnabled(placementKey, isEnabled);
  }

  // ========== Custom Ads ==========

  /**
   * Get all custom ads
   */
  static async getAllCustomAds(includeInactive = false) {
    return await CustomAdModel.getAll({ includeInactive });
  }

  /**
   * Get custom ad by ID
   */
  static async getCustomAdById(adId) {
    return await CustomAdModel.getById(adId);
  }

  /**
   * Get active custom ad for placement
   */
  static async getCustomAdForPlacement(placementKey) {
    return await CustomAdModel.getRandomForPlacement(placementKey);
  }

  /**
   * Create a new custom ad
   */
  static async createCustomAd(adData, userId) {
    return await CustomAdModel.create({ ...adData, created_by: userId });
  }

  /**
   * Update custom ad
   */
  static async updateCustomAd(adId, updates) {
    return await CustomAdModel.update(adId, updates);
  }

  /**
   * Toggle custom ad active status
   */
  static async toggleCustomAd(adId, isActive) {
    return await CustomAdModel.toggleActive(adId, isActive);
  }

  /**
   * Delete custom ad
   */
  static async deleteCustomAd(adId) {
    return await CustomAdModel.delete(adId);
  }

  // ========== Ad Impressions & Tracking ==========

  /**
   * Record ad impression
   */
  static async recordImpression(impressionData) {
    const record = await AdImpressionModel.record({
      ...impressionData,
      action_type: 'impression'
    });

    // Update custom ad impressions count if applicable
    if (impressionData.ad_id) {
      await CustomAdModel.incrementImpressions(impressionData.ad_id);
    }

    return record;
  }

  /**
   * Record ad click
   */
  static async recordClick(clickData) {
    const record = await AdImpressionModel.record({
      ...clickData,
      action_type: 'click'
    });

    // Update custom ad clicks count if applicable
    if (clickData.ad_id) {
      await CustomAdModel.incrementClicks(clickData.ad_id);
    }

    return record;
  }

  // ========== Analytics ==========

  /**
   * Get ad analytics
   */
  static async getAdAnalytics(adId, options = {}) {
    return await AdImpressionModel.getAdAnalytics(adId, options);
  }

  /**
   * Get placement analytics
   */
  static async getPlacementAnalytics(placementKey, options = {}) {
    return await AdImpressionModel.getPlacementAnalytics(placementKey, options);
  }

  /**
   * Get overall analytics
   */
  static async getOverallAnalytics(options = {}) {
    return await AdImpressionModel.getOverallAnalytics(options);
  }

  /**
   * Get comprehensive analytics for all ads
   */
  static async getComprehensiveAnalytics(options = {}) {
    const overall = await this.getOverallAnalytics(options);
    const customAds = await CustomAdModel.getAll({ includeInactive: true });

    const adAnalytics = await Promise.all(
      customAds.map(async (ad) => {
        const analytics = await this.getAdAnalytics(ad.id, options);
        return {
          ad_id: ad.id,
          ad_name: ad.ad_name,
          ad_type: ad.ad_type,
          is_active: ad.is_active,
          ...analytics
        };
      })
    );

    return {
      overall,
      by_ad: adAnalytics
    };
  }

  // ========== AdSense Configuration ==========

  /**
   * Get AdSense config for placement
   */
  static async getAdSenseConfig(placementKey) {
    return await AdSenseConfigModel.getByPlacementKey(placementKey);
  }

  /**
   * Create or update AdSense config
   */
  static async upsertAdSenseConfig(configData) {
    return await AdSenseConfigModel.upsert(configData);
  }

  /**
   * Delete AdSense config
   */
  static async deleteAdSenseConfig(placementKey) {
    return await AdSenseConfigModel.delete(placementKey);
  }
}

module.exports = AdsService;
