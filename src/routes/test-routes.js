/**
 * Test Routes for RBAC Middleware
 * These routes demonstrate how to use RBAC middleware
 */

const router = require('express').Router();
const { 
  requireAuth, 
  requireRole, 
  requirePermission,
  requireAllPermissions,
  requireOwnerOrAdmin,
  getUserRoles,
  getUserPermissions
} = require('../shared/middleware/rbac.middleware');
const { sendSuccess } = require('../shared/utils/response');

/**
 * Get current user's roles
 * @route GET /users/me/roles
 */
router.get('/users/me/roles', requireAuth, async (req, res) => {
  try {
    const roles = await getUserRoles(req.user.user_id);
    sendSuccess(res, { roles }, 'Roles retrieved successfully');
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: { message: 'Error retrieving roles' } 
    });
  }
});

/**
 * Get current user's permissions
 * @route GET /users/me/permissions
 */
router.get('/users/me/permissions', requireAuth, async (req, res) => {
  try {
    const permissions = await getUserPermissions(req.user.user_id);
    sendSuccess(res, { permissions }, 'Permissions retrieved successfully');
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: { message: 'Error retrieving permissions' } 
    });
  }
});

/**
 * Check if user has specific permission
 * @route POST /users/me/check-permission
 */
router.post('/users/me/check-permission', requireAuth, async (req, res) => {
  try {
    const { permission } = req.body;
    const { hasPermission } = require('../shared/middleware/rbac.middleware');
    
    const has = await hasPermission(req.user.user_id, permission);
    sendSuccess(res, { 
      permission, 
      has_permission: has 
    }, 'Permission check completed');
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: { message: 'Error checking permission' } 
    });
  }
});

/**
 * Example: Endpoint requiring specific role
 * @route GET /available-orders
 * @access Shopper or Dispatcher only
 */
router.get('/available-orders', 
  requireAuth,  // First authenticate
  requireRole('shopper', 'dispatcher'), // Then check role
  (req, res) => {
    // Mock response for testing
    const { latitude, longitude } = req.query;
    
    sendSuccess(res, {
      orders: [],
      user_roles: req.user.roles,
      message: 'Available orders (mock data for testing)'
    });
  }
);

/**
 * Example: Endpoint requiring specific permission
 * @route POST /orders/:order_id/accept
 * @access Requires 'orders.accept' permission
 */
router.post('/orders/:order_id/accept',
  requireAuth,
  requirePermission('orders.accept'),
  (req, res) => {
    const { order_id } = req.params;
    
    sendSuccess(res, {
      order_id,
      status: 'accepted',
      message: 'Order accepted (mock for testing)'
    });
  }
);

/**
 * Example: Endpoint requiring multiple permissions
 * @route DELETE /orders/:order_id
 * @access Requires both 'orders.delete' AND 'orders.manage'
 */
router.delete('/orders/:order_id',
  requireAuth,
  requireAllPermissions('orders.delete', 'orders.manage'),
  (req, res) => {
    const { order_id } = req.params;
    
    sendSuccess(res, {
      order_id,
      deleted: true,
      message: 'Order deleted (mock for testing)'
    });
  }
);

/**
 * Example: Endpoint requiring owner or admin
 * @route GET /users/:user_id/orders
 * @access Owner or Admin only
 */
router.get('/users/:user_id/orders',
  requireAuth,
  requireOwnerOrAdmin('user_id'),
  (req, res) => {
    const { user_id } = req.params;
    
    sendSuccess(res, {
      user_id,
      orders: [],
      message: 'User orders (mock for testing)'
    });
  }
);

/**
 * Admin-only endpoints
 */
router.get('/admin/dashboard/stats',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    sendSuccess(res, {
      stats: {
        total_users: 0,
        total_orders: 0,
        revenue: 0
      },
      message: 'Admin dashboard stats (mock for testing)'
    });
  }
);

router.get('/admin/users',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    sendSuccess(res, {
      users: [],
      message: 'All users (mock for testing)'
    });
  }
);

router.get('/admin/users/:user_id',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    const { user_id } = req.params;
    
    sendSuccess(res, {
      user_id,
      user: null,
      message: 'User details (mock for testing)'
    });
  }
);

module.exports = router;

