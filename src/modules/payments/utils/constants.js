// Payment statuses
const PAYMENT_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled'
};

// Payment types
const PAYMENT_TYPES = {
  DONATION: 'donation',
  DUES: 'dues',
  CAMPAIGN: 'campaign',
  EVENT: 'event',
  MERCHANDISE: 'merchandise'
};

// Campaign statuses
const CAMPAIGN_STATUSES = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Campaign types
const CAMPAIGN_TYPES = {
  DONATION: 'donation',
  DUES: 'dues',
  EVENT: 'event',
  MERCHANDISE: 'merchandise',
  GENERAL: 'general'
};

// Payment methods
const PAYMENT_METHODS = {
  PAYSTACK: 'paystack',
  FLUTTERWAVE: 'flutterwave',
  BANK_TRANSFER: 'bank_transfer'
};

// Payment method types
const PAYMENT_METHOD_TYPES = {
  GATEWAY: 'gateway',
  MANUAL: 'manual'
};

// Currencies
const CURRENCIES = {
  NGN: 'NGN',
  USD: 'USD',
  GBP: 'GBP',
  EUR: 'EUR'
};

// Recurring intervals
const RECURRING_INTERVALS = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  ANNUALLY: 'annually'
};

// Receipt preferences
const RECEIPT_PREFERENCES = {
  EMAIL: 'email',
  SMS: 'sms',
  NONE: 'none'
};

// Minimum and maximum amounts
const AMOUNT_LIMITS = {
  MIN_DONATION: 100, // 100 NGN
  MAX_DONATION: 10000000, // 10M NGN
  MIN_DUES: 1000, // 1K NGN
  MAX_DUES: 50000, // 50K NGN
  MIN_CAMPAIGN: 500, // 500 NGN
  MAX_CAMPAIGN: 5000000 // 5M NGN
};

// Processing fees (in percentage)
const PROCESSING_FEES = {
  PAYSTACK: 1.5,
  FLUTTERWAVE: 1.4,
  BANK_TRANSFER: 0
};

// Webhook events
const WEBHOOK_EVENTS = {
  PAYSTACK: {
    CHARGE_SUCCESS: 'charge.success',
    TRANSFER_SUCCESS: 'transfer.success',
    REFUND_SUCCESS: 'refund.success'
  },
  FLUTTERWAVE: {
    PAYMENT_SUCCESS: 'payment.success',
    TRANSFER_SUCCESS: 'transfer.success',
    REFUND_SUCCESS: 'refund.success'
  }
};

// Error messages
const ERROR_MESSAGES = {
  INVALID_AMOUNT: 'Invalid amount provided',
  INVALID_CURRENCY: 'Invalid currency provided',
  INVALID_PAYMENT_TYPE: 'Invalid payment type',
  INVALID_CAMPAIGN: 'Invalid or inactive campaign',
  PAYMENT_NOT_FOUND: 'Payment not found',
  CAMPAIGN_NOT_FOUND: 'Campaign not found',
  DONOR_NOT_FOUND: 'Donor not found',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
  WEBHOOK_VERIFICATION_FAILED: 'Webhook verification failed',
  PROCESSOR_ERROR: 'Payment processor error',
  DUPLICATE_PAYMENT: 'Duplicate payment attempt',
  CAMPAIGN_CLOSED: 'Campaign is closed',
  AMOUNT_TOO_LOW: 'Amount is below minimum',
  AMOUNT_TOO_HIGH: 'Amount exceeds maximum',
  INVALID_REFERENCE: 'Invalid transaction reference',
  PAYMENT_EXPIRED: 'Payment has expired',
  REFUND_NOT_ALLOWED: 'Refund not allowed for this payment'
};

// Success messages
const SUCCESS_MESSAGES = {
  PAYMENT_CREATED: 'Payment created successfully',
  PAYMENT_PROCESSED: 'Payment processed successfully',
  PAYMENT_VERIFIED: 'Payment verified successfully',
  PAYMENT_REFUNDED: 'Payment refunded successfully',
  CAMPAIGN_CREATED: 'Campaign created successfully',
  CAMPAIGN_UPDATED: 'Campaign updated successfully',
  CAMPAIGN_DELETED: 'Campaign deleted successfully',
  DONOR_CREATED: 'Donor created successfully',
  DONOR_UPDATED: 'Donor updated successfully',
  WEBHOOK_PROCESSED: 'Webhook processed successfully'
};

// HTTP status codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Rate limiting
const RATE_LIMITS = {
  CREATE_PAYMENT: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10 // limit each IP to 10 requests per windowMs
  },
  PROCESS_PAYMENT: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20 // limit each IP to 20 requests per windowMs
  },
  VERIFY_PAYMENT: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30 // limit each IP to 30 requests per windowMs
  },
  WEBHOOK: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  }
};

// Pagination defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};

// Time intervals
const TIME_INTERVALS = {
  ONE_DAY: '1d',
  ONE_WEEK: '7d',
  ONE_MONTH: '30d',
  THREE_MONTHS: '90d',
  SIX_MONTHS: '180d',
  ONE_YEAR: '365d'
};

// File upload limits
const FILE_LIMITS = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
  MAX_FILES: 10
};

// Cache keys
const CACHE_KEYS = {
  CAMPAIGNS: 'campaigns',
  PAYMENT_METHODS: 'payment_methods',
  PAYMENT_STATS: 'payment_stats',
  CAMPAIGN_STATS: 'campaign_stats',
  DONOR_STATS: 'donor_stats'
};

// Cache TTL (Time To Live) in seconds
const CACHE_TTL = {
  CAMPAIGNS: 300, // 5 minutes
  PAYMENT_METHODS: 600, // 10 minutes
  PAYMENT_STATS: 900, // 15 minutes
  CAMPAIGN_STATS: 1800, // 30 minutes
  DONOR_STATS: 3600 // 1 hour
};

// Database table names
const TABLE_NAMES = {
  PAYMENTS: 'payments',
  CAMPAIGNS: 'campaigns',
  DONORS: 'donors',
  PAYMENT_METHODS: 'payment_methods',
  USERS: 'users'
};

// Environment variables
const ENV_VARS = {
  PAYSTACK_SECRET_KEY: 'PAYSTACK_SECRET_KEY',
  PAYSTACK_PUBLIC_KEY: 'PAYSTACK_PUBLIC_KEY',
  FLUTTERWAVE_SECRET_KEY: 'FLUTTERWAVE_SECRET_KEY',
  FLUTTERWAVE_PUBLIC_KEY: 'FLUTTERWAVE_PUBLIC_KEY',
  BASE_URL: 'BASE_URL',
  DATABASE_URL: 'DATABASE_URL',
  REDIS_URL: 'REDIS_URL'
};

module.exports = {
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_TYPES,
  CURRENCIES,
  RECURRING_INTERVALS,
  RECEIPT_PREFERENCES,
  AMOUNT_LIMITS,
  PROCESSING_FEES,
  WEBHOOK_EVENTS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  HTTP_STATUS,
  RATE_LIMITS,
  PAGINATION,
  TIME_INTERVALS,
  FILE_LIMITS,
  CACHE_KEYS,
  CACHE_TTL,
  TABLE_NAMES,
  ENV_VARS
}; 