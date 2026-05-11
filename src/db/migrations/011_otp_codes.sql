-- OTP codes — short numeric codes delivered via email and/or SMS.
-- Mirrors the password_resets table shape: raw code never stored
-- (sha256 hash only); rows are append-only, marked `verified_at` on
-- successful verification; older rows for the same user become
-- inactive once a newer row exists (lookup picks the latest active).

CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL,
  channel VARCHAR(10) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(40) NULL,
  ip_address INET NULL,
  user_agent TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT otp_codes_channel_check
    CHECK (channel IN ('email', 'sms', 'both'))
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_user_active
  ON otp_codes (user_id, created_at DESC)
  WHERE verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_otp_codes_code_hash
  ON otp_codes (code_hash)
  WHERE verified_at IS NULL;
