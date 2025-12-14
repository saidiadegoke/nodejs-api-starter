-- =====================================================
-- ROLLBACK MIGRATION FOR POLLS SYSTEM
-- =====================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_update_stats_on_rating ON poll_ratings;
DROP TRIGGER IF EXISTS trigger_update_stats_on_engagement ON poll_engagements;
DROP TRIGGER IF EXISTS trigger_update_stats_on_comment ON poll_comments;
DROP TRIGGER IF EXISTS trigger_update_stats_on_response ON poll_responses;
DROP TRIGGER IF EXISTS trigger_initialize_poll_stats ON polls;

-- Drop functions
DROP FUNCTION IF EXISTS update_poll_stats_on_rating();
DROP FUNCTION IF EXISTS update_poll_stats_on_engagement();
DROP FUNCTION IF EXISTS update_poll_stats_on_comment();
DROP FUNCTION IF EXISTS update_poll_stats_on_response();
DROP FUNCTION IF EXISTS initialize_poll_stats();
DROP FUNCTION IF EXISTS generate_repost_code(UUID, UUID);

-- Drop tables in reverse order (respecting foreign key constraints)
DROP TABLE IF EXISTS poll_tags CASCADE;
DROP TABLE IF EXISTS poll_share_logs CASCADE;
DROP TABLE IF EXISTS poll_reposts CASCADE;
DROP TABLE IF EXISTS engagement_events CASCADE;
DROP TABLE IF EXISTS poll_stats CASCADE;
DROP TABLE IF EXISTS poll_engagements CASCADE;
DROP TABLE IF EXISTS poll_ratings CASCADE;
DROP TABLE IF EXISTS poll_comments CASCADE;
DROP TABLE IF EXISTS poll_responses CASCADE;
DROP TABLE IF EXISTS poll_options CASCADE;
DROP TABLE IF EXISTS polls CASCADE;
