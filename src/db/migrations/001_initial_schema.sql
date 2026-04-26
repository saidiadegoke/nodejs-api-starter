-- Initial schema (formerly migrations 001–007): auth/RBAC, files, countries,
-- admin observability, payments, notifications, posts (SEO, schedule, FTS),
-- post_comments (moderation), post_media, post_likes, post_comment_likes.
--
-- If you previously ran the split migrations, use a fresh database or reconcile
-- schema_migrations before applying this file as a new migration name.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS & PROFILES
-- ============================================================================

-- Users table (Authentication only)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NULL,
  phone VARCHAR(20) UNIQUE NULL,
  email_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  password_hash VARCHAR(255) NULL,
  status VARCHAR(20) DEFAULT 'active',
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,

  CONSTRAINT check_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Profiles table (User information)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  display_name VARCHAR(200),
  bio TEXT,
  profile_photo_url TEXT NULL,
  date_of_birth DATE,
  gender VARCHAR(20),
  preferred_language VARCHAR(10) DEFAULT 'en',
  timezone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_display_name ON profiles(display_name);

-- ============================================================================
-- RBAC (Role-Based Access Control)
-- ============================================================================

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  resource VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(resource, action)
);

CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_action ON permissions(action);

-- User Roles (Many-to-Many)
CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  role_id UUID NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by UUID,
  expires_at TIMESTAMP NULL,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_user_roles_expires ON user_roles(expires_at) WHERE expires_at IS NOT NULL;

-- Role Permissions (Many-to-Many)
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role_id UUID NOT NULL,
  permission_id UUID NOT NULL,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_perm ON role_permissions(permission_id);

-- User Permissions (Direct Override)
CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  permission_id UUID NOT NULL,
  granted BOOLEAN DEFAULT true,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  granted_by UUID,
  expires_at TIMESTAMP NULL,
  reason TEXT,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id),
  UNIQUE(user_id, permission_id)
);

CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_perm ON user_permissions(permission_id);
CREATE INDEX idx_user_permissions_expires ON user_permissions(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- AUTHENTICATION & SESSION MANAGEMENT
-- ============================================================================

-- Social Login Providers
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email VARCHAR(255),
  provider_data JSONB,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX idx_social_user_id ON social_accounts(user_id);
CREATE INDEX idx_social_provider ON social_accounts(provider);

-- User Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  device_info JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMP NULL,
  revoked_reason VARCHAR(100),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_sessions_revoked ON user_sessions(is_revoked) WHERE is_revoked = false;

-- Password Resets
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  method VARCHAR(10) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_password_resets_user ON password_resets(user_id);
CREATE INDEX idx_password_resets_expires ON password_resets(expires_at);
CREATE INDEX idx_password_resets_used ON password_resets(used_at) WHERE used_at IS NULL;

-- Email/Phone Verification
CREATE TABLE IF NOT EXISTS verification_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  type VARCHAR(20) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  attempts INTEGER DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_verification_tokens_user ON verification_tokens(user_id);
CREATE INDEX idx_verification_tokens_type ON verification_tokens(type);
CREATE INDEX idx_verification_tokens_expires ON verification_tokens(expires_at);

-- ============================================================================
-- FILES
-- ============================================================================
-- Core files table for user file uploads (images, documents, etc.)
-- Used by the files and assets modules

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(50) NOT NULL DEFAULT 'local',
  provider_path TEXT,
  file_url TEXT NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size INTEGER,
  uploaded_by UUID NOT NULL,
  context VARCHAR(50) DEFAULT 'general',
  metadata JSONB DEFAULT '{}'::jsonb,
  is_public BOOLEAN DEFAULT FALSE,
  asset_group_id UUID,
  tags TEXT[],
  alt_text TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_context ON files(context);
CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type);
CREATE INDEX IF NOT EXISTS idx_files_is_public ON files(is_public);
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at);
CREATE INDEX IF NOT EXISTS idx_files_asset_group_id ON files(asset_group_id);
CREATE INDEX IF NOT EXISTS idx_files_tags ON files USING GIN(tags);

