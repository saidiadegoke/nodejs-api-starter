const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../../config/env.config');
const { sendError } = require('../utils/response');
const { UNAUTHORIZED } = require('../constants/statusCodes');
const { logger } = require('../utils/logger');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'Authentication required', UNAUTHORIZED);
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return sendError(res, 'Authentication required', UNAUTHORIZED);
    }
    
    // Verify token directly (don't depend on AuthService to avoid circular dependency)
    const payload = jwt.verify(token, jwtSecret);
    
    // Attach user info to request (with roles from JWT)
    req.user = {
      user_id: payload.user_id,
      roles: payload.roles || [],
      session_id: payload.session_id,
      type: payload.type
    };
    
    next();
  } catch (error) {
    logger.error('Authentication failed', { 
      error: error.message,
      path: req.path
    });
    return sendError(res, 'Invalid or expired token', UNAUTHORIZED);
  }
};

module.exports = { authenticate };

