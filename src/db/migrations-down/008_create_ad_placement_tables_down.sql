-- Rollback Migration 008: Drop Ad Placement System Tables

-- Drop triggers first
DROP TRIGGER IF EXISTS ad_placements_updated_at ON ad_placements;
DROP TRIGGER IF EXISTS custom_ads_updated_at ON custom_ads;
DROP TRIGGER IF EXISTS adsense_config_updated_at ON adsense_config;

-- Drop function
DROP FUNCTION IF EXISTS update_ad_placement_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_ad_placements_location_type;
DROP INDEX IF EXISTS idx_ad_placements_is_enabled;
DROP INDEX IF EXISTS idx_custom_ads_is_active;
DROP INDEX IF EXISTS idx_custom_ads_dates;
DROP INDEX IF EXISTS idx_ad_impressions_ad_id;
DROP INDEX IF EXISTS idx_ad_impressions_placement_key;
DROP INDEX IF EXISTS idx_ad_impressions_created_at;
DROP INDEX IF EXISTS idx_ad_impressions_user_id;
DROP INDEX IF EXISTS idx_adsense_config_placement_key;

-- Drop tables (in reverse order of dependencies)
DROP TABLE IF EXISTS adsense_config;
DROP TABLE IF EXISTS ad_impressions;
DROP TABLE IF EXISTS custom_ads;
DROP TABLE IF EXISTS ad_placements;
