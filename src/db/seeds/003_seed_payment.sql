-- ============================================================================
-- Payment seed: gateways/providers (Paystack, Direct Transfer) + bank account
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
