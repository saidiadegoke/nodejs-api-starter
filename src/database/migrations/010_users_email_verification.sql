-- Email verification: store a sha256 hash of the active verification token
-- and its expiry on the users row. One active token per user; resend
-- overwrites. Raw token never lives in the DB — only the recipient's
-- inbox holds it, and the server compares hashes on the verify endpoint.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verification_token_hash CHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_verification_token_hash
  ON users (email_verification_token_hash)
  WHERE email_verification_token_hash IS NOT NULL;
