const Joi = require('joi');

// Payment data validation
const validatePaymentData = (data) => {
  const schema = Joi.object({
    amount: Joi.number().positive().required().messages({
      'number.base': 'Amount must be a number',
      'number.positive': 'Amount must be positive',
      'any.required': 'Amount is required'
    }),
    currency: Joi.string().valid('NGN', 'USD', 'GBP', 'EUR').default('NGN'),
    type: Joi.string().valid('donation', 'dues', 'campaign', 'event', 'merchandise', 'subscription').required(),
    payment_type: Joi.string().valid('donation', 'dues', 'campaign', 'event', 'merchandise', 'subscription').optional(),
    status: Joi.string().valid('pending', 'processing', 'completed', 'failed', 'cancelled').default('pending'),
    campaign_id: Joi.string().uuid().optional(),
    donor_id: Joi.string().uuid().optional(),
    purpose: Joi.string().max(500).optional(),
    anonymous_donor_first_name: Joi.string().max(100).optional(),
    anonymous_donor_last_name: Joi.string().max(100).optional(),
    anonymous_donor_email: Joi.string().email().optional(),
    anonymous_donor_phone: Joi.string().max(20).optional(),
    email: Joi.string().email().optional(), // Allow email field for payment processors (Paystack requires it)
    donor_email: Joi.string().email().optional(), // Allow donor_email as alternative
    redirect_url: Joi.string().optional(),
    is_recurring: Joi.boolean().default(false),
    recurring_interval: Joi.string().valid('monthly', 'quarterly', 'annually').when('is_recurring', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    notes: Joi.string().max(1000).optional(),
    metadata: Joi.object().optional(),
    source: Joi.string().default('web'),
    user_agent: Joi.string().optional(),
    ip_address: Joi.string().optional(),

    payment_method: Joi.string().valid('flutterwave', 'paystack', 'direct_transfer').required()

  });

  return schema.validate(data);
};

// Payment verification validation
const validatePaymentVerification = (data) => {
  const schema = Joi.object({
    reference: Joi.string().required(),
    processor: Joi.string().valid('paystack', 'flutterwave', 'direct_transfer').required()
  });

  return schema.validate(data);
};

// Campaign data validation
const validateCampaignData = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(255).required(),
    slug: Joi.string().pattern(/^[a-z0-9-]+$/).optional(),
    description: Joi.string().max(1000).optional(),
    type: Joi.string().valid('donation', 'dues', 'event', 'merchandise', 'general').required(),
    target_amount: Joi.number().positive().optional(),
    currency: Joi.string().valid('NGN', 'USD', 'GBP', 'EUR').default('NGN'),
    status: Joi.string().valid('active', 'paused', 'completed', 'cancelled').default('active'),
    is_public: Joi.boolean().default(true),
    allow_anonymous: Joi.boolean().default(true),
    min_amount: Joi.number().positive().optional(),
    max_amount: Joi.number().positive().optional(),
    suggested_amounts: Joi.array().items(Joi.number().positive()).optional(),
    start_date: Joi.date().optional(),
    end_date: Joi.date().optional(),
    image_url: Joi.alternatives().try(
      Joi.string().uri(),
      Joi.string().uuid()
    ).optional(),
    gallery: Joi.array().items(Joi.string().uri()).optional(),
    short_description: Joi.string().max(300).optional(),
    long_description: Joi.string().max(5000).optional(),
    requires_approval: Joi.boolean().default(false),
    categories: Joi.array().items(Joi.string()).optional(),
    tags: Joi.array().items(Joi.string()).optional()
  });

  return schema.validate(data);
};

