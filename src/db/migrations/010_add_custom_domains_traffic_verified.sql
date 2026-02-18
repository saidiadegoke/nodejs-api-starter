-- Separate "ownership verified" (TXT) from "traffic verified" (CNAME pointing).
-- verified = TXT ownership; traffic_verified = CNAME points to our target.
-- Both must be true for domain to be considered fully verified (SSL, etc.).

ALTER TABLE custom_domains
  ADD COLUMN IF NOT EXISTS traffic_verified BOOLEAN DEFAULT false;

COMMENT ON COLUMN custom_domains.traffic_verified IS 'True when CNAME (or A/ALIAS) points to the site target (e.g. siteSlug.smartstore.ng).';

-- Existing domains that were already verified are assumed pointed (keep current behavior).
UPDATE custom_domains SET traffic_verified = true WHERE verified = true AND (traffic_verified IS NULL OR traffic_verified = false);
