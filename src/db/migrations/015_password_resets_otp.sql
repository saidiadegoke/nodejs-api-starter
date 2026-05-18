-- M.12: password reset via 6-digit OTP (in addition to existing link tokens)
--
-- Extends password_resets with a `kind` discriminator and `attempt_count`
-- for OTP brute-force protection. Existing rows backfill to kind='token'.
--
-- Storage:
--   kind='token' → token_hash = sha256(long random token), redeemed by
--                  posting the raw token. Existing flow, unchanged.
--   kind='otp'   → token_hash = sha256(6-digit code), redeemed by posting
--                  identifier + code (user_id-scoped lookup so the small
--                  code space isn't brute-forceable).

ALTER TABLE password_resets
  ADD COLUMN IF NOT EXISTS kind          VARCHAR(10) NOT NULL DEFAULT 'token',
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER     NOT NULL DEFAULT 0;

ALTER TABLE password_resets
  DROP CONSTRAINT IF EXISTS password_resets_kind_check;
ALTER TABLE password_resets
  ADD  CONSTRAINT password_resets_kind_check CHECK (kind IN ('token', 'otp'));

-- Backfill: any rows that pre-date this migration are tokens.
UPDATE password_resets SET kind = 'token' WHERE kind IS NULL OR kind = '';

-- OTPs are looked up by user_id (the small code space means we can't
-- safely look up by hash alone). Active = not yet used.
CREATE INDEX IF NOT EXISTS idx_password_resets_user_otp_active
  ON password_resets (user_id, created_at DESC)
  WHERE kind = 'otp' AND used_at IS NULL;
