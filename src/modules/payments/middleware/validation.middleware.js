const validators = require('../utils/validators');

const validatePaymentData = (req, res, next) => {
  const { error } = validators.validatePaymentData(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }
  next();
};

const validateRefundData = (req, res, next) => {
  const { error } = validators.validateRefundData(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }
  next();
};

const validatePaymentMethodData = (req, res, next) => {
  const { error } = validators.validatePaymentMethodData(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }
  next();
};

module.exports = {
  validatePaymentData,
  validateRefundData,
  validatePaymentMethodData,
};
