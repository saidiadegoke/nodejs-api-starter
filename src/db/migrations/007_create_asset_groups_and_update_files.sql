-- ============================================================================
-- GLOBAL ASSET LIBRARY - Asset Groups and Files Table Updates
-- ============================================================================
-- Migration: 007
-- Description: Creates asset_groups table for organizing user assets into folders,
--              and adds asset_group_id, tags, and alt_text columns to files table.
--              Migrates existing site assets to user_assets context.
-- ============================================================================

-- ============================================================================
-- ASSET GROUPS TABLE - Folders/groupings for organizing user assets
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_id UUID NULL,                    -- For nested folders
  color VARCHAR(7),                       -- Optional folder color (hex, e.g. #3B82F6)
  icon VARCHAR(50),                       -- Optional icon identifier (e.g. 'folder-image')
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES asset_groups(id) ON DELETE SET NULL,
  CONSTRAINT unique_group_name_per_level UNIQUE(user_id, name, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_groups_user_id ON asset_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_groups_parent_id ON asset_groups(parent_id);
CREATE INDEX IF NOT EXISTS idx_asset_groups_deleted ON asset_groups(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_asset_groups_user_active ON asset_groups(user_id, deleted_at) WHERE deleted_at IS NULL;

COMMENT ON TABLE asset_groups IS 'Folders/groupings for organizing user assets. Supports nested folder hierarchies.';
COMMENT ON COLUMN asset_groups.parent_id IS 'Parent folder ID for nested folders. NULL for root-level folders.';
COMMENT ON COLUMN asset_groups.color IS 'Hex color code for folder display (e.g. #3B82F6)';
COMMENT ON COLUMN asset_groups.icon IS 'Icon identifier for folder display (e.g. folder-image, folder-video)';

-- ============================================================================
-- FILES TABLE UPDATES - Add asset grouping and metadata columns
-- ============================================================================

-- Add asset_group_id column to files table
ALTER TABLE files ADD COLUMN IF NOT EXISTS asset_group_id UUID NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_files_asset_group'
  ) THEN
    ALTER TABLE files ADD CONSTRAINT fk_files_asset_group
      FOREIGN KEY (asset_group_id) REFERENCES asset_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add tags array column for searchability
ALTER TABLE files ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Add alt_text column for accessibility
ALTER TABLE files ADD COLUMN IF NOT EXISTS alt_text TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_files_asset_group_id ON files(asset_group_id);
CREATE INDEX IF NOT EXISTS idx_files_tags ON files USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_files_user_assets_context ON files(context, uploaded_by) WHERE context = 'user_assets';

COMMENT ON COLUMN files.asset_group_id IS 'Asset group/folder this file belongs to. NULL for ungrouped assets.';
COMMENT ON COLUMN files.tags IS 'Array of tags for searchability and filtering';
COMMENT ON COLUMN files.alt_text IS 'Alt text for images/videos for accessibility';

-- ============================================================================
-- MIGRATE EXISTING SITE ASSETS TO USER ASSETS
-- ============================================================================

-- Update context from site_assets_* to user_assets
-- Preserve original site_id in metadata for reference
UPDATE files 
SET 
  context = 'user_assets',
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{migrated_from_site_id}',
    to_jsonb(SUBSTRING(context FROM 'site_assets_(.+)'))
  )
WHERE context LIKE 'site_assets_%'
  AND context != 'user_assets';

-- Add migration timestamp to metadata
UPDATE files
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{migrated_at}',
  to_jsonb(CURRENT_TIMESTAMP::text)
)
WHERE metadata ? 'migrated_from_site_id';

-- ============================================================================
-- FUNCTION: Update updated_at timestamp for asset_groups
-- ============================================================================

CREATE OR REPLACE FUNCTION update_asset_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_asset_groups_updated_at ON asset_groups;
CREATE TRIGGER trigger_update_asset_groups_updated_at
  BEFORE UPDATE ON asset_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_asset_groups_updated_at();

-- ============================================================================
-- FUNCTION: Get asset count for a group (including nested groups)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_asset_group_count(group_id UUID)
RETURNS INTEGER AS $$
DECLARE
  count_result INTEGER;
