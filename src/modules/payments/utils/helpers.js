const crypto = require('crypto');

// Generate unique ID
const generateUniqueId = (prefix = '') => {
  const timestamp = Date.now().toString(36);
  const randomStr = crypto.randomBytes(8).toString('hex');
  return `${prefix}${timestamp}_${randomStr}`;
};

// Generate payment ID
const generatePaymentId = () => {
  return generateUniqueId('PAY_');
};

// Generate transaction reference
const generateTransactionRef = () => {
  return generateUniqueId('TXN_');
};

// Generate campaign slug
const generateCampaignSlug = (name) => {
  // Truncate very long names to prevent overly long slugs
  const maxLength = 100; // Leave room for counter suffix
  const truncatedName = name.length > maxLength ? name.substring(0, maxLength) : name;
  
  return truncatedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

// Generate unique campaign slug
const generateUniqueCampaignSlug = async (name, slugExistsChecker) => {
  let baseSlug = generateCampaignSlug(name);
  let finalSlug = baseSlug;
  let counter = 1;
  
  while (await slugExistsChecker(finalSlug)) {
    finalSlug = `${baseSlug}-${counter}`;
    counter++;
    
    // Prevent infinite loop
    if (counter > 100) {
      throw new Error('Unable to generate unique slug after 100 attempts');
    }
  }
  
  return finalSlug;
};

// Validate email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate phone number (Nigerian format)
const isValidPhoneNumber = (phone) => {
  const phoneRegex = /^(\+234|234|0)?[789][01]\d{8}$/;
  return phoneRegex.test(phone);
};

// Validate amount
const isValidAmount = (amount, min = 100, max = 10000000) => {
  return typeof amount === 'number' && amount >= min && amount <= max;
};

// Validate currency
const isValidCurrency = (currency) => {
  const validCurrencies = ['NGN', 'USD', 'GBP', 'EUR'];
  return validCurrencies.includes(currency);
};

// Validate payment type
const isValidPaymentType = (type) => {
  const validTypes = ['donation', 'dues', 'campaign', 'event', 'merchandise'];
  return validTypes.includes(type);
};

// Validate campaign status
const isValidCampaignStatus = (status) => {
  const validStatuses = ['active', 'paused', 'completed', 'cancelled'];
  return validStatuses.includes(status);
};

// Validate payment status
const isValidPaymentStatus = (status) => {
  const validStatuses = ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'];
  return validStatuses.includes(status);
};

// Calculate percentage
const calculatePercentage = (part, total) => {
  if (total === 0) return 0;
  return (part / total) * 100;
};

// Calculate processing fee
const calculateProcessingFee = (amount, feePercentage) => {
  return (amount * feePercentage) / 100;
};

// Calculate net amount
const calculateNetAmount = (amount, feePercentage) => {
  const fee = calculateProcessingFee(amount, feePercentage);
  return amount - fee;
};

// Format amount for display
const formatAmount = (amount, currency = 'NGN') => {
  const formatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatter.format(amount);
};

// Format date
const formatDate = (date, format = 'YYYY-MM-DD') => {
  const d = new Date(date);
  
  switch (format) {
    case 'YYYY-MM-DD':
      return d.toISOString().split('T')[0];
    case 'DD/MM/YYYY':
      return d.toLocaleDateString('en-GB');
    case 'MM/DD/YYYY':
      return d.toLocaleDateString('en-US');
    default:
      return d.toISOString();
  }
};

// Get date range for filtering
const getDateRange = (period) => {
  const now = new Date();
  const startDate = new Date();
  
  switch (period) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(now.getMonth() - 1);
      break;
    case 'quarter':
      startDate.setMonth(now.getMonth() - 3);
      break;
    case 'year':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setDate(now.getDate() - 30); // Default to 30 days
  }
  
  return { startDate, endDate: now };
};

// Generate random string
const generateRandomString = (length = 8) => {
  return crypto.randomBytes(length).toString('hex');
};

// Hash sensitive data
const hashSensitiveData = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

