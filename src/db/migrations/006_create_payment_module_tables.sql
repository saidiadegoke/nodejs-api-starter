-- ============================================================================
-- PAYMENT METHODS TABLE
-- ============================================================================
-- Payment Methods Table - Supports multiple payment gateways
-- This should be created FIRST before payments table (payments references payment_methods)

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL, -- 'stripe', 'paypal', 'flutterwave', 'paystack'
  type VARCHAR(20) NOT NULL, -- 'gateway', 'manual'
  is_active BOOLEAN DEFAULT TRUE,
  supported_currencies JSONB DEFAULT '["NGN", "USD"]'::jsonb,
  processing_fee DECIMAL(10,4) DEFAULT 0,
  processing_fee_type VARCHAR(20) DEFAULT 'percentage', -- 'percentage', 'fixed'
  api_public_key TEXT,
  api_secret_key TEXT,
  webhook_secret TEXT,
  base_url TEXT,
  display_name VARCHAR(100),
  description TEXT,
  icon_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_code ON payment_methods(code);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active);

-- Seed default payment methods (Stripe, PayPal for subscriptions)
INSERT INTO payment_methods (name, code, type, display_name, description, is_active, supported_currencies, processing_fee, processing_fee_type)
VALUES 
  ('Stripe', 'stripe', 'gateway', 'Stripe', 'Stripe payment gateway', true, '["USD", "EUR", "GBP"]'::jsonb, 2.9, 'percentage'),
  ('PayPal', 'paypal', 'gateway', 'PayPal', 'PayPal payment gateway', true, '["USD", "EUR", "GBP"]'::jsonb, 2.9, 'percentage'),
  ('Flutterwave', 'flutterwave', 'gateway', 'Flutterwave', 'Flutterwave payment gateway', true, '["NGN", "USD", "KES", "GHS", "ZAR"]'::jsonb, 1.4, 'percentage'),
  ('Paystack', 'paystack', 'gateway', 'Paystack', 'Paystack payment gateway', true, '["NGN", "ZAR", "KES", "GHS"]'::jsonb, 1.5, 'percentage'),
  ('Direct Transfer', 'direct_transfer', 'manual', 'Direct Bank Transfer', 'Pay directly to our bank account and confirm your payment online.', true, '["NGN", "USD", "EUR", "GBP"]'::jsonb, 0, 'fixed')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================
