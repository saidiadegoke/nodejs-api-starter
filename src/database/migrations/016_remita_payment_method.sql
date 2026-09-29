-- M.13: register Remita as a payment method.
--
-- Seeded inactive — it carries no credentials yet, and the checkout
-- only offers active + configured methods. An admin sets the Remita
-- merchantId (api_public_key) / apiKey (api_secret_key) / base_url and
-- flips is_active = true once ready. serviceTypeId is read from the
-- REMITA_SERVICE_TYPE_ID env var.

INSERT INTO payment_methods (
  name, code, type, display_name, description,
  is_active, supported_currencies, processing_fee, processing_fee_type
)
VALUES (
  'Remita', 'remita', 'gateway', 'Remita',
  'Card, USSD and bank-branch payments via Remita (RRR).',
  false, '["NGN"]'::jsonb, 1.5, 'percentage'
)
ON CONFLICT (code) DO NOTHING;
