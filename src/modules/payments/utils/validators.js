const Joi = require('joi');

const PAYMENT_TYPES = [
  'donation',
  'dues',
  'campaign',
  'event',
  'merchandise',
  'subscription',
  'order',
  'invoice',
  'membership',
  'checkout',
  'other',
];

const validatePaymentData = (data) => {
  const schema = Joi.object({
    amount: Joi.number().positive().required(),
    currency: Joi.string().valid('NGN', 'USD', 'GBP', 'EUR').default('NGN'),
    type: Joi.string().valid(...PAYMENT_TYPES).required(),
    payment_type: Joi.string().valid(...PAYMENT_TYPES).optional(),
    campaign_id: Joi.string().uuid().optional(),
    purpose: Joi.string().max(500).allow('', null).optional(),
    anonymous_donor_first_name: Joi.string().max(100).allow('', null).optional(),
    anonymous_donor_last_name: Joi.string().max(100).allow('', null).optional(),
    anonymous_donor_email: Joi.string().email().allow('', null).optional(),
    anonymous_donor_phone: Joi.string().max(20).allow('', null).optional(),
    email: Joi.string().email().allow('', null).optional(),
    donor_email: Joi.string().email().allow('', null).optional(),
    redirect_url: Joi.string().uri().allow('', null).optional(),
    is_recurring: Joi.boolean().default(false),
    recurring_interval: Joi.string()
      .valid('monthly', 'quarterly', 'annually')
      .when('is_recurring', { is: true, then: Joi.required(), otherwise: Joi.optional() }),
    notes: Joi.string().max(1000).allow('', null).optional(),
    metadata: Joi.object().optional(),
    source: Joi.string().default('web'),
    first_name: Joi.string().max(100).allow('', null).optional(),
    payment_method: Joi.string().valid('flutterwave', 'paystack', 'direct_transfer').required(),
  });

  return schema.validate(data);
};

const validateRefundData = (data) => {
  const schema = Joi.object({
    reason: Joi.string().min(5).max(500).required(),
  });
  return schema.validate(data);
};

const validatePaymentMethodData = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    code: Joi.string().pattern(/^[a-z0-9_]+$/).required(),
    type: Joi.string().valid('gateway', 'manual').required(),
    is_active: Joi.boolean().default(true),
    supported_currencies: Joi.array().items(Joi.string().length(3)).default(['NGN']),
    processing_fee: Joi.number().min(0).default(0),
    processing_fee_type: Joi.string().valid('percentage', 'fixed').default('percentage'),
    api_public_key: Joi.string().allow('', null).optional(),
    api_secret_key: Joi.string().allow('', null).optional(),
    webhook_secret: Joi.string().allow('', null).optional(),
    base_url: Joi.string().uri().allow('', null).optional(),
    display_name: Joi.string().max(100).allow('', null).optional(),
    description: Joi.string().max(500).allow('', null).optional(),
    icon_url: Joi.string().uri().allow('', null).optional(),
  });
  return schema.validate(data);
};

module.exports = {
  validatePaymentData,
  validateRefundData,
  validatePaymentMethodData,
};