-- Payments Table - Handles both donation and subscription payments

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id VARCHAR(255) UNIQUE NOT NULL, -- Unique payment identifier
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  type VARCHAR(50) NOT NULL, -- 'donation', 'dues', 'campaign', 'event', 'merchandise', 'subscription'
  payment_type VARCHAR(50) DEFAULT 'donation' CHECK (payment_type IN ('donation', 'subscription', 'campaign', 'event', 'merchandise')),
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded', 'processing'
  
  -- Payment Details
  payment_method VARCHAR(50), -- 'stripe', 'paypal', 'flutterwave', 'paystack'
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  transaction_ref VARCHAR(255), -- External payment processor reference
  processor_response JSONB, -- Raw response from payment processor
  
  -- User/Donor Information
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- User making the payment (for both donations and subscriptions)
  donor_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Legacy: for donations (same as user_id)
  anonymous_donor_first_name VARCHAR(100),
  anonymous_donor_last_name VARCHAR(100),
  anonymous_donor_email VARCHAR(255),
  anonymous_donor_phone VARCHAR(20),
  
  -- Subscription (for subscription payments)
  subscription_id UUID, -- Will reference user_subscriptions(id) after table is created (FK added in migration 010)
  
  -- Campaign/Purpose (for donations)
  campaign_id UUID, -- For donation campaigns
  purpose TEXT, -- General purpose if not campaign-specific
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  user_agent TEXT,
  ip_address INET,
  source VARCHAR(20) DEFAULT 'web', -- 'web', 'mobile', 'api'
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_interval VARCHAR(20), -- 'monthly', 'quarterly', 'annually'
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP WITH TIME ZONE,
  
  -- Optional fields
  notes TEXT,
  internal_notes TEXT, -- Admin-only notes
  receipt_url TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_donor_id ON payments(donor_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_campaign_id ON payments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_ref ON payments(transaction_ref);
CREATE INDEX IF NOT EXISTS idx_payments_anonymous_email ON payments(anonymous_donor_email);

-- ============================================================================
-- USER SUBSCRIPTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type VARCHAR(50) NOT NULL DEFAULT 'free', -- 'free', 'small_scale', 'medium_scale', 'large_scale'
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'cancelled', 'expired', 'past_due', 'trialing'
  billing_cycle VARCHAR(20) DEFAULT 'monthly', -- 'monthly', 'annual'
  current_period_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  
  -- Payment Provider Integration
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),
  paypal_subscription_id VARCHAR(255) UNIQUE,
  
  -- Pricing
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0, -- Monthly/annual amount based on billing_cycle
  currency VARCHAR(3) DEFAULT 'NGN',
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT valid_plan_type CHECK (plan_type IN ('free', 'small_scale', 'medium_scale', 'large_scale')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'cancelled', 'expired', 'past_due', 'trialing')),
  CONSTRAINT valid_billing_cycle CHECK (billing_cycle IN ('monthly', 'annual'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_type ON user_subscriptions(plan_type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON user_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON user_subscriptions(stripe_customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_user ON user_subscriptions(user_id) WHERE status = 'active';

-- ============================================================================
-- SITE PAGE USAGE TABLE
-- ============================================================================
-- Tracks page usage per site based on subscription plan limits

CREATE TABLE IF NOT EXISTS site_page_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_count INTEGER NOT NULL DEFAULT 0,
  plan_limit INTEGER NOT NULL DEFAULT 5, -- Based on current subscription plan
  additional_pages INTEGER DEFAULT 0, -- Pages beyond plan limit (paid separately for small scale)
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_id)
);

CREATE INDEX IF NOT EXISTS idx_site_page_usage_site_id ON site_page_usage(site_id);

-- ============================================================================
-- ADD FOREIGN KEY CONSTRAINT FOR SUBSCRIPTION_ID IN PAYMENTS
-- ============================================================================
-- This migration runs AFTER user_subscriptions table is created (migration 008)

-- Add foreign key constraint for subscription_id in payments table (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_subscription_id'
  ) THEN
    ALTER TABLE payments 
    ADD CONSTRAINT fk_payments_subscription_id 
    FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- INITIALIZE SUBSCRIPTIONS FOR EXISTING USERS
-- ============================================================================

-- Create free subscriptions for all existing users
INSERT INTO user_subscriptions (user_id, plan_type, status, current_period_start, current_period_end, amount)
SELECT 
  id as user_id,
  'free' as plan_type,
  'active' as status,
  CURRENT_TIMESTAMP as current_period_start,
  (CURRENT_TIMESTAMP + INTERVAL '1 year') as current_period_end,
  0 as amount
FROM users
WHERE id NOT IN (SELECT user_id FROM user_subscriptions WHERE status = 'active');

-- Initialize page usage for existing sites
-- Count pages from the pages table (site_id foreign key)
INSERT INTO site_page_usage (site_id, page_count, plan_limit)
SELECT 
  id as site_id,
  COALESCE((SELECT COUNT(*) FROM pages WHERE site_id = sites.id), 0) as page_count,
  5 as plan_limit -- Free plan limit
FROM sites
WHERE id NOT IN (SELECT site_id FROM site_page_usage)
ON CONFLICT (site_id) DO NOTHING;


-- ============================================================================
-- PLAN CONFIGURATIONS TABLE
-- ============================================================================
-- Stores plan configurations (limits, pricing, features) that can be managed dynamically
-- This replaces hardcoded PLAN_CONFIGS in the subscription service

CREATE TABLE IF NOT EXISTS plan_configs (
  id SERIAL PRIMARY KEY,
  plan_type VARCHAR(50) UNIQUE NOT NULL, -- 'free', 'small_scale', 'medium_scale', 'large_scale'
  plan_name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Pricing (JSONB: { "NGN": { "monthly": 0, "yearly": 0 }, "USD": { "monthly": 0, "yearly": 0 }, ... })
  prices JSONB NOT NULL DEFAULT '{
    "NGN": { "monthly": 0, "yearly": 0 },
    "USD": { "monthly": 0, "yearly": 0 },
    "EUR": { "monthly": 0, "yearly": 0 },
    "GBP": { "monthly": 0, "yearly": 0 }
  }'::jsonb,
  
  -- Default currency for display
  default_currency VARCHAR(3) DEFAULT 'NGN',
  
  -- Limits (JSONB for flexibility)
  limits JSONB NOT NULL DEFAULT '{
    "pages": 5,
    "custom_domains": 0,
    "sites": 1,
    "storage": 100,
    "bandwidth": 1000
  }'::jsonb,
  
  -- Features (array of feature strings)
  features JSONB DEFAULT '[]'::jsonb,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true, -- Whether to show in plan selection UI
  
  -- Display order
  display_order INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT valid_plan_type CHECK (plan_type IN ('free', 'small_scale', 'medium_scale', 'large_scale'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plan_configs_plan_type ON plan_configs(plan_type);
CREATE INDEX IF NOT EXISTS idx_plan_configs_active ON plan_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_plan_configs_public ON plan_configs(is_public);
CREATE INDEX IF NOT EXISTS idx_plan_configs_display_order ON plan_configs(display_order);

-- Insert default plan configurations (can be updated via admin UI)
INSERT INTO plan_configs (plan_type, plan_name, description, prices, default_currency, limits, features, display_order)
VALUES 
  (
    'free',
    'Free',
    'Perfect for small businesses, portfolios, or users testing the platform',
    '{
      "NGN": { "monthly": 0, "yearly": 0 },
      "USD": { "monthly": 0, "yearly": 0 },
      "EUR": { "monthly": 0, "yearly": 0 },
      "GBP": { "monthly": 0, "yearly": 0 }
    }'::jsonb,
    'NGN',
    '{
      "pages": 5,
      "custom_domains": 0,
      "sites": 1,
      "storage": 100,
      "bandwidth": 1000
    }'::jsonb,
    '["basic_support", "default_templates"]'::jsonb,
    1
  ),
  (
    'small_scale',
    'Small Scale',
    'Small to medium businesses needing more pages and custom branding',
    '{
      "NGN": { "monthly": 5000, "yearly": 40200 },
      "USD": { "monthly": 4.50, "yearly": 36.14 },
      "EUR": { "monthly": 4.00, "yearly": 32.12 },
      "GBP": { "monthly": 3.50, "yearly": 28.10 }
    }'::jsonb,
    'NGN',
    '{
      "pages": 20,
      "custom_domains": 1,
      "sites": 3,
      "storage": 500,
      "bandwidth": 10000
    }'::jsonb,
    '["basic_support", "default_templates", "custom_domains", "priority_support"]'::jsonb,
    2
  ),
  (
    'medium_scale',
    'Medium Scale',
    'Growing businesses with expanding content needs',
    '{
      "NGN": { "monthly": 12500, "yearly": 100500 },
      "USD": { "monthly": 12.50, "yearly": 100.38 },
      "EUR": { "monthly": 11.50, "yearly": 92.48 },
      "GBP": { "monthly": 10.00, "yearly": 80.34 }
    }'::jsonb,
    'NGN',
    '{
      "pages": 100,
      "custom_domains": 5,
      "sites": 10,
      "storage": 5000,
      "bandwidth": 100000
    }'::jsonb,
    '["basic_support", "default_templates", "custom_domains", "priority_support", "advanced_analytics"]'::jsonb,
    3
  ),
  (
    'large_scale',
    'Large Scale',
    'Large businesses, agencies, or enterprises with extensive content needs',
    '{
      "NGN": { "monthly": 40000, "yearly": 321600 },
      "USD": { "monthly": 40.00, "yearly": 321.60 },
      "EUR": { "monthly": 37.50, "yearly": 301.48 },
      "GBP": { "monthly": 32.50, "yearly": 261.28 }
    }'::jsonb,
    'NGN',
    '{
      "pages": -1,
      "custom_domains": -1,
      "sites": -1,
      "storage": 50000,
      "bandwidth": 1000000
    }'::jsonb,
    '["basic_support", "default_templates", "custom_domains", "priority_support", "advanced_analytics", "dedicated_support", "api_access"]'::jsonb,
    4
  )
