-- Migration 008: Create Ad Placement System Tables
-- Description: Tables for managing Google AdSense and custom B2B ad placements

-- Ad placements configuration table
CREATE TABLE IF NOT EXISTS ad_placements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  placement_key VARCHAR(100) UNIQUE NOT NULL,
  placement_name VARCHAR(255) NOT NULL,
  placement_description TEXT,
  location_type VARCHAR(50) NOT NULL, -- 'feed', 'poll_detail', 'context', 'public_share', 'profile', 'analytics'
  is_enabled BOOLEAN DEFAULT false,
  ad_type VARCHAR(50) DEFAULT 'google_adsense', -- 'google_adsense', 'custom_b2b', 'both'
  frequency INTEGER DEFAULT 1, -- For "every N items" placements (e.g., every 5 polls)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Custom B2B ads table
CREATE TABLE IF NOT EXISTS custom_ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_name VARCHAR(255) NOT NULL,
  ad_type VARCHAR(50) DEFAULT 'banner', -- 'banner', 'native', 'video', 'sidebar'
  content_html TEXT, -- HTML content for the ad
  image_url TEXT,
  link_url TEXT,
  cta_text VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  target_placements TEXT[], -- Array of placement_keys where this ad can show
  priority INTEGER DEFAULT 0, -- Higher priority shows first
  impressions_count INTEGER DEFAULT 0,
  clicks_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Ad performance tracking