-- ============================================================================
-- ASSET GROUPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  parent_id UUID REFERENCES asset_groups(id) ON DELETE CASCADE,
  color VARCHAR(7),
  icon VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_groups_created_by ON asset_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_asset_groups_parent_id ON asset_groups(parent_id);

-- Link files.asset_group_id to asset_groups
ALTER TABLE files
  ADD CONSTRAINT fk_files_asset_group
  FOREIGN KEY (asset_group_id) REFERENCES asset_groups(id) ON DELETE SET NULL;

-- Trigger: update updated_at on asset_groups changes
CREATE OR REPLACE FUNCTION update_asset_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_asset_groups_updated_at
  BEFORE UPDATE ON asset_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_asset_groups_updated_at();
-- ============================================================================
-- COUNTRIES reference table
-- ============================================================================

CREATE TABLE IF NOT EXISTS countries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  iso_code_2 CHAR(2) UNIQUE NOT NULL,
  iso_code_3 CHAR(3) UNIQUE,
  phone_code VARCHAR(10),
  currency_code VARCHAR(3),
  currency_name VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_countries_iso2   ON countries(iso_code_2);
CREATE INDEX IF NOT EXISTS idx_countries_active ON countries(is_active);

-- Seed commonly used countries
INSERT INTO countries (name, iso_code_2, iso_code_3, phone_code, currency_code, currency_name) VALUES
  ('Nigeria',        'NG', 'NGA', '+234', 'NGN', 'Nigerian Naira'),
  ('Ghana',          'GH', 'GHA', '+233', 'GHS', 'Ghanaian Cedi'),
  ('Kenya',          'KE', 'KEN', '+254', 'KES', 'Kenyan Shilling'),
  ('South Africa',   'ZA', 'ZAF', '+27',  'ZAR', 'South African Rand'),
  ('United States',  'US', 'USA', '+1',   'USD', 'US Dollar'),
  ('United Kingdom', 'GB', 'GBR', '+44',  'GBP', 'British Pound'),
  ('Canada',         'CA', 'CAN', '+1',   'CAD', 'Canadian Dollar'),
  ('Germany',        'DE', 'DEU', '+49',  'EUR', 'Euro'),
  ('France',         'FR', 'FRA', '+33',  'EUR', 'Euro'),
  ('India',          'IN', 'IND', '+91',  'INR', 'Indian Rupee'),
  ('Egypt',          'EG', 'EGY', '+20',  'EGP', 'Egyptian Pound'),
  ('Ethiopia',       'ET', 'ETH', '+251', 'ETB', 'Ethiopian Birr'),
  ('Tanzania',       'TZ', 'TZA', '+255', 'TZS', 'Tanzanian Shilling'),
  ('Uganda',         'UG', 'UGA', '+256', 'UGX', 'Ugandan Shilling'),
  ('Rwanda',         'RW', 'RWA', '+250', 'RWF', 'Rwandan Franc'),
  ('Senegal',        'SN', 'SEN', '+221', 'XOF', 'West African CFA Franc'),
  ('Ivory Coast',    'CI', 'CIV', '+225', 'XOF', 'West African CFA Franc'),
  ('Cameroon',       'CM', 'CMR', '+237', 'XAF', 'Central African CFA Franc'),
  ('Zimbabwe',       'ZW', 'ZWE', '+263', 'ZWL', 'Zimbabwean Dollar'),
  ('Zambia',         'ZM', 'ZMB', '+260', 'ZMW', 'Zambian Kwacha'),
  ('Australia',      'AU', 'AUS', '+61',  'AUD', 'Australian Dollar'),
  ('Brazil',         'BR', 'BRA', '+55',  'BRL', 'Brazilian Real'),
  ('China',          'CN', 'CHN', '+86',  'CNY', 'Chinese Yuan'),
  ('Japan',          'JP', 'JPN', '+81',  'JPY', 'Japanese Yen'),
  ('Mexico',         'MX', 'MEX', '+52',  'MXN', 'Mexican Peso'),
  ('Netherlands',    'NL', 'NLD', '+31',  'EUR', 'Euro'),
  ('Portugal',       'PT', 'PRT', '+351', 'EUR', 'Euro'),
  ('Spain',          'ES', 'ESP', '+34',  'EUR', 'Euro'),
  ('Italy',          'IT', 'ITA', '+39',  'EUR', 'Euro'),
  ('United Arab Emirates', 'AE', 'ARE', '+971', 'AED', 'UAE Dirham')
