const express = require('express');
const router = express.Router();

const authRoutes = require('../modules/auth/routes');
const users = require('../modules/users/routes');
const filesRoutes = require('../modules/files/routes');
const ordersRoutes = require('../modules/orders/routes');
const sharedRoutes = require('../modules/shared/routes');
const testRoutes = require('./test-routes');

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'RunCityGo API is running',
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
    message: 'RunCityGo API v1.0',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      files: '/api/files',
      orders: '/api/orders',
      health: '/api/health'
    },
    features: {
      authentication: 'JWT (access + refresh tokens)',
      authorization: 'RBAC (multiple roles per user)',
      file_storage: 'Centralized with multi-provider support',
      order_management: 'Full lifecycle with state machine',
      real_time: 'WebSocket support (coming soon)'
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
router.use('/shared', sharedRoutes);

/**
 * Test routes (for RBAC testing)
 * Only include in development/test environments
 */
if (process.env.NODE_ENV !== 'production') {
  router.use('/', testRoutes);
}

module.exports = router;
