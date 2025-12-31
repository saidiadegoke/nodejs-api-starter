/**
 * Ads Controller
 *
 * Handles HTTP requests for ad management
 */

const AdsService = require('../services/ads.service');

class AdsController {
  // ========== Ad Placements ==========

  /**
   * Get all ad placements
   */
  static async getAllPlacements(req, res) {
    try {
      const placements = await AdsService.getAllPlacements();
      res.json({ success: true, data: placements });
    } catch (error) {
      console.error('Error getting placements:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get enabled placements for a location
   */
  static async getEnabledPlacements(req, res) {
    try {
      const { locationType } = req.params;
      const placements = await AdsService.getEnabledPlacements(locationType);
      res.json({ success: true, data: placements });
    } catch (error) {
      console.error('Error getting enabled placements:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get placement configuration with ad details
   */
  static async getPlacementConfig(req, res) {
    try {
      const { placementKey } = req.params;
      const config = await AdsService.getPlacementConfig(placementKey);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Placement not found or not enabled'
        });
      }

      res.json({ success: true, data: config });
    } catch (error) {
      console.error('Error getting placement config:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Update placement settings
   */
  static async updatePlacement(req, res) {
    try {
      const { placementKey } = req.params;
      const updates = req.body;

      const updated = await AdsService.updatePlacement(placementKey, updates);
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('Error updating placement:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Toggle placement enabled status
   */
  static async togglePlacement(req, res) {
    try {
      const { placementKey } = req.params;
      const { is_enabled } = req.body;

      const updated = await AdsService.togglePlacement(placementKey, is_enabled);
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('Error toggling placement:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== Custom Ads ==========

  /**
   * Get all custom ads
   */
  static async getAllCustomAds(req, res) {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const customAds = await AdsService.getAllCustomAds(includeInactive);
      res.json({ success: true, data: customAds });
    } catch (error) {
      console.error('Error getting custom ads:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get custom ad by ID
   */
  static async getCustomAdById(req, res) {
    try {
      const { adId } = req.params;
      const customAd = await AdsService.getCustomAdById(adId);

      if (!customAd) {
        return res.status(404).json({ success: false, error: 'Custom ad not found' });
      }

      res.json({ success: true, data: customAd });
    } catch (error) {
      console.error('Error getting custom ad:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get active custom ad for placement (public endpoint)
   */
  static async getCustomAdForPlacement(req, res) {
    try {
      const { placementKey } = req.params;
      const customAd = await AdsService.getCustomAdForPlacement(placementKey);

      if (!customAd) {
        return res.status(404).json({ success: false, error: 'No active ad for this placement' });
      }

      res.json({ success: true, data: customAd });
    } catch (error) {
      console.error('Error getting custom ad for placement:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Create a new custom ad
   */
  static async createCustomAd(req, res) {
    try {
      const adData = req.body;
      const userId = req.user.id;

      const customAd = await AdsService.createCustomAd(adData, userId);
      res.status(201).json({ success: true, data: customAd });
    } catch (error) {
      console.error('Error creating custom ad:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Update custom ad
   */
  static async updateCustomAd(req, res) {
    try {
      const { adId } = req.params;
      const updates = req.body;

      const updated = await AdsService.updateCustomAd(adId, updates);
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('Error updating custom ad:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Toggle custom ad active status
   */
  static async toggleCustomAd(req, res) {
    try {
      const { adId } = req.params;
      const { is_active } = req.body;

      const updated = await AdsService.toggleCustomAd(adId, is_active);
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('Error toggling custom ad:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Delete custom ad
   */
  static async deleteCustomAd(req, res) {
    try {
      const { adId } = req.params;
      await AdsService.deleteCustomAd(adId);
      res.json({ success: true, message: 'Custom ad deleted successfully' });
    } catch (error) {
      console.error('Error deleting custom ad:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== Ad Impressions & Tracking ==========

  /**
   * Record ad impression (public endpoint)
   */
  static async recordImpression(req, res) {
    try {
      const impressionData = {
        ...req.body,
        user_id: req.user?.id || null,
        user_agent: req.headers['user-agent'],
        ip_address: req.ip || req.connection.remoteAddress
      };

      const record = await AdsService.recordImpression(impressionData);
      res.json({ success: true, data: record });
    } catch (error) {
      console.error('Error recording impression:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Record ad click (public endpoint)
   */
  static async recordClick(req, res) {
    try {
      const clickData = {
        ...req.body,
        user_id: req.user?.id || null,
        user_agent: req.headers['user-agent'],
        ip_address: req.ip || req.connection.remoteAddress
      };

      const record = await AdsService.recordClick(clickData);
      res.json({ success: true, data: record });
    } catch (error) {
      console.error('Error recording click:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== Analytics ==========

  /**
   * Get ad analytics
   */
  static async getAdAnalytics(req, res) {
    try {
      const { adId } = req.params;
      const { start_date, end_date } = req.query;

      const options = {};
      if (start_date) options.startDate = new Date(start_date);
      if (end_date) options.endDate = new Date(end_date);

      const analytics = await AdsService.getAdAnalytics(adId, options);
      res.json({ success: true, data: analytics });
    } catch (error) {
      console.error('Error getting ad analytics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get placement analytics
   */
  static async getPlacementAnalytics(req, res) {
    try {
      const { placementKey } = req.params;
      const { start_date, end_date } = req.query;

      const options = {};
      if (start_date) options.startDate = new Date(start_date);
      if (end_date) options.endDate = new Date(end_date);

      const analytics = await AdsService.getPlacementAnalytics(placementKey, options);
      res.json({ success: true, data: analytics });
    } catch (error) {
      console.error('Error getting placement analytics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get overall analytics
   */
  static async getOverallAnalytics(req, res) {
    try {
      const { start_date, end_date } = req.query;

      const options = {};
      if (start_date) options.startDate = new Date(start_date);
      if (end_date) options.endDate = new Date(end_date);

      const analytics = await AdsService.getOverallAnalytics(options);
      res.json({ success: true, data: analytics });
    } catch (error) {
      console.error('Error getting overall analytics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get comprehensive analytics
   */
  static async getComprehensiveAnalytics(req, res) {
    try {
      const { start_date, end_date } = req.query;

      const options = {};
      if (start_date) options.startDate = new Date(start_date);
      if (end_date) options.endDate = new Date(end_date);

      const analytics = await AdsService.getComprehensiveAnalytics(options);
      res.json({ success: true, data: analytics });
    } catch (error) {
      console.error('Error getting comprehensive analytics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ========== AdSense Configuration ==========

  /**
   * Get AdSense config for placement
   */
  static async getAdSenseConfig(req, res) {
    try {
      const { placementKey } = req.params;
      const config = await AdsService.getAdSenseConfig(placementKey);

      if (!config) {
        return res.status(404).json({ success: false, error: 'AdSense config not found' });
      }

      res.json({ success: true, data: config });
    } catch (error) {
      console.error('Error getting AdSense config:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Create or update AdSense config
   */
  static async upsertAdSenseConfig(req, res) {
    try {
      const configData = req.body;
      const config = await AdsService.upsertAdSenseConfig(configData);
      res.json({ success: true, data: config });
    } catch (error) {
      console.error('Error upserting AdSense config:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Delete AdSense config
   */
  static async deleteAdSenseConfig(req, res) {
    try {
      const { placementKey } = req.params;
      await AdsService.deleteAdSenseConfig(placementKey);
      res.json({ success: true, message: 'AdSense config deleted successfully' });
    } catch (error) {
      console.error('Error deleting AdSense config:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = AdsController;