BEGIN
  -- Count direct assets in this group
  SELECT COUNT(*) INTO count_result
  FROM files
  WHERE asset_group_id = group_id
    AND deleted_at IS NULL;
  
  RETURN COALESCE(count_result, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_asset_group_count(UUID) IS 'Returns the count of assets in a group (direct assets only, not nested groups)';

-- ============================================================================
-- ASSET USAGE TRACKING & OVERAGE RATES (Phase 7)
-- ============================================================================
-- - asset_usage: per-user storage used/limit (limit from plan)
-- - asset_usage_events: overage/billing events per period
-- - plan_configs.overage_rates: per-plan overage pricing (storage, pages, bandwidth)

-- ============================================================================
-- ASSET USAGE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS asset_usage (
  user_id UUID PRIMARY KEY,
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  storage_limit_bytes BIGINT NOT NULL,
  last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asset_usage_user_id ON asset_usage(user_id);

-- ============================================================================
-- ASSET USAGE EVENTS (overage/billing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS asset_usage_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  included_bytes BIGINT NOT NULL,
  used_bytes BIGINT NOT NULL,
  overage_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asset_usage_events_user_id ON asset_usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_asset_usage_events_period ON asset_usage_events(period_start, period_end);

-- ============================================================================
-- ADD OVERAGE_RATES TO PLAN_CONFIGS
-- ============================================================================
ALTER TABLE plan_configs ADD COLUMN IF NOT EXISTS overage_rates JSONB DEFAULT '{}'::jsonb;

-- Seed default overage rates (per plan; adjust values as needed)
-- Storage: per GB per month; pages: per extra page per month; bandwidth: per GB
UPDATE plan_configs SET overage_rates = jsonb_build_object(
  'storage_per_gb_month', jsonb_build_object('NGN', 50, 'USD', 0.10, 'EUR', 0.09, 'GBP', 0.08),
  'pages_per_page_month', jsonb_build_object('NGN', 100, 'USD', 1, 'EUR', 0.90, 'GBP', 0.80),
  'bandwidth_per_gb', jsonb_build_object('NGN', 20, 'USD', 0.05, 'EUR', 0.04, 'GBP', 0.04)
)
WHERE overage_rates = '{}'::jsonb OR overage_rates IS NULL;

-- ============================================================================
-- ADD THEME COLUMN TO SITE CUSTOMIZATION
-- Migration: 009_add_theme_to_customization.sql
-- Description: Add theme JSONB column for centralized theme settings
-- ============================================================================

-- Add theme column to site_customization table
-- The theme column stores the complete theme configuration including:
-- - colors: primary, secondary, accent, background, surface, border, text colors
-- - fonts: heading, body, mono font families with weights and sizes
-- - spacing: base unit and scale
-- - shadows: elevation levels
ALTER TABLE site_customization
ADD COLUMN IF NOT EXISTS theme JSONB;

-- Add comment explaining the column
COMMENT ON COLUMN site_customization.theme IS 'Complete theme configuration (colors, fonts, spacing, shadows). Takes precedence over legacy colors/fonts columns when present.';

-- Create index for theme queries (GIN for JSONB)
CREATE INDEX IF NOT EXISTS idx_site_customization_theme ON site_customization USING GIN (theme);

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- The theme column is additive and backward compatible:
-- - Existing colors, fonts, spacing columns remain for backward compatibility
-- - When theme column is present and populated, it takes precedence
-- - The siteRenderer in smartstore-app handles both legacy and theme formats
--
-- Theme structure:
-- {
--   "colors": {
--     "primary": "#2563eb",
--     "secondary": "#64748b",
--     "accent": "#0ea5e9",
--     "background": "#ffffff",
--     "backgroundAlt": "#f8fafc",
--     "surface": "#ffffff",
--     "border": "#e2e8f0",
--     "textPrimary": "#0f172a",
--     "textSecondary": "#64748b",
--     "success": "#22c55e",
--     "warning": "#f59e0b",
--     "error": "#ef4444"
--   },
--   "fonts": {
--     "heading": { "family": "Inter", "weights": [600, 700] },
--     "body": { "family": "Inter", "weights": [400, 500] },
--     "mono": { "family": "JetBrains Mono", "weights": [400] }
--   },
--   "spacing": {
--     "base": 4,
--     "scale": [0, 1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64]
--   },
--   "shadows": {
--     "sm": "0 1px 2px rgba(0, 0, 0, 0.05)",
--     "md": "0 4px 6px rgba(0, 0, 0, 0.1)",
--     "lg": "0 10px 15px rgba(0, 0, 0, 0.1)",
--     "xl": "0 20px 25px rgba(0, 0, 0, 0.15)"
--   }
-- }

-- ============================================================================
-- FORM SUBMISSIONS (form instances, submissions, responses)
-- See docs/FORM_SUBMISSIONS_SERVICE_DESIGN.md
-- ============================================================================

-- Form instances: one per form block (site + page + block_id)
CREATE TABLE IF NOT EXISTS form_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_id VARCHAR(255) NOT NULL,
  block_type VARCHAR(100) NOT NULL,
  display_name VARCHAR(255),
  config_snapshot JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_id, page_id, block_id)
);

CREATE INDEX IF NOT EXISTS idx_form_instances_site_id ON form_instances(site_id);
CREATE INDEX IF NOT EXISTS idx_form_instances_site_page ON form_instances(site_id, page_id);
CREATE INDEX IF NOT EXISTS idx_form_instances_block_type ON form_instances(block_type);

-- Form submissions: one per submit
CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_instance_id UUID NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  source_url TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form_instance_id ON form_submissions(form_instance_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_site_id ON form_submissions(site_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_site_form ON form_submissions(site_id, form_instance_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at ON form_submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(status);

-- Form responses: notes/replies on a submission
CREATE TABLE IF NOT EXISTS form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'note',
  body TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_form_responses_submission_id ON form_responses(submission_id);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_form_instances_updated_at ON form_instances;
CREATE TRIGGER update_form_instances_updated_at BEFORE UPDATE ON form_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_form_submissions_updated_at ON form_submissions;
CREATE TRIGGER update_form_submissions_updated_at BEFORE UPDATE ON form_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add meta_description and meta_keywords to pages if missing (used by PageModel)
ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_keywords TEXT[];

-- ============================================================================
-- SITE FEATURES (e.g. has_ecommerce) – synced when template/page is saved
-- ============================================================================
-- Used to drive dashboard visibility (Products/Catalog) without scanning
-- page content on every GET site(s). Aligns with Forms pattern (form_instances).

CREATE TABLE IF NOT EXISTS site_features (
  site_id INTEGER NOT NULL,
  feature VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (site_id, feature),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_site_features_site_id ON site_features(site_id);
CREATE INDEX idx_site_features_feature ON site_features(feature);

COMMENT ON TABLE site_features IS 'Flags per site (e.g. ecommerce) set when template/page with relevant blocks is saved. Used for has_ecommerce on GET site(s).';

-- ============================================================================
-- CATALOG (products & categories per site)
-- ============================================================================
-- One catalog per site. E-commerce blocks (product grid, store, etc.) read
-- from these tables via public API. Dashboard CMS manages via authenticated API.

-- Categories (e.g. for filtering product grid)
CREATE TABLE IF NOT EXISTS catalog_categories (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE(site_id, slug)
);

CREATE INDEX idx_catalog_categories_site_id ON catalog_categories(site_id);
CREATE INDEX idx_catalog_categories_slug ON catalog_categories(site_id, slug);

-- Products (type = 'product' | 'service'; services can add duration/booking later)
CREATE TABLE IF NOT EXISTS catalog_products (
  id SERIAL PRIMARY KEY,
  site_id INTEGER NOT NULL,
  category_id INTEGER NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'product',  -- 'product' | 'service'
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  compare_at_price DECIMAL(12, 2) NULL,
  cost DECIMAL(12, 2) NULL,
  sku VARCHAR(100) NULL,
  barcode VARCHAR(100) NULL,
  images JSONB DEFAULT '[]',   -- [{ url, alt? }]
  tags JSONB DEFAULT '[]',     -- ['tag1', 'tag2']
  status VARCHAR(50) NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE SET NULL,
  UNIQUE(site_id, slug)
);

CREATE INDEX idx_catalog_products_site_id ON catalog_products(site_id);
CREATE INDEX idx_catalog_products_category_id ON catalog_products(category_id);
CREATE INDEX idx_catalog_products_slug ON catalog_products(site_id, slug);
CREATE INDEX idx_catalog_products_status ON catalog_products(site_id, status);
CREATE INDEX idx_catalog_products_type ON catalog_products(site_id, type);

COMMENT ON TABLE catalog_categories IS 'Catalog categories per site for filtering/organizing products.';
COMMENT ON TABLE catalog_products IS 'Products and services per site. type=product|service; status=draft|published.';

-- ============================================================================
-- Product price currency + platform currency rates (for computed multi-currency)
-- ============================================================================
-- One price per product (in price_currency); other currencies computed from
-- platform exchange rates (same idea as plan pricing: NGN, USD, EUR, GBP).

-- Product: which currency the stored price is in
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS price_currency VARCHAR(3) NOT NULL DEFAULT 'NGN';

COMMENT ON COLUMN catalog_products.price_currency IS 'ISO 4217 code for price, compare_at_price, cost (e.g. NGN, USD). Other currencies computed from currency_rates.';

-- Platform-wide exchange rates: 1 unit of base_currency = rate units of target.
-- So amount in currency X = amount_in_base * rates[X]. Convert X->Y: amount * (rates[Y]/rates[X]).
CREATE TABLE IF NOT EXISTS currency_rates (
  id SERIAL PRIMARY KEY,
  base_currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  rates JSONB NOT NULL DEFAULT '{"NGN": 1, "USD": 0.00064, "EUR": 0.00058, "GBP": 0.00052}'::jsonb,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure one row
INSERT INTO currency_rates (id, base_currency, rates)
SELECT 1, 'NGN', '{"NGN": 1, "USD": 0.00064, "EUR": 0.00058, "GBP": 0.00052}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM currency_rates WHERE id = 1);

COMMENT ON TABLE currency_rates IS 'Platform exchange rates from base_currency. rates: 1 base = rates[code] in that currency. Used to compute product prices in NGN, USD, EUR, GBP.';

-- Manual per-currency prices for products (optional).
-- When set, these are used instead of converting from price + price_currency.
-- Format: { "NGN": 1000, "USD": 5, "EUR": 4.5, "GBP": 4 }
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS prices JSONB NULL;

COMMENT ON COLUMN catalog_products.prices IS 'Optional manual prices per currency (NGN, USD, EUR, GBP). When set, used as-is; otherwise prices are computed from price + price_currency using platform rates.';

-- Customer email preferences per site (order confirmation, receipt).
-- When null, defaults: send order confirmation and receipt to customer.
ALTER TABLE site_customization
  ADD COLUMN IF NOT EXISTS email_settings JSONB NULL;

COMMENT ON COLUMN site_customization.email_settings IS 'Per-site options: send_order_confirmation_to_customer (bool), send_receipt_to_customer (bool). Default true when unset.';

-- ============================================================================
-- REFERRAL MODULE (Phase 1: Foundation)
-- referral_codes: one code per user for sharing
-- referrals: one row per referred signup (referrer -> referred)
-- ============================================================================

-- Referral codes (one per user; used in share link ?ref=CODE)
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_user_id ON referral_codes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

-- Referrals (one row per referred user; first referrer wins)
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_code_id UUID REFERENCES referral_codes(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'signed_up',
  milestone_reached_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_referrals_referred_id UNIQUE (referred_id),
  CONSTRAINT chk_referrals_status CHECK (status IN ('signed_up', 'milestone_reached', 'rewarded')),
  CONSTRAINT chk_referrals_no_self_referral CHECK (referrer_id != referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

COMMENT ON TABLE referral_codes IS 'One referral code per user for share links (?ref=CODE)';
COMMENT ON TABLE referrals IS 'Attribution: referrer_id referred referred_id at signup; status tracks milestone';

-- ============================================================================
-- REFERRAL REWARDS (Phase 2: Milestone rewards)
-- One row per reward granted when a referred user completes a milestone
-- ============================================================================

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_type VARCHAR(50) NOT NULL,
  reward_type VARCHAR(50) NOT NULL DEFAULT 'credit',
  reward_value DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_referral_rewards_status CHECK (status IN ('pending', 'paid', 'cancelled')),
  CONSTRAINT chk_referral_rewards_reward_type CHECK (reward_type IN ('credit', 'discount_percent', 'cash', 'free_months'))
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_id ON referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referral_id ON referral_rewards(referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);

COMMENT ON TABLE referral_rewards IS 'Reward granted to referrer when referred user completes milestone (e.g. first_paid_plan)';

-- Allow 'pending' status on user_subscriptions so subscriptions can be created before payment
-- and activated after admin approval or payment verification.

ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE user_subscriptions ADD CONSTRAINT valid_status
  CHECK (status IN ('active', 'cancelled', 'expired', 'past_due', 'trialing', 'pending'));


-- Add verified_at to custom_domains for domain verification timestamp.
-- Used when verification succeeds and by the API response.

ALTER TABLE custom_domains
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN custom_domains.verified_at IS 'When the domain was successfully verified (DNS TXT check).';

-- Separate "ownership verified" (TXT) from "traffic verified" (CNAME pointing).
-- verified = TXT ownership; traffic_verified = CNAME points to our target.
-- Both must be true for domain to be considered fully verified (SSL, etc.).

ALTER TABLE custom_domains
  ADD COLUMN IF NOT EXISTS traffic_verified BOOLEAN DEFAULT false;

COMMENT ON COLUMN custom_domains.traffic_verified IS 'True when CNAME (or A/ALIAS) points to the site target (e.g. siteSlug.smartstore.ng).';

-- Existing domains that were already verified are assumed pointed (keep current behavior).
UPDATE custom_domains SET traffic_verified = true WHERE verified = true AND (traffic_verified IS NULL OR traffic_verified = false);

-- ============================================================================
-- BIO COMMERCE (Link-in-Bio) – Strategy 1
-- ============================================================================
-- Adds bio commerce support by extending existing tables.
-- No new tables – all data fits into sites, site_customization, pages.
-- ============================================================================

-- 1. Add site_type to sites table ('full' = traditional, 'bio' = link-in-bio)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS site_type VARCHAR(20) DEFAULT 'full';

COMMENT ON COLUMN sites.site_type IS 'Type of site: full (traditional site builder), bio (link-in-bio page), micro (micro-store)';

-- 2. Add commerce_settings to site_customization (WhatsApp, delivery zones, order template)
ALTER TABLE site_customization
ADD COLUMN IF NOT EXISTS commerce_settings JSONB DEFAULT '{}';

COMMENT ON COLUMN site_customization.commerce_settings IS 'Commerce settings: whatsappNumber, deliveryZones, orderTemplate, defaultCurrency';

-- 3. Add bio_profile to site_customization (bio text, social links, external links)
ALTER TABLE site_customization
ADD COLUMN IF NOT EXISTS bio_profile JSONB DEFAULT '{}';

COMMENT ON COLUMN site_customization.bio_profile IS 'Bio profile: bioText, socialLinks, links (external links list)';

-- 4. Add onboarding_step to sites table
ALTER TABLE sites ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

COMMENT ON COLUMN sites.onboarding_step IS 'Onboarding progress: 0=new, 1=named, 2=has_product, 3=complete';

-- Migration 008: Product variants + order source tracking
-- Strategy 2: WhatsApp-First Order Engine

-- Add structured variants to catalog_products
ALTER TABLE catalog_products
ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]';

COMMENT ON COLUMN catalog_products.variants IS 'Structured product variants. Format: [{"group":"Size","options":[{"value":"40","available":true},...]},...]';

-- Add inventory tracking columns
ALTER TABLE catalog_products
ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN DEFAULT false;

ALTER TABLE catalog_products
ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;

ALTER TABLE catalog_products
ADD COLUMN IF NOT EXISTS variant_stock JSONB DEFAULT '{}';

COMMENT ON COLUMN catalog_products.variant_stock IS 'Stock per variant combination. Key format: "Group:Value|Group:Value". 0 = out of stock.';

-- Add order source tracking
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'platform';

COMMENT ON COLUMN orders.source IS 'Order source: platform, whatsapp, manual, bio_page';

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS source_site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL;

-- ============================================================================
-- SITE PAYMENT SETTINGS
-- Per-site payment provider keys and direct-transfer bank account.
-- SmartStore global keys (payment_methods table) are the fallback.
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_payment_settings (
  id                      SERIAL PRIMARY KEY,
  site_id                 INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

  -- Merchant's own Paystack account (optional — falls back to platform keys)
  paystack_public_key     TEXT,
  paystack_secret_key     TEXT,           -- server-side only; never exposed to frontend
  paystack_webhook_secret TEXT,           -- optional per-site webhook verification

  -- Direct Transfer bank account (optional — falls back to global bank_accounts)
  dt_bank_name            VARCHAR(100),
  dt_account_number       VARCHAR(30),
  dt_account_name         VARCHAR(150),

  created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_site_payment_settings UNIQUE (site_id)
);

CREATE INDEX IF NOT EXISTS idx_site_payment_settings_site_id ON site_payment_settings(site_id);

-- ============================================================================
-- SITE PAYOUTS
-- Tracks outbound transfer requests made by merchants.
-- Supports multiple providers (Paystack, Flutterwave, etc.).
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_payouts (
  id                 SERIAL PRIMARY KEY,
  site_id            INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  provider           VARCHAR(50) NOT NULL DEFAULT 'paystack',
    -- 'paystack' | 'flutterwave' | etc.
  amount             DECIMAL(15,2) NOT NULL,
  currency           VARCHAR(3)   NOT NULL DEFAULT 'NGN',
  transfer_reference VARCHAR(255),          -- e.g. Paystack transfer_code TRF_xxx
  recipient_code     VARCHAR(255),          -- provider recipient code (cached per request)
  status             VARCHAR(30)  NOT NULL DEFAULT 'pending',
    -- pending | processing | success | failed | reversed
  reason             TEXT,
  metadata           JSONB        NOT NULL DEFAULT '{}',
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_site_payouts_site_id ON site_payouts(site_id);
CREATE INDEX IF NOT EXISTS idx_site_payouts_status  ON site_payouts(status);
CREATE INDEX IF NOT EXISTS idx_site_payouts_provider ON site_payouts(provider);
