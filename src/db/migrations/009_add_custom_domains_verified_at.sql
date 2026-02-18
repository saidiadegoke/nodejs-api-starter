-- Add verified_at to custom_domains for domain verification timestamp.
-- Used when verification succeeds and by the API response.

ALTER TABLE custom_domains
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN custom_domains.verified_at IS 'When the domain was successfully verified (DNS TXT check).';
