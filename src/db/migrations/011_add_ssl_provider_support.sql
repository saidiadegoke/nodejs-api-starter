-- Migration: Add provider support for SSL certificates
-- This allows tracking whether certificates are from Cloudflare or Let's Encrypt

-- Add provider column to ssl_certificates table
ALTER TABLE ssl_certificates 
ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'cloudflare' CHECK (provider IN ('cloudflare', 'letsencrypt'));

-- Update existing certificates to have provider
UPDATE ssl_certificates SET provider = 'cloudflare' WHERE provider IS NULL;

-- Create index for provider lookups
CREATE INDEX IF NOT EXISTS idx_ssl_certificates_provider ON ssl_certificates(provider);

-- Add provider to custom_domains ssl_provider if not exists (should already exist)
-- This is just for reference, the main tracking is in ssl_certificates

COMMENT ON COLUMN ssl_certificates.provider IS 'SSL certificate provider: cloudflare or letsencrypt';

