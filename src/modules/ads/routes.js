/**
 * Ads Routes
 *
 * Defines API endpoints for ad management
 */

const express = require('express');
const router = express.Router();
const AdsController = require('./controllers/ads.controller');
const { authenticate } = require('../../shared/middleware/authenticate.middleware');
const { requireRole } = require('../../shared/middleware/rbac.middleware');

// ========== Public Routes (No authentication required) ==========

// Get placement configuration (public - for displaying ads)
router.get('/placements/:placementKey/config', AdsController.getPlacementConfig);

// Get custom ad for placement (public - for displaying ads)
router.get('/custom/:placementKey', AdsController.getCustomAdForPlacement);

// Record ad impression (public - allows anonymous tracking)
router.post('/track/impression', AdsController.recordImpression);

// Record ad click (public - allows anonymous tracking)
router.post('/track/click', AdsController.recordClick);

// ========== Admin Routes (Requires authentication + admin role) ==========

// Ad Placements Management
router.get('/placements', authenticate, requireRole('admin', 'super_admin'), AdsController.getAllPlacements);
router.get('/placements/location/:locationType', authenticate, requireRole('admin', 'super_admin'), AdsController.getEnabledPlacements);
router.put('/placements/:placementKey', authenticate, requireRole('admin', 'super_admin'), AdsController.updatePlacement);
router.patch('/placements/:placementKey/toggle', authenticate, requireRole('admin', 'super_admin'), AdsController.togglePlacement);

// Custom Ads Management
router.get('/custom', authenticate, requireRole('admin', 'super_admin'), AdsController.getAllCustomAds);
router.get('/custom/ad/:adId', authenticate, requireRole('admin', 'super_admin'), AdsController.getCustomAdById);
router.post('/custom', authenticate, requireRole('admin', 'super_admin'), AdsController.createCustomAd);
router.put('/custom/:adId', authenticate, requireRole('admin', 'super_admin'), AdsController.updateCustomAd);
router.patch('/custom/:adId/toggle', authenticate, requireRole('admin', 'super_admin'), AdsController.toggleCustomAd);
router.delete('/custom/:adId', authenticate, requireRole('admin', 'super_admin'), AdsController.deleteCustomAd);

// Analytics
router.get('/analytics/overall', authenticate, requireRole('admin', 'super_admin'), AdsController.getOverallAnalytics);
router.get('/analytics/comprehensive', authenticate, requireRole('admin', 'super_admin'), AdsController.getComprehensiveAnalytics);
router.get('/analytics/ad/:adId', authenticate, requireRole('admin', 'super_admin'), AdsController.getAdAnalytics);
router.get('/analytics/placement/:placementKey', authenticate, requireRole('admin', 'super_admin'), AdsController.getPlacementAnalytics);

// AdSense Configuration
router.get('/adsense/:placementKey', authenticate, requireRole('admin', 'super_admin'), AdsController.getAdSenseConfig);
router.post('/adsense', authenticate, requireRole('admin', 'super_admin'), AdsController.upsertAdSenseConfig);
router.put('/adsense/:placementKey', authenticate, requireRole('admin', 'super_admin'), AdsController.upsertAdSenseConfig);
router.delete('/adsense/:placementKey', authenticate, requireRole('admin', 'super_admin'), AdsController.deleteAdSenseConfig);

module.exports = router;
