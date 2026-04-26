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