CREATE TABLE IF NOT EXISTS ad_impressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_id UUID REFERENCES custom_ads(id) ON DELETE CASCADE,
  placement_key VARCHAR(100),
  user_id UUID REFERENCES users(id), -- NULL for anonymous users
  page_url TEXT,
  action_type VARCHAR(50) DEFAULT 'impression', -- 'impression', 'click'
  session_id VARCHAR(255), -- Track unique sessions for better metrics
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Google AdSense configuration
CREATE TABLE IF NOT EXISTS adsense_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  placement_key VARCHAR(100) REFERENCES ad_placements(placement_key) ON DELETE CASCADE,
  ad_client VARCHAR(255), -- ca-pub-xxxxx
  ad_slot VARCHAR(255),
  ad_format VARCHAR(50) DEFAULT 'auto', -- 'auto', 'rectangle', 'horizontal', 'vertical'
  ad_style JSON, -- Custom styling options
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(placement_key)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ad_placements_location_type ON ad_placements(location_type);
CREATE INDEX IF NOT EXISTS idx_ad_placements_is_enabled ON ad_placements(is_enabled);
CREATE INDEX IF NOT EXISTS idx_custom_ads_is_active ON custom_ads(is_active);
CREATE INDEX IF NOT EXISTS idx_custom_ads_dates ON custom_ads(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad_id ON ad_impressions(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_placement_key ON ad_impressions(placement_key);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_created_at ON ad_impressions(created_at);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_user_id ON ad_impressions(user_id);
CREATE INDEX IF NOT EXISTS idx_adsense_config_placement_key ON adsense_config(placement_key);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ad_placement_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ad_placements_updated_at
  BEFORE UPDATE ON ad_placements
  FOR EACH ROW
  EXECUTE FUNCTION update_ad_placement_updated_at();

CREATE TRIGGER custom_ads_updated_at
  BEFORE UPDATE ON custom_ads
  FOR EACH ROW
  EXECUTE FUNCTION update_ad_placement_updated_at();

CREATE TRIGGER adsense_config_updated_at
  BEFORE UPDATE ON adsense_config
  FOR EACH ROW
  EXECUTE FUNCTION update_ad_placement_updated_at();

-- Insert default ad placements
INSERT INTO ad_placements (placement_key, placement_name, placement_description, location_type, is_enabled, ad_type, frequency) VALUES
  ('feed_top_banner', 'Feed Top Banner', 'Banner ad at the top of the main feed', 'feed', false, 'google_adsense', 1),
  ('feed_between_polls', 'Feed Between Polls', 'Ad shown between poll cards in the feed', 'feed', false, 'google_adsense', 5),
  ('feed_sidebar', 'Feed Sidebar', 'Sticky ad in the right sidebar on desktop', 'feed', false, 'google_adsense', 1),
  ('poll_detail_after_question', 'Poll Detail - After Question', 'Ad shown after poll question, before voting options', 'poll_detail', false, 'google_adsense', 1),
  ('poll_detail_after_vote', 'Poll Detail - After Vote', 'Ad shown after user votes, before results', 'poll_detail', false, 'google_adsense', 1),
  ('poll_detail_below_comments', 'Poll Detail - Below Comments', 'Ad shown at the bottom of the comments section', 'poll_detail', false, 'google_adsense', 1),
  ('poll_detail_sidebar', 'Poll Detail Sidebar', 'Sticky ad in the right sidebar on poll detail page', 'poll_detail', false, 'google_adsense', 1),
  ('context_after_summary', 'Context - After Summary', 'Ad shown after context summary, before full content', 'context', false, 'google_adsense', 1),
  ('context_between_blocks', 'Context - Between Blocks', 'Ad shown between content blocks', 'context', false, 'google_adsense', 3),
  ('context_below_related', 'Context - Below Related Polls', 'Ad shown at the bottom of related polls section', 'context', false, 'google_adsense', 1),
  ('context_sidebar', 'Context Sidebar', 'Sticky ad in the right sidebar on context page', 'context', false, 'google_adsense', 1),
  ('public_share_after_preview', 'Public Share - After Preview', 'Ad shown on public share page after content preview', 'public_share', false, 'google_adsense', 1),
  ('public_share_between_polls', 'Public Share - Between Polls', 'Ad shown between related polls on public share pages', 'public_share', false, 'google_adsense', 3),
  ('public_share_bottom_banner', 'Public Share - Bottom Banner', 'Sticky bottom banner on public share pages (mobile-friendly)', 'public_share', false, 'google_adsense', 1),
  ('profile_sidebar', 'Profile Sidebar', 'Ad in the sidebar on user profile pages', 'profile', false, 'google_adsense', 1),
  ('profile_below_activity', 'Profile - Below Activity', 'Ad shown below the activity feed on profile pages', 'profile', false, 'google_adsense', 1),
  ('analytics_above_charts', 'Analytics - Above Charts', 'Banner ad above analytics charts', 'analytics', false, 'google_adsense', 1),
  ('analytics_sidebar', 'Analytics Sidebar', 'Sticky ad in the analytics page sidebar', 'analytics', false, 'google_adsense', 1)
ON CONFLICT (placement_key) DO NOTHING;

-- Comments
COMMENT ON TABLE ad_placements IS 'Configuration for ad placement locations throughout the app';
COMMENT ON TABLE custom_ads IS 'Custom B2B advertisements that can be displayed in various placements';
COMMENT ON TABLE ad_impressions IS 'Tracking table for ad impressions and clicks';
COMMENT ON TABLE adsense_config IS 'Google AdSense configuration per placement';
COMMENT ON COLUMN ad_placements.frequency IS 'For repeating placements (e.g., show ad every 5 polls). 1 means show once.';
COMMENT ON COLUMN custom_ads.priority IS 'Higher priority ads are shown first when multiple ads target the same placement';
COMMENT ON COLUMN ad_impressions.session_id IS 'Used to track unique user sessions for more accurate engagement metrics';

-- =====================================================
-- ADD NOT_FOR_FEED FIELD MIGRATION
-- Adds visibility control for feeds/listings
-- =====================================================

-- Add not_for_feed field to polls table
-- Default is FALSE, meaning items ARE shown in feeds unless explicitly hidden
ALTER TABLE polls
ADD COLUMN not_for_feed BOOLEAN DEFAULT FALSE NOT NULL;

-- Add index for efficient filtering
CREATE INDEX idx_polls_not_for_feed ON polls(not_for_feed) WHERE not_for_feed = FALSE;

-- Add not_for_feed field to context_sources table
ALTER TABLE context_sources
ADD COLUMN not_for_feed BOOLEAN DEFAULT FALSE NOT NULL;

-- Add index for efficient filtering
CREATE INDEX idx_context_sources_not_for_feed ON context_sources(not_for_feed) WHERE not_for_feed = FALSE;

-- Comments
COMMENT ON COLUMN polls.not_for_feed IS 'If TRUE, poll will not appear in public feeds (/feed, /explore, /trending) but remains accessible via direct link';
COMMENT ON COLUMN context_sources.not_for_feed IS 'If TRUE, context/story will not appear in public listings (/stories) but remains accessible via direct link';
