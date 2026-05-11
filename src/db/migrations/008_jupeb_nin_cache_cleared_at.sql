-- NIN verification cache lifecycle.
--
-- A verified NIN row acts as a cache: while the linked registration is
-- still in-flight, re-verifying the same NIN should reuse the existing
-- row instead of paying another upstream lookup. When the registration
-- reaches a terminal status (approved / rejected / withdrawn), the cache
-- is cleared — response_payload is purged (PII no longer needed) and
-- cleared_at is set so subsequent verifyNin calls bypass the cache and
-- go fresh to the provider.

ALTER TABLE jupeb_nin_verifications
  ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ NULL;

-- Cache lookup path: latest non-cleared verified row for a given nin_hash.
-- Partial index keeps the hot path narrow.
CREATE INDEX IF NOT EXISTS idx_nin_verifications_active_cache
  ON jupeb_nin_verifications (nin_hash, created_at DESC)
  WHERE status = 'verified' AND cleared_at IS NULL;
