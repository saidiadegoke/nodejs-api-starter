const pool = require('../../db/pool');
const { sendError } = require('../utils/response');
const { FORBIDDEN, UNAUTHORIZED } = require('../constants/statusCodes');

/**
 * Check if user has a specific role
 * @param {string} userId - User ID
 * @param {string} roleName - Role name to check
 * @returns {Promise<boolean>}
 */
const hasRole = async (userId, roleName) => {
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1 
      AND r.name = $2
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
    ) AS has_role`,
    [userId, roleName]
  );
  return result.rows[0].has_role;
};

/**
 * Check if user has a specific permission
 * @param {string} userId - User ID
 * @param {string} permissionName - Permission name (e.g., 'orders.create')
 * @returns {Promise<boolean>}
 */
const hasPermission = async (userId, permissionName) => {
  const result = await pool.query(
    `SELECT EXISTS (
      -- Check direct user permissions (not denied)
      SELECT 1 FROM user_permissions up
      JOIN permissions p ON up.permission_id = p.id
      WHERE up.user_id = $1 
      AND p.name = $2
      AND up.granted = true
      AND (up.expires_at IS NULL OR up.expires_at > NOW())
      
      UNION
      
      -- Check permissions via roles
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = $1 
      AND p.name = $2
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      
      -- Exclude if explicitly denied in user_permissions
      AND NOT EXISTS (
        SELECT 1 FROM user_permissions up2
        WHERE up2.user_id = $1 
        AND up2.permission_id = p.id
        AND up2.granted = false
      )
    ) AS has_permission`,
    [userId, permissionName]
  );
  return result.rows[0].has_permission;
};

/**
 * Get all roles for a user
 * @param {string} userId - User ID
 * @returns {Promise<string[]>}
 */
const getUserRoles = async (userId) => {
  const result = await pool.query(
    `SELECT r.name FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     WHERE ur.user_id = $1
     AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
    [userId]
  );
  return result.rows.map(row => row.name);
};

/**
 * Get all permissions for a user (via roles and direct permissions)
 * @param {string} userId - User ID
 * @returns {Promise<string[]>}
 */
const getUserPermissions = async (userId) => {
  const result = await pool.query(
    `SELECT DISTINCT p.name FROM (
      -- Direct user permissions (not denied)
      SELECT p.id, p.name FROM user_permissions up
      JOIN permissions p ON up.permission_id = p.id
      WHERE up.user_id = $1 
      AND up.granted = true
      AND (up.expires_at IS NULL OR up.expires_at > NOW())
      
      UNION
      
      -- Permissions via roles (not explicitly denied)
      SELECT p.id, p.name FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = $1 
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND NOT EXISTS (
        SELECT 1 FROM user_permissions up2
        WHERE up2.user_id = $1 
        AND up2.permission_id = p.id
        AND up2.granted = false
      )
    ) p`,
    [userId]
  );
  return result.rows.map(row => row.name);
};

/**
 * Middleware: Require user to be authenticated
 * Uses the authenticate middleware from authenticate.middleware.js
 */
const { authenticate } = require('./authenticate.middleware');
const requireAuth = authenticate;

/**
 * Middleware: Require user to have at least one of the specified roles
 * @param {...string} roleNames - Role names (e.g., 'admin', 'shopper')
 * @returns {Function} Express middleware
 */
const requireRole = (...roleNames) => {
  return async (req, res, next) => {
    // First check if user is authenticated
    if (!req.user || !req.user.user_id) {
      return sendError(res, 'Authentication required', UNAUTHORIZED);
    }

    try {
      // Get roles from database
      const userRoles = await getUserRoles(req.user.user_id);
      
      // Check if user has any of the required roles
      const hasRequiredRole = roleNames.some(roleName => 
        userRoles.includes(roleName)
      );

      if (!hasRequiredRole) {
        return sendError(
          res, 
          `Access denied. Required role(s): ${roleNames.join(', ')}`,
          FORBIDDEN,
          { required_roles: roleNames, user_roles: userRoles }
        );
      }

      // Attach roles to request for later use
      req.user.roles = userRoles;
      next();
    } catch (error) {
      console.error('Error in requireRole middleware:', error);
      return sendError(res, 'Error checking user roles', 500);
    }
  };
};

/**
 * Middleware: Require user to have at least one of the specified permissions
 * @param {...string} permissionNames - Permission names (e.g., 'orders.create')
 * @returns {Function} Express middleware
 */
const requirePermission = (...permissionNames) => {
  return async (req, res, next) => {
    if (!req.user || !req.user.user_id) {
      return sendError(res, 'Authentication required', UNAUTHORIZED);
    }

    try {
      // Check if user has any of the required permissions
      const hasRequiredPermission = await Promise.any(
        permissionNames.map(permName => hasPermission(req.user.user_id, permName))
      ).catch(() => false);

      if (!hasRequiredPermission) {
        return sendError(
          res, 
          `Access denied. Required permission(s): ${permissionNames.join(', ')}`,
          FORBIDDEN,
          { required_permissions: permissionNames }
        );
      }

      next();
    } catch (error) {
      return sendError(res, 'Error checking user permissions', 500);
    }
  };
};

/**
 * Middleware: Require user to have ALL specified permissions
 * @param {...string} permissionNames - Permission names
 * @returns {Function} Express middleware
 */
const requireAllPermissions = (...permissionNames) => {
  return async (req, res, next) => {
    if (!req.user || !req.user.user_id) {
      return sendError(res, 'Authentication required', UNAUTHORIZED);
    }

    try {
      // Check if user has ALL required permissions
      const checks = await Promise.all(
        permissionNames.map(permName => hasPermission(req.user.user_id, permName))
      );

      const hasAllPermissions = checks.every(has => has === true);

      if (!hasAllPermissions) {
        return sendError(
          res, 
          `Access denied. All permissions required: ${permissionNames.join(', ')}`,
          FORBIDDEN,
          { required_permissions: permissionNames }
        );
      }

      next();
    } catch (error) {
      return sendError(res, 'Error checking user permissions', 500);
    }
  };
};

/**
 * Middleware: Check if user can access their own resource or is admin
 * @param {string} paramName - Parameter name in req.params (default: 'user_id')
 */
const requireOwnerOrAdmin = (paramName = 'user_id') => {
  return async (req, res, next) => {
    if (!req.user || !req.user.user_id) {
      return sendError(res, 'Authentication required', UNAUTHORIZED);
    }

    const resourceUserId = req.params[paramName];
    const isOwner = req.user.user_id === resourceUserId;
    const isAdmin = await hasRole(req.user.user_id, 'admin') || await hasRole(req.user.user_id, 'super_admin');

    if (!isOwner && !isAdmin) {
      return sendError(
        res, 
        'Access denied. You can only access your own resources.',
        FORBIDDEN
      );
    }

    next();
  };
};

module.exports = {
  hasRole,
  hasPermission,
  getUserRoles,
  getUserPermissions,
  requireAuth,
  requireRole,
  requirePermission,
  requireAllPermissions,
  requireOwnerOrAdmin
};

