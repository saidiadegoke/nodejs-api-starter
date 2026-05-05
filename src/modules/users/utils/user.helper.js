/**
 * User helper utilities
 */

/**
 * Sanitize user data (remove sensitive fields)
 */
const sanitizeUser = (user) => {
  const { password_hash, ...sanitized } = user;
  return sanitized;
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone format
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[\d\s-()]+$/;
  return phoneRegex.test(phone);
};

module.exports = {
  sanitizeUser,
  isValidEmail,
  isValidPhone,
};