// Campaign update validation
const validateCampaignUpdate = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(255).optional(),
    slug: Joi.string().pattern(/^[a-z0-9-]+$/).optional(),
    description: Joi.string().max(1000).optional(),
    type: Joi.string().valid('donation', 'dues', 'event', 'merchandise', 'general').optional(),
    target_amount: Joi.number().positive().optional(),
    currency: Joi.string().valid('NGN', 'USD', 'GBP', 'EUR').optional(),
    status: Joi.string().valid('active', 'paused', 'completed', 'cancelled').optional(),
    is_public: Joi.boolean().optional(),
    allow_anonymous: Joi.boolean().optional(),
    min_amount: Joi.number().positive().optional(),
    max_amount: Joi.number().positive().optional(),
    suggested_amounts: Joi.array().items(Joi.number().positive()).optional(),
    start_date: Joi.date().optional(),
    end_date: Joi.date().optional(),
    image_url: Joi.alternatives().try(
      Joi.string().uri(),
      Joi.string().uuid()
    ).optional(),
    gallery: Joi.array().items(Joi.string().uri()).optional(),
    short_description: Joi.string().max(300).optional(),
    long_description: Joi.string().max(5000).optional(),
    requires_approval: Joi.boolean().optional(),
    categories: Joi.array().items(Joi.string()).optional(),
    tags: Joi.array().items(Joi.string()).optional()
  }).unknown(true);

  return schema.validate(data);
};

// Status update validation
const validateStatusUpdate = (data) => {
  const schema = Joi.object({
    status: Joi.string().valid('active', 'paused', 'completed', 'cancelled').required()
  });

  return schema.validate(data);
};

// Refund data validation
const validateRefundData = (data) => {
  const schema = Joi.object({
    reason: Joi.string().min(10).max(500).required()
  });

  return schema.validate(data);
};

// Payment method validation
const validatePaymentMethodData = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    code: Joi.string().pattern(/^[a-z_]+$/).required(),
    type: Joi.string().valid('gateway', 'manual').required(),
    is_active: Joi.boolean().default(true),
    supported_currencies: Joi.array().items(Joi.string().length(3)).default(['NGN']),
    processing_fee: Joi.number().min(0).default(0),
    processing_fee_type: Joi.string().valid('percentage', 'fixed').default('percentage'),
    api_public_key: Joi.string().optional(),
    api_secret_key: Joi.string().optional(),
    webhook_secret: Joi.string().optional(),
    base_url: Joi.string().uri().optional(),
    display_name: Joi.string().max(100).optional(),
    description: Joi.string().max(500).optional(),
    icon_url: Joi.string().uri().optional()
  });

  return schema.validate(data);
};

// Donor data validation
const validateDonorData = (data) => {
  const schema = Joi.object({
    first_name: Joi.string().max(100).optional(),
    last_name: Joi.string().max(100).optional(),
    email: Joi.string().email().required(),
    phone: Joi.string().max(20).optional(),
    user_id: Joi.string().uuid().optional(),
    is_anonymous: Joi.boolean().default(false),
    marketing_consent: Joi.boolean().default(false),
    receipt_preference: Joi.string().valid('email', 'sms', 'none').default('email'),
    address_street: Joi.string().max(255).optional(),
    address_city: Joi.string().max(100).optional(),
    address_state: Joi.string().max(100).optional(),
    address_country: Joi.string().max(100).optional(),
    address_zip_code: Joi.string().max(20).optional(),
    is_active: Joi.boolean().default(true),
    is_blocked: Joi.boolean().default(false),
    notes: Joi.string().max(1000).optional()
  });

  return schema.validate(data);
};

// Amount validation
const validateAmount = (amount, min = 100, max = 10000000) => {
  const schema = Joi.number().min(min).max(max).required();
  return schema.validate(amount);
};

// Currency validation
const validateCurrency = (currency) => {
  const schema = Joi.string().valid('NGN', 'USD', 'GBP', 'EUR').required();
  return schema.validate(currency);
};

// Payment type validation
const validatePaymentType = (type) => {
  const schema = Joi.string().valid('donation', 'dues', 'campaign', 'event', 'merchandise', 'subscription').required();
  return schema.validate(type);
};

// Pagination validation
const validatePagination = (data) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  });

  return schema.validate(data);
};

// Date range validation
const validateDateRange = (data) => {
  const schema = Joi.object({
    start_date: Joi.date().optional(),
    end_date: Joi.date().min(Joi.ref('start_date')).optional()
  });

  return schema.validate(data);
};

module.exports = {
  validatePaymentData,
  validatePaymentVerification,
  validateCampaignData,
  validateCampaignUpdate,
  validateStatusUpdate,
  validateRefundData,
  validatePaymentMethodData,
  validateDonorData,
  validateAmount,
  validateCurrency,
  validatePaymentType,
  validatePagination,
  validateDateRange
}; 