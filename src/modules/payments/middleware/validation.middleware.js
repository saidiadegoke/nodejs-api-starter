const validators = require('../utils/validators');

// Validate payment data
const validatePaymentData = (req, res, next) => {
  const { error } = validators.validatePaymentData(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }
  
  next();
};

// Validate campaign data
const validateCampaignData = (req, res, next) => {
  const { error } = validators.validateCampaignData(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }
  
  next();
};

// Validate campaign update
const validateCampaignUpdate = (req, res, next) => {
  const { error } = validators.validateCampaignUpdate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }
  
  next();
};

// Validate status update
const validateStatusUpdate = (req, res, next) => {
  const { error } = validators.validateStatusUpdate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }
  
  next();
};

// Validate refund data
const validateRefundData = (req, res, next) => {
  const { error } = validators.validateRefundData(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }
  
  next();
};

// Validate payment method data
const validatePaymentMethodData = (req, res, next) => {
  const { error } = validators.validatePaymentMethodData(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }
  
  next();
};

// Validate donor data
const validateDonorData = (req, res, next) => {
  const { error } = validators.validateDonorData(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }
  
  next();
};

// Validate pagination parameters
const validatePagination = (req, res, next) => {
  const { error } = validators.validatePagination(req.query);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }
  
  next();
};

// Validate date range
const validateDateRange = (req, res, next) => {
  const { error } = validators.validateDateRange(req.query);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(detail => detail.message)
    });
  }
  
  next();
};

// Validate amount
const validateAmount = (min = 100, max = 10000000) => {
  return (req, res, next) => {
    const { amount } = req.body;
    
    if (!amount || typeof amount !== 'number' || amount < min || amount > max) {
      return res.status(400).json({
        success: false,
        message: `Amount must be a number between ${min} and ${max}`
      });
    }
    
    next();
  };
};

// Validate currency
const validateCurrency = (req, res, next) => {
  const { currency } = req.body;
  const validCurrencies = ['NGN', 'USD', 'GBP', 'EUR'];
  
  if (currency && !validCurrencies.includes(currency)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid currency. Supported currencies: NGN, USD, GBP, EUR'
    });
  }
  
  next();
};

// Validate payment type
const validatePaymentType = (req, res, next) => {
  const { type } = req.body;
  const validTypes = ['donation', 'dues', 'campaign', 'event', 'merchandise', 'subscription'];
  
  if (type && !validTypes.includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid payment type'
    });
  }
  
  next();
};

// Validate campaign status
const validateCampaignStatus = (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['active', 'paused', 'completed', 'cancelled'];
  
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid campaign status'
    });
  }
  
  next();
};

// Validate payment status
const validatePaymentStatus = (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'];
  
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid payment status'
    });
  }
  
  next();
};

// Validate email
const validateEmail = (req, res, next) => {
  const { email } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (email && !emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid email format'
    });
  }
  
  next();
};

// Validate phone number
const validatePhoneNumber = (req, res, next) => {
  const { phone } = req.body;
  const phoneRegex = /^(\+234|234|0)?[789][01]\d{8}$/;
  
  if (phone && !phoneRegex.test(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid phone number format'
    });
  }
  
  next();
};

// Validate UUID
const validateUUID = (paramName = 'id') => {
  return (req, res, next) => {
    const uuid = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (uuid && !uuidRegex.test(uuid)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UUID format'
      });
    }
    
    next();
  };
};

// Validate file upload
const validateFileUpload = (allowedTypes, maxSize = 5 * 1024 * 1024) => {
  return (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    if (maxSize && req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds limit'
      });
    }
    
    if (allowedTypes && !allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'File type not allowed'
      });
    }
    
    next();
  };
};

// Sanitize input
const sanitizeInput = (req, res, next) => {
  // Sanitize body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim().replace(/[<>]/g, '');
      }
    });
  }
  
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim().replace(/[<>]/g, '');
      }
    });
  }
  
  next();
};

// Validate required fields
const validateRequiredFields = (fields) => {
  return (req, res, next) => {
    const missingFields = [];
    
    fields.forEach(field => {
      if (!req.body[field] || req.body[field].toString().trim() === '') {
        missingFields.push(field);
      }
    });
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }
    
    next();
  };
};

// Validate array fields
const validateArrayFields = (fieldName, minLength = 1, maxLength = 100) => {
  return (req, res, next) => {
    const field = req.body[fieldName];
    
    if (field && !Array.isArray(field)) {
      return res.status(400).json({
        success: false,
        message: `${fieldName} must be an array`
      });
    }
    
    if (field && field.length < minLength) {
      return res.status(400).json({
        success: false,
        message: `${fieldName} must have at least ${minLength} item(s)`
      });
    }
    
    if (field && field.length > maxLength) {
      return res.status(400).json({
        success: false,
        message: `${fieldName} must have at most ${maxLength} item(s)`
      });
    }
    
    next();
  };
};

// Validate boolean fields
const validateBooleanFields = (fields) => {
  return (req, res, next) => {
    fields.forEach(field => {
      if (req.body[field] !== undefined && typeof req.body[field] !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: `${field} must be a boolean`
        });
      }
    });
    
    next();
  };
};

// Validate numeric fields
const validateNumericFields = (fields, min = null, max = null) => {
  return (req, res, next) => {
    fields.forEach(field => {
      const value = req.body[field];
      
      if (value !== undefined) {
        if (typeof value !== 'number' || isNaN(value)) {
          return res.status(400).json({
            success: false,
            message: `${field} must be a number`
          });
        }
        
        if (min !== null && value < min) {
          return res.status(400).json({
            success: false,
            message: `${field} must be at least ${min}`
          });
        }
        
        if (max !== null && value > max) {
          return res.status(400).json({
            success: false,
            message: `${field} must be at most ${max}`
          });
        }
      }
    });
    
    next();
  };
};

module.exports = {
  validatePaymentData,
  validateCampaignData,
  validateCampaignUpdate,
  validateStatusUpdate,
  validateRefundData,
  validatePaymentMethodData,
  validateDonorData,
  validatePagination,
  validateDateRange,
  validateAmount,
  validateCurrency,
  validatePaymentType,
  validateCampaignStatus,
  validatePaymentStatus,
  validateEmail,
  validatePhoneNumber,
  validateUUID,
  validateFileUpload,
  sanitizeInput,
  validateRequiredFields,
  validateArrayFields,
  validateBooleanFields,
  validateNumericFields
}; 