-- NIN pending verification: track unavailable provider state and cache candidate intake fields

ALTER TABLE jupeb_nin_verifications
  ADD COLUMN IF NOT EXISTS intake_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(40) NULL;

CREATE INDEX IF NOT EXISTS idx_nin_verifications_pending_retry
  ON jupeb_nin_verifications (status, retry_after)
  WHERE status = 'pending';
