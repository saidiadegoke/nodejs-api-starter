const jwt = require('jsonwebtoken');
const User = require('../../auth/models/user.model');

// Authenticate user
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'User account is deactivated'
      });
    }

    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      is_active: user.is_active
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Require admin role
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  next();
};

// Require specific role
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without user
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next(); // Continue without user
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.userId);
    
    if (user && user.is_active) {
      req.user = {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        is_active: user.is_active
      };
    }

    next();
  } catch (error) {
    // Continue without user if token is invalid
    next();
  }
};

// Check if user owns the resource
const requireOwnership = (resourceModel, resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const resourceId = req.params[resourceIdField];
      
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'Resource ID required'
        });
      }

      // Get resource from database
      const resource = await resourceModel.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }

      // Check if user owns the resource or is admin
      const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
      if (resource.user_id !== req.user.id && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Add resource to request object
      req.resource = resource;
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking resource ownership'
      });
    }
  };
};

// Check payment ownership
const requirePaymentOwnership = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Payment ID required'
      });
    }

    // Import Payment model
    const Payment = require('../models/payment.model');
    
    // Get payment from database
    const payment = await Payment.findByPaymentId(id);
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if user owns the payment or is admin
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (payment.donor_id !== req.user.id && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Add payment to request object
    req.payment = payment;
    next();
  } catch (error) {
    console.error('Payment ownership check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking payment ownership'
    });
  }
};

// Check campaign access
const requireCampaignAccess = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID required'
      });
    }

    // Import Campaign model
    const Campaign = require('../models/campaign.model');
    
    // Get campaign from database
    const campaign = await Campaign.findById(id);
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    // Check if campaign is public or user has access
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');
    if (!campaign.is_public && (!req.user || !isAdmin)) {
      return res.status(403).json({
        success: false,
        message: 'Campaign not accessible'
      });
    }

    // Add campaign to request object
    req.campaign = campaign;
    next();
  } catch (error) {
    console.error('Campaign access check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking campaign access'
    });
  }
};

// Rate limiting for authentication attempts
const authRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 authentication attempts per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later'
  }
};

module.exports = {
  authenticate,
  requireAdmin,
  requireRole,
  optionalAuth,
  requireOwnership,
  requirePaymentOwnership,
  requireCampaignAccess,
  authRateLimit
}; 