ON CONFLICT (iso_code_2) DO NOTHING;

-- ============================================================================
-- Extend profiles with missing columns
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS country_id        INTEGER REFERENCES countries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS state_province    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS educational_level VARCHAR(50),
  ADD COLUMN IF NOT EXISTS employment_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_country_id ON profiles(country_id);
-- ============================================================================
-- Admin observability, API keys, and webhooks
-- ============================================================================

-- ============================================================================
-- ADMIN AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin_user ON admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at DESC);

-- ============================================================================
-- PLATFORM SETTINGS (runtime config / feature flags)
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- REQUEST / ERROR LOGS
-- Full log entries are only persisted for errors (>= 400) and slow requests.
-- ============================================================================
CREATE TABLE IF NOT EXISTS request_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  status_code INT NOT NULL,
  duration_ms INT NOT NULL,
  request_id VARCHAR(32),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  request_body JSONB,
  request_query JSONB,
  response_body JSONB,
  error_message TEXT,
  error_stack TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_status ON request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_request_logs_path ON request_logs(path);
CREATE INDEX IF NOT EXISTS idx_request_logs_duration ON request_logs(duration_ms DESC);

-- ============================================================================
-- REQUEST COUNTERS (hourly buckets for total traffic)
-- Every request increments the counter. Use for dashboards.
-- ============================================================================
CREATE TABLE IF NOT EXISTS request_counters (
  bucket TIMESTAMP WITH TIME ZONE NOT NULL,
  total_requests INT NOT NULL DEFAULT 0,
  success_requests INT NOT NULL DEFAULT 0,
  error_requests INT NOT NULL DEFAULT 0,
  slow_requests INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket)
);

-- ============================================================================
-- API KEYS
-- Keys are hashed (SHA-256) before storage; the raw key is only returned at creation.
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(32) NOT NULL,
  key_hash VARCHAR(128) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_api_key_status CHECK (status IN ('active', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);

-- ============================================================================
-- WEBHOOKS
-- User-scoped webhook subscriptions. Payloads are signed with HMAC-SHA256.
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret VARCHAR(64) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);
CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks USING GIN(events);
-- ============================================================================
-- Payments (generic template): gateways, bank accounts, payment records
-- No SmartStore-specific tables (sites, campaigns, subscriptions FKs).
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  supported_currencies JSONB DEFAULT '["NGN", "USD"]'::jsonb,
  processing_fee DECIMAL(10,4) DEFAULT 0,
  processing_fee_type VARCHAR(20) DEFAULT 'percentage',
  api_public_key TEXT,
  api_secret_key TEXT,
  webhook_secret TEXT,
  base_url TEXT,
  display_name VARCHAR(100),
  description TEXT,
  icon_url TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_code ON payment_methods(code);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active);