ON CONFLICT (plan_type) DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  description = EXCLUDED.description,
  prices = EXCLUDED.prices,
  default_currency = EXCLUDED.default_currency,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  display_order = EXCLUDED.display_order,
  updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- BANK ACCOUNTS TABLE
-- ============================================================================
-- Bank Accounts Table - Stores bank account details for direct transfers

CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_name VARCHAR(100) NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_account_number ON bank_accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON bank_accounts(is_active);

-- ============================================================================
-- CAMPAIGN BANK ACCOUNTS TABLE
-- ============================================================================
-- Campaign Bank Accounts Table - Links bank accounts to campaigns

CREATE TABLE IF NOT EXISTS campaign_bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaign_bank_accounts_campaign ON campaign_bank_accounts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_bank_accounts_bank ON campaign_bank_accounts(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_campaign_bank_accounts_active ON campaign_bank_accounts(is_active);

-- ============================================================================
-- MIGRATION: Add receipt_file_id to payments table
-- ============================================================================
-- This migration adds a receipt_file_id column to the payments table
-- to support direct transfer payment proof uploads via file uploads.

-- Add receipt_file_id column
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS receipt_file_id UUID REFERENCES files(id) ON DELETE SET NULL;

-- Add index for receipt_file_id lookups
CREATE INDEX IF NOT EXISTS idx_payments_receipt_file_id ON payments(receipt_file_id);

-- Add comment
COMMENT ON COLUMN payments.receipt_file_id IS 'Reference to the uploaded receipt file for direct transfer payments';

-- ============================================================================
-- EARLY ADOPTERS TABLE
-- ============================================================================

-- Early Adopters table (for early adopter program registrations)
CREATE TABLE IF NOT EXISTS early_adopters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  business_name VARCHAR(255) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  contacted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_early_adopters_email ON early_adopters(email);
CREATE INDEX idx_early_adopters_status ON early_adopters(status);
CREATE INDEX idx_early_adopters_created_at ON early_adopters(created_at);