// Mask sensitive data
const maskSensitiveData = (data, type = 'email') => {
  if (!data) return '';
  
  switch (type) {
    case 'email':
      const [username, domain] = data.split('@');
      return `${username.charAt(0)}***@${domain}`;
    case 'phone':
      return data.replace(/(\d{3})\d{3}(\d{4})/, '$1***$2');
    case 'card':
      return data.replace(/(\d{4})\d{8}(\d{4})/, '$1********$2');
    default:
      return data;
  }
};

// Validate UUID
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Sanitize input
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};

// Validate pagination parameters
const validatePagination = (page, limit, maxLimit = 100) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 20;
  
  return {
    page: Math.max(1, pageNum),
    limit: Math.min(maxLimit, Math.max(1, limitNum))
  };
};

// Calculate offset for pagination
const calculateOffset = (page, limit) => {
  return (page - 1) * limit;
};

// Build query filters
const buildQueryFilters = (filters) => {
  const queryFilters = {};
  
  Object.keys(filters).forEach(key => {
    if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
      queryFilters[key] = filters[key];
    }
  });
  
  return queryFilters;
};

// Validate file upload
const validateFileUpload = (file, allowedTypes, maxSize) => {
  if (!file) return { valid: false, error: 'No file provided' };
  
  if (maxSize && file.size > maxSize) {
    return { valid: false, error: 'File size exceeds limit' };
  }
  
  if (allowedTypes && !allowedTypes.includes(file.mimetype)) {
    return { valid: false, error: 'File type not allowed' };
  }
  
  return { valid: true };
};

// Generate receipt number
const generateReceiptNumber = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = crypto.randomBytes(4).toString('hex');
  return `RCP_${timestamp}_${randomStr}`;
};

// Validate webhook signature
const validateWebhookSignature = (payload, signature, secret, algorithm = 'sha256') => {
  const hash = crypto
    .createHmac(algorithm, secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return hash === signature;
};

// Parse amount from string
const parseAmount = (amount) => {
  const parsed = parseFloat(amount);
  return isNaN(parsed) ? 0 : parsed;
};

// Check if date is in the past
const isDateInPast = (date) => {
  return new Date(date) < new Date();
};

// Check if date is in the future
const isDateInFuture = (date) => {
  return new Date(date) > new Date();
};

// Get age from date of birth
const getAge = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

// Debounce function
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Throttle function
const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// Deep clone object
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
};

// Merge objects
const mergeObjects = (...objects) => {
  return objects.reduce((merged, obj) => {
    return { ...merged, ...obj };
  }, {});
};

// Pick specific properties from object
const pick = (obj, keys) => {
  return keys.reduce((result, key) => {
    if (obj.hasOwnProperty(key)) {
      result[key] = obj[key];
    }
    return result;
  }, {});
};

// Omit specific properties from object
const omit = (obj, keys) => {
  return Object.keys(obj).reduce((result, key) => {
    if (!keys.includes(key)) {
      result[key] = obj[key];
    }
    return result;
  }, {});
};

module.exports = {
  generateUniqueId,
  generatePaymentId,
  generateTransactionRef,
  generateCampaignSlug,
  generateUniqueCampaignSlug,
  isValidEmail,
  isValidPhoneNumber,
  isValidAmount,
  isValidCurrency,
  isValidPaymentType,
  isValidCampaignStatus,
  isValidPaymentStatus,
  calculatePercentage,
  calculateProcessingFee,
  calculateNetAmount,
  formatAmount,
  formatDate,
  getDateRange,
  generateRandomString,
  hashSensitiveData,
  maskSensitiveData,
  isValidUUID,
  sanitizeInput,
  validatePagination,
  calculateOffset,
  buildQueryFilters,
  validateFileUpload,
  generateReceiptNumber,
  validateWebhookSignature,
  parseAmount,
  isDateInPast,
  isDateInFuture,
  getAge,
  debounce,
  throttle,
  deepClone,
  mergeObjects,
  pick,
  omit
}; 