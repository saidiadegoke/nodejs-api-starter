const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../../config/env.config');
const AuthService = require('../../modules/auth/services/auth.service');
const { logger } = require('../utils/logger');

/**
 * Optional Authentication middleware
 * Verifies JWT token if present, but doesn't fail if missing
 * Useful for endpoints that work for both authenticated and anonymous users
 */
const optionalAuth = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    // If no auth header, just continue without user
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];

    // If no token, continue without user
    if (!token) {
      req.user = null;
      return next();
    }

    try {
      // Verify token
      const payload = jwt.verify(token, jwtSecret);

      // Role name strings only (ignore any legacy object blobs in the `roles` claim)
      req.user = {
        user_id: payload.user_id,
        roles: AuthService.rolesClaimForToken(payload.roles || []),
        session_id: payload.session_id,
        type: payload.type
      };

    } catch (error) {
      // Token is invalid, but that's okay for optional auth
      // Just continue without user
      logger.debug('Optional auth - invalid token, continuing as anonymous', {
        error: error.message,
        path: req.path
      });
      req.user = null;
    }

    next();
  } catch (error) {
    // Any other error, log it but still continue
    logger.error('Optional authentication error', {
      error: error.message,
      path: req.path
    });
    req.user = null;
    next();
  }
};

module.exports = { optionalAuth };
