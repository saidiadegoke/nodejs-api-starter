const { sendError } = require('../utils/response');
const { UNAUTHORIZED, FORBIDDEN } = require('../constants/statusCodes');

/**
 * Authentication middleware (placeholder)
 * In production, implement JWT verification
 */
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return sendError(res, 'Authentication required', UNAUTHORIZED);
  }
  
  // TODO: Implement JWT verification
  // For now, just pass through
  next();
};

/**
 * Authorization middleware
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required', UNAUTHORIZED);
    }
    
    if (roles.length && !roles.includes(req.user.role)) {
      return sendError(res, 'Insufficient permissions', FORBIDDEN);
    }
    
    next();
  };
};

module.exports = { authenticate, authorize };