INSERT INTO payment_methods (name, code, type, display_name, description, is_active, supported_currencies, processing_fee, processing_fee_type, api_public_key, api_secret_key)
VALUES
  ('Paystack', 'paystack', 'gateway', 'Paystack', 'Card, bank, USSD via Paystack.', true, '["NGN", "ZAR", "KES", "GHS"]'::jsonb, 1.5, 'percentage', NULL, NULL),
  ('Flutterwave', 'flutterwave', 'gateway', 'Flutterwave', 'Regional cards and wallets via Flutterwave.', true, '["NGN", "USD", "KES", "GHS", "ZAR"]'::jsonb, 1.4, 'percentage', NULL, NULL),
  ('Direct Transfer', 'direct_transfer', 'manual', 'Direct Bank Transfer', 'Pay to platform bank account; staff verifies receipt.', true, '["NGN", "USD", "EUR", "GBP"]'::jsonb, 0, 'fixed', NULL, NULL)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bank_name VARCHAR(100) NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_account_number ON bank_accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON bank_accounts(is_active);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id VARCHAR(255) UNIQUE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  type VARCHAR(50) NOT NULL,
  payment_type VARCHAR(50) DEFAULT 'checkout',
  status VARCHAR(30) DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  transaction_ref VARCHAR(255),
  processor_response JSONB,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  anonymous_donor_first_name VARCHAR(100),
  anonymous_donor_last_name VARCHAR(100),
  anonymous_donor_email VARCHAR(255),
  anonymous_donor_phone VARCHAR(20),
  subscription_id UUID,
  campaign_id UUID,
  purpose TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  user_agent TEXT,
  ip_address INET,
  source VARCHAR(20) DEFAULT 'web',
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_interval VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  internal_notes TEXT,
  receipt_url TEXT,
  receipt_file_id UUID REFERENCES files(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_campaign_id ON payments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_ref ON payments(transaction_ref);
CREATE INDEX IF NOT EXISTS idx_payments_anonymous_email ON payments(anonymous_donor_email);
CREATE INDEX IF NOT EXISTS idx_payments_receipt_file_id ON payments(receipt_file_id);
-- ============================================================================
-- Notifications (in-app; used by posts engagement + notification module)
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(80) NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- ============================================================================
-- Posts (user-authored content; SEO, schedule, full-text search)
-- ============================================================================

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  body TEXT,
  excerpt VARCHAR(1000),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_publish_at TIMESTAMPTZ NULL,
  seo_title VARCHAR(200) NULL,
  seo_description VARCHAR(500) NULL,
  og_image_file_id UUID NULL REFERENCES files(id) ON DELETE SET NULL,
  twitter_card VARCHAR(30) NOT NULL DEFAULT 'summary',
  canonical_url TEXT NULL,
  robots_directive VARCHAR(80) NULL,
  search_vector tsvector NULL,
  CONSTRAINT posts_status_check CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_user_slug ON posts(user_id, slug);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status_published_at ON posts(status, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_publish ON posts(scheduled_publish_at)
  WHERE status = 'draft' AND scheduled_publish_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_search_vector ON posts USING GIN (search_vector);

CREATE OR REPLACE FUNCTION posts_search_vector_refresh()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.excerpt, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.body, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_posts_search_vector ON posts;
CREATE TRIGGER trg_posts_search_vector
  BEFORE INSERT OR UPDATE OF title, excerpt, body ON posts
  FOR EACH ROW
  EXECUTE FUNCTION posts_search_vector_refresh();

-- ============================================================================
-- Post comments (nested via parent_id; moderation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moderation_status VARCHAR(20) NOT NULL DEFAULT 'approved',
  moderated_at TIMESTAMPTZ NULL,
  moderated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT post_comments_no_self_parent CHECK (parent_id IS DISTINCT FROM id),
  CONSTRAINT post_comments_moderation_status_check CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'spam'))
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_created ON post_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_post_comments_moderation ON post_comments(post_id, moderation_status)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- Post media (links to files table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL DEFAULT 'gallery',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT post_media_role_check CHECK (role IN ('featured', 'gallery', 'inline')),
  CONSTRAINT post_media_post_file_unique UNIQUE (post_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id, sort_order);

-- ============================================================================
-- Likes
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_likes (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id);

CREATE TABLE IF NOT EXISTS post_comment_likes (
  comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_comment_likes_user ON post_comment_likes(user_id);
