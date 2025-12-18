const express = require('express');
const router = express.Router();

const authRoutes = require('../modules/auth/routes');
const users = require('../modules/users/routes');
const filesRoutes = require('../modules/files/routes');
const ordersRoutes = require('../modules/orders/routes');
const pollsRoutes = require('../modules/polls/routes');
const notificationsRoutes = require('../modules/notifications/routes');
const sharedRoutes = require('../modules/shared/routes');
const websocketRoutes = require('../modules/websocket/routes');
const analyticsRoutes = require('../modules/analytics/routes');
const authoringRoutes = require('../modules/authoring/routes');
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
      polls: '/polls',
      notifications: '/notifications',
      websocket: '/websocket',
      analytics: '/analytics',
      authoring: '/authoring',
      health: '/health'
    },
    features: {
      authentication: 'JWT (access + refresh tokens)',
      authorization: 'RBAC (multiple roles per user)',
      file_storage: 'Centralized with multi-provider support',
      order_management: 'Full lifecycle with state machine',
      poll_management: 'Real-time polls with WebSocket updates',
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
router.use('/polls', pollsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/shared', sharedRoutes);
router.use('/websocket', websocketRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/authoring', authoringRoutes);

/**
 * Test routes (for RBAC testing)
 * Only include in development/test environments
 */
if (process.env.NODE_ENV !== 'production') {
  router.use('/', testRoutes);
}

module.exports = router;
