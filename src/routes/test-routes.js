/**
 * Test Routes for RBAC Middleware
 *
 * These endpoints demonstrate the RBAC middleware helpers and are only
 * mounted when NODE_ENV !== 'production'. Use them as a reference for
 * wiring up your own protected routes; the permissions referenced below
 * (e.g. "items.accept") are illustrative — seed whatever permissions
 * your app actually needs.
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

/** Current user's roles */
router.get('/users/me/roles', requireAuth, async (req, res) => {
  try {
    const roles = await getUserRoles(req.user.user_id);
    sendSuccess(res, { roles }, 'Roles retrieved successfully');
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Error retrieving roles' } });
  }
});

/** Current user's permissions */
router.get('/users/me/permissions', requireAuth, async (req, res) => {
  try {
    const permissions = await getUserPermissions(req.user.user_id);
    sendSuccess(res, { permissions }, 'Permissions retrieved successfully');
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Error retrieving permissions' } });
  }
});

/** Check a specific permission */
router.post('/users/me/check-permission', requireAuth, async (req, res) => {
  try {
    const { permission } = req.body;
    const { hasPermission } = require('../shared/middleware/rbac.middleware');
    const has = await hasPermission(req.user.user_id, permission);
    sendSuccess(res, { permission, has_permission: has }, 'Permission check completed');
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Error checking permission' } });
  }
});

/** Example: role-gated endpoint */
router.get('/admin-only',
  requireAuth,
  requireRole('admin', 'super_admin'),
  (req, res) => {
    sendSuccess(res, {
      user_roles: req.user.roles,
      message: 'Admin-only endpoint (mock)'
    });
  }
);

/** Example: single-permission-gated endpoint */
router.post('/items/:item_id/accept',
  requireAuth,
  requirePermission('items.accept'),
  (req, res) => {
    sendSuccess(res, { item_id: req.params.item_id, status: 'accepted' });
  }
);

/** Example: multiple-permissions-gated endpoint */
router.delete('/items/:item_id',
  requireAuth,
  requireAllPermissions('items.delete', 'items.manage'),
  (req, res) => {
    sendSuccess(res, { item_id: req.params.item_id, deleted: true });
  }
);

/** Example: owner-or-admin-gated endpoint */
router.get('/users/:user_id/items',
  requireAuth,
  requireOwnerOrAdmin('user_id'),
  (req, res) => {
    sendSuccess(res, { user_id: req.params.user_id, items: [] });
  }
);

module.exports = router;
