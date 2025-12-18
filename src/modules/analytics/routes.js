const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../../shared/middleware/rbac.middleware');
const analyticsController = require('./controllers/analytics.controller');

// All analytics routes require authentication and 'analytics.view' permission
router.use(requireAuth);
router.use(requirePermission('analytics.view'));

// Analytics routes
router.get('/platform-stats', analyticsController.getPlatformStats);
router.get('/user-engagement', analyticsController.getUserEngagement);
router.get('/poll-performance', analyticsController.getPollPerformance);
router.get('/content-stats', analyticsController.getContentStats);
router.get('/trending-topics', analyticsController.getTrendingTopics);
router.get('/growth-metrics', analyticsController.getGrowthMetrics);
router.get('/top-content', analyticsController.getTopContent);
router.get('/user-retention', analyticsController.getUserRetention);

module.exports = router;