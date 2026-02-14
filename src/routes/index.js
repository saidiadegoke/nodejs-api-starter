const express = require('express');
const router = express.Router();

const authRoutes = require('../modules/auth/routes');
const users = require('../modules/users/routes');
const filesRoutes = require('../modules/files/routes');
const ordersRoutes = require('../modules/orders/routes');
// const pollsRoutes = require('../modules/polls/routes');
// const collectionRoutes = require('../modules/polls/collection-routes');
const notificationsRoutes = require('../modules/notifications/routes');
const sharedRoutes = require('../modules/shared/routes');
const websocketRoutes = require('../modules/websocket/routes');
const analyticsRoutes = require('../modules/analytics/routes');
const sitesRoutes = require('../modules/sites/routes');
const templatesRoutes = require('../modules/sites/routes/templates.routes');
const componentsRoutes = require('../modules/sites/routes/components.routes');
const assetsRoutes = require('../modules/assets/routes');
const paymentsRoutes = require('../modules/payments/routes');
const earlyAdoptersRoutes = require('../modules/earlyAdopters/routes');
// const authoringRoutes = require('../modules/authoring/routes');
// const adsRoutes = require('../modules/ads/routes');
const testRoutes = require('./test-routes');

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'OpinionPulse API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * API version info
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'OpinionPulse API v1.0',
    version: '1.0.0',
    endpoints: {
      auth: '/auth',
      users: '/users',
      files: '/files',
      orders: '/orders',
      // polls: '/polls',
      // collections: '/collections',
      notifications: '/notifications',
      websocket: '/websocket',
      analytics: '/analytics',
      // authoring: '/authoring',
      // ads: '/ads',
      health: '/health'
    },
    features: {
      authentication: 'JWT (access + refresh tokens)',
      authorization: 'RBAC (multiple roles per user)',
      file_storage: 'Centralized with multi-provider support',
      order_management: 'Full lifecycle with state machine',
      // poll_management: 'Real-time polls with WebSocket updates',
      real_time: 'WebSocket support enabled'
    }
  });
});

/**
 * Module routes
 */
router.use('/auth', authRoutes);
router.use('/users', users);
router.use('/files', filesRoutes);
router.use('/orders', ordersRoutes);
// router.use('/polls', pollsRoutes);
// router.use('/collections', collectionRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/shared', sharedRoutes);
router.use('/websocket', websocketRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/sites', sitesRoutes);
router.use('/templates', templatesRoutes);
router.use('/components', componentsRoutes);
router.use('/assets', assetsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/early-adopters', earlyAdoptersRoutes);
// Preview draft (store block config for iframe preview; avoids long URLs)
const previewDraftRoutes = require('../modules/preview-draft/preview-draft.routes');
router.use('/preview-draft', previewDraftRoutes);

// Preview routes (public, accessible without /sites prefix)
// Unified preview system: component, template, page, site
const previewRouter = require('express').Router();
const PreviewController = require('../modules/sites/controllers/preview.controller');

// Component preview - GET /preview/component/:componentId
previewRouter.get('/component/:componentId', PreviewController.previewComponent);

// Template preview - GET /preview/template/:templateId
previewRouter.get('/template/:templateId', PreviewController.previewTemplate);

// Page preview - GET /preview/page/:pageId?siteId=:siteId
previewRouter.get('/page/:pageId', PreviewController.previewPage);

// Site preview (JSON config) - GET /preview/site/:siteId?pageSlug=:pageSlug
previewRouter.get('/site/:siteId', PreviewController.previewSite);

// Legacy HTML endpoints (backward compatibility)
// GET /preview/:siteId/html - Site HTML preview
// GET /preview/:siteId/:pageId/html - Page HTML preview
previewRouter.get('/:siteId/html', PreviewController.previewSiteHTML);
previewRouter.get('/:siteId/:pageId/html', PreviewController.previewPageHTML);

router.use('/preview', previewRouter);

// Public API routes for smartstore-app (JSON endpoints, no auth required)
const publicApiRoutes = require('../modules/sites/routes/public.api.routes');
router.use('/public/sites', publicApiRoutes);

// router.use('/authoring', authoringRoutes);
// router.use('/ads', adsRoutes);

/**
 * Test routes (for RBAC testing)
 * Only include in development/test environments
 */
if (process.env.NODE_ENV !== 'production') {
  router.use('/', testRoutes);
}

module.exports = router;
