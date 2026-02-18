-- ============================================================================
-- Payment + subscription seed: payment methods, bank account, plan_configs
-- Idempotent: ON CONFLICT upserts so safe to run repeatedly.
-- ============================================================================

-- ==================== PAYMENT METHODS (Gateways / Providers) ====================
-- Ensure Paystack and Direct Transfer exist and are active.
-- Other providers (Stripe, PayPal, Flutterwave) may exist from migration; we only upsert these two.

INSERT INTO payment_methods (
  name,
  code,
  type,
  is_active,
  supported_currencies,
  processing_fee,
  processing_fee_type,
  api_public_key,
  api_secret_key,
  webhook_secret,
  base_url,
  display_name,
  description,
  icon_url,
  updated_at
) VALUES
(
  'Paystack',
  'paystack',
  'gateway',
  true,
  '["NGN", "ZAR", "KES", "GHS"]'::jsonb,
  1.5,
  'percentage',
  NULL,
  NULL,
  NULL,
  'https://api.paystack.co',
  'Paystack',
  'Paystack payment gateway. Configure PAYSTACK_PUBLIC_KEY and PAYSTACK_SECRET_KEY in environment.',
  'https://paystack.com/assets/img/logos/paystack-logo-primary.svg',
  CURRENT_TIMESTAMP
),
(
  'Direct Transfer',
  'direct_transfer',
  'manual',
  true,
  '["NGN", "USD", "EUR", "GBP"]'::jsonb,
  0,
  'fixed',
  NULL,
  NULL,
  NULL,
  NULL,
  'Direct Bank Transfer',
  'Pay directly to our bank account and confirm your payment online.',
  NULL,
  CURRENT_TIMESTAMP
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  is_active = EXCLUDED.is_active,
  supported_currencies = EXCLUDED.supported_currencies,
  processing_fee = EXCLUDED.processing_fee,
  processing_fee_type = EXCLUDED.processing_fee_type,
  base_url = EXCLUDED.base_url,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon_url = EXCLUDED.icon_url,
  updated_at = EXCLUDED.updated_at;

-- ==================== BANK ACCOUNTS (for Direct Transfer) ====================
-- Default bank account for direct transfer payments. Add more rows as needed.

INSERT INTO bank_accounts (
  bank_name,
  account_number,
  account_name,
  is_active,
  updated_at
) VALUES
(
  'Access Bank',
  '0707020231',
  'Helloworld Technologies',
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT (account_number) DO UPDATE SET
  bank_name = EXCLUDED.bank_name,
  account_name = EXCLUDED.account_name,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

-- ==================== PLAN CONFIGS (subscription plans) ====================
-- free, small_scale, medium_scale, large_scale. Requires plan_configs table (migration 006).

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
