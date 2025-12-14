-- =====================================================
-- POLLS SYSTEM MIGRATION
-- Comprehensive schema for all poll types and features
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. MAIN POLLS TABLE
-- =====================================================
CREATE TABLE polls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Basic Information
  title VARCHAR(280) NOT NULL,
  description TEXT,
  question TEXT NOT NULL, -- The actual poll question
  category VARCHAR(100), -- Technology, Politics, Society, Business, etc.

  -- Poll Type Configuration
  poll_type VARCHAR(50) NOT NULL, -- yesno, multipleChoice, multiSelect, ranking, likertScale, slider, imageBased, abcTest, openEnded, predictionMarket, agreementDistribution, mapBased, timeline, binaryWithExplanation, gamified

  -- Type-specific configuration (stored as JSONB for flexibility)
  config JSONB DEFAULT '{}', -- e.g., { maxSelections: 3, sliderMin: 0, sliderMax: 100, scaleType: "agreement", gameMode: "spinToVote" }

  -- Status and Visibility
  status VARCHAR(20) DEFAULT 'active', -- draft, active, closed, archived
  visibility VARCHAR(20) DEFAULT 'public', -- public, private, unlisted

  -- Media
  cover_image TEXT, -- Cover image URL or file ID

  -- Duration
  duration VARCHAR(10), -- 1h, 6h, 1d, 3d, 7d, etc.
  expires_at TIMESTAMP, -- Calculated expiry time

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP,

  -- Soft delete
  deleted_at TIMESTAMP
);

-- Indexes for polls
CREATE INDEX idx_polls_user_id ON polls(user_id);
CREATE INDEX idx_polls_status ON polls(status);
CREATE INDEX idx_polls_poll_type ON polls(poll_type);
CREATE INDEX idx_polls_category ON polls(category);
CREATE INDEX idx_polls_created_at ON polls(created_at DESC);
CREATE INDEX idx_polls_expires_at ON polls(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_polls_active ON polls(status, expires_at) WHERE status = 'active';

-- =====================================================
-- 2. POLL OPTIONS TABLE
-- =====================================================
-- For polls that have options (multiple choice, ranking, images, etc.)
CREATE TABLE poll_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,

  -- Option Details
  label TEXT NOT NULL,
  description TEXT, -- Optional description for the option
  image_url TEXT, -- For image-based polls

  -- For specific poll types
  value FLOAT, -- Used for slider or numeric polls
  position INT NOT NULL DEFAULT 0, -- Order of options

  -- Variant information (for A/B/C tests)
  variant_name VARCHAR(100), -- Variant A, Variant B, etc.
  variant_content TEXT, -- Content for the variant

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for poll_options
CREATE INDEX idx_poll_options_poll_id ON poll_options(poll_id);
CREATE INDEX idx_poll_options_position ON poll_options(poll_id, position);

-- =====================================================
-- 3. POLL RESPONSES TABLE
-- =====================================================
-- Tracks each user's answer - supports ALL poll types
CREATE TABLE poll_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Response data (use appropriate field based on poll type)
  option_id UUID REFERENCES poll_options(id) ON DELETE SET NULL, -- For choice-based polls
  option_ids UUID[], -- For multi-select polls
  numeric_value FLOAT, -- For slider, rating, numeric polls, predictions
  text_value TEXT, -- For open-ended polls
  ranking_data JSONB, -- For ranking polls: [{"option_id": "uuid", "rank": 1}, ...]

  -- Additional metadata
  metadata JSONB DEFAULT '{}', -- Extra data like sentiment, location coordinates, timeline data
  explanation TEXT, -- For binaryWithExplanation polls

  -- Engagement tracking
  referral_code VARCHAR(50), -- Track which repost/share led to this response

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Ensure one response per user per poll (can be updated)
  UNIQUE(poll_id, user_id)
);

-- Indexes for poll_responses
CREATE INDEX idx_poll_responses_poll_id ON poll_responses(poll_id);
CREATE INDEX idx_poll_responses_user_id ON poll_responses(user_id);
CREATE INDEX idx_poll_responses_option_id ON poll_responses(option_id);
CREATE INDEX idx_poll_responses_created_at ON poll_responses(created_at DESC);
CREATE INDEX idx_poll_responses_referral ON poll_responses(referral_code) WHERE referral_code IS NOT NULL;

-- =====================================================
-- 4. POLL COMMENTS TABLE
-- =====================================================
-- Comments and replies on polls
CREATE TABLE poll_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES poll_comments(id) ON DELETE CASCADE, -- For nested replies

  -- Comment content
  comment TEXT NOT NULL,

  -- Moderation
  is_flagged BOOLEAN DEFAULT FALSE,
  is_hidden BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Indexes for poll_comments
CREATE INDEX idx_poll_comments_poll_id ON poll_comments(poll_id);
CREATE INDEX idx_poll_comments_user_id ON poll_comments(user_id);
CREATE INDEX idx_poll_comments_parent ON poll_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;
CREATE INDEX idx_poll_comments_created_at ON poll_comments(created_at DESC);

-- =====================================================
-- 5. POLL RATINGS TABLE
-- =====================================================
-- Users can rate a poll (separate from poll response)
CREATE TABLE poll_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(poll_id, user_id)
);

-- Indexes for poll_ratings
CREATE INDEX idx_poll_ratings_poll_id ON poll_ratings(poll_id);
CREATE INDEX idx_poll_ratings_user_id ON poll_ratings(user_id);

-- =====================================================
-- 6. POLL ENGAGEMENTS TABLE
-- =====================================================
-- Unified table for likes, favorites, reposts, shares, views, bookmarks
CREATE TABLE poll_engagements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  engagement_type VARCHAR(20) NOT NULL, -- like, favorite, repost, share, view, bookmark

  -- Metadata (flexible for different engagement types)
  metadata JSONB DEFAULT '{}', -- e.g., share platform, repost target, view duration

  created_at TIMESTAMP DEFAULT NOW(),

  -- Ensure unique engagement per user per poll per type
  UNIQUE(poll_id, user_id, engagement_type)
);

-- Indexes for poll_engagements
CREATE INDEX idx_poll_engagements_poll_id ON poll_engagements(poll_id);
CREATE INDEX idx_poll_engagements_user_id ON poll_engagements(user_id);
CREATE INDEX idx_poll_engagements_type ON poll_engagements(engagement_type);
CREATE INDEX idx_poll_engagements_created_at ON poll_engagements(created_at DESC);

-- =====================================================
-- 7. POLL STATS TABLE
-- =====================================================
-- Denormalized counters for performance
CREATE TABLE poll_stats (
  poll_id UUID PRIMARY KEY REFERENCES polls(id) ON DELETE CASCADE,

  -- Engagement metrics
  views INT DEFAULT 0,
  likes INT DEFAULT 0,
  favorites INT DEFAULT 0,
  bookmarks INT DEFAULT 0,
  shares INT DEFAULT 0,
  reposts INT DEFAULT 0,
  comments INT DEFAULT 0,
  responses INT DEFAULT 0,

  -- Rating metrics
  avg_rating FLOAT DEFAULT 0,
  total_ratings INT DEFAULT 0,

  -- Timestamps
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 8. ENGAGEMENT EVENTS TABLE
-- =====================================================
-- Analytics for rewarding users and tracking influence
CREATE TABLE engagement_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,

  -- Who did what
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Who performed the action
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Poll owner (recipient of engagement)

  -- Event details
  event_type VARCHAR(50) NOT NULL, -- like, share, repost, comment, response, view, influence_share, influence_response
  event_value INT DEFAULT 1, -- Number of views/responses generated, etc.

  -- Attribution
  referral_code VARCHAR(50), -- Track attribution chain
  source_engagement_id UUID REFERENCES poll_engagements(id) ON DELETE SET NULL, -- Link to original engagement

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for engagement_events
CREATE INDEX idx_engagement_events_poll_id ON engagement_events(poll_id);
CREATE INDEX idx_engagement_events_actor ON engagement_events(actor_user_id);
CREATE INDEX idx_engagement_events_target ON engagement_events(target_user_id);
CREATE INDEX idx_engagement_events_type ON engagement_events(event_type);
CREATE INDEX idx_engagement_events_created_at ON engagement_events(created_at DESC);
CREATE INDEX idx_engagement_events_referral ON engagement_events(referral_code) WHERE referral_code IS NOT NULL;

-- =====================================================
-- 9. POLL REPOSTS TABLE
-- =====================================================
-- Track repost chains and influence
CREATE TABLE poll_reposts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  reposted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Unique tracking code for attribution
  repost_code VARCHAR(50) UNIQUE NOT NULL,

  -- Metrics
  views_generated INT DEFAULT 0,
  responses_generated INT DEFAULT 0,
  shares_generated INT DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(poll_id, reposted_by)
);

-- Indexes for poll_reposts
CREATE INDEX idx_poll_reposts_poll_id ON poll_reposts(poll_id);
CREATE INDEX idx_poll_reposts_user_id ON poll_reposts(reposted_by);
CREATE INDEX idx_poll_reposts_code ON poll_reposts(repost_code);

-- =====================================================
-- 10. POLL SHARE LOGS TABLE
-- =====================================================
-- Track shares across different platforms
CREATE TABLE poll_share_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  share_platform VARCHAR(50) NOT NULL, -- twitter, facebook, whatsapp, linkedin, email, copy_link

  -- Optional tracking
  share_url TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for poll_share_logs
CREATE INDEX idx_poll_share_logs_poll_id ON poll_share_logs(poll_id);
CREATE INDEX idx_poll_share_logs_user_id ON poll_share_logs(user_id);
CREATE INDEX idx_poll_share_logs_platform ON poll_share_logs(share_platform);
CREATE INDEX idx_poll_share_logs_created_at ON poll_share_logs(created_at DESC);

-- =====================================================
-- 11. POLL TAGS TABLE
-- =====================================================
-- For categorization and discovery
CREATE TABLE poll_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  tag VARCHAR(100) NOT NULL,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(poll_id, tag)
);

-- Indexes for poll_tags
CREATE INDEX idx_poll_tags_poll_id ON poll_tags(poll_id);
CREATE INDEX idx_poll_tags_tag ON poll_tags(tag);

-- =====================================================
-- TRIGGERS FOR UPDATING POLL STATS
-- =====================================================

-- Function to initialize poll stats
CREATE OR REPLACE FUNCTION initialize_poll_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO poll_stats (poll_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_initialize_poll_stats
AFTER INSERT ON polls
FOR EACH ROW
EXECUTE FUNCTION initialize_poll_stats();

-- Function to update poll stats on response
CREATE OR REPLACE FUNCTION update_poll_stats_on_response()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE poll_stats
  SET
    responses = responses + 1,
    updated_at = NOW()
  WHERE poll_id = NEW.poll_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stats_on_response
AFTER INSERT ON poll_responses
FOR EACH ROW
EXECUTE FUNCTION update_poll_stats_on_response();

-- Function to update poll stats on comment
CREATE OR REPLACE FUNCTION update_poll_stats_on_comment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE poll_stats
  SET
    comments = comments + 1,
    updated_at = NOW()
  WHERE poll_id = NEW.poll_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stats_on_comment
AFTER INSERT ON poll_comments
FOR EACH ROW
EXECUTE FUNCTION update_poll_stats_on_comment();

-- Function to update poll stats on engagement
CREATE OR REPLACE FUNCTION update_poll_stats_on_engagement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE poll_stats
  SET
    views = CASE WHEN NEW.engagement_type = 'view' THEN views + 1 ELSE views END,
    likes = CASE WHEN NEW.engagement_type = 'like' THEN likes + 1 ELSE likes END,
    favorites = CASE WHEN NEW.engagement_type = 'favorite' THEN favorites + 1 ELSE favorites END,
    bookmarks = CASE WHEN NEW.engagement_type = 'bookmark' THEN bookmarks + 1 ELSE bookmarks END,
    shares = CASE WHEN NEW.engagement_type = 'share' THEN shares + 1 ELSE shares END,
    reposts = CASE WHEN NEW.engagement_type = 'repost' THEN reposts + 1 ELSE reposts END,
    updated_at = NOW()
  WHERE poll_id = NEW.poll_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stats_on_engagement
AFTER INSERT ON poll_engagements
FOR EACH ROW
EXECUTE FUNCTION update_poll_stats_on_engagement();

-- Function to update poll stats on rating
CREATE OR REPLACE FUNCTION update_poll_stats_on_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE poll_stats
  SET
    total_ratings = total_ratings + 1,
    avg_rating = (
      SELECT AVG(rating)::FLOAT
      FROM poll_ratings
      WHERE poll_id = NEW.poll_id
    ),
    updated_at = NOW()
  WHERE poll_id = NEW.poll_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stats_on_rating
AFTER INSERT ON poll_ratings
FOR EACH ROW
EXECUTE FUNCTION update_poll_stats_on_rating();

-- =====================================================
-- FUNCTIONS FOR ANALYTICS
-- =====================================================

-- Function to generate unique repost code
CREATE OR REPLACE FUNCTION generate_repost_code(poll_uuid UUID, user_uuid UUID)
RETURNS VARCHAR AS $$
BEGIN
  RETURN ENCODE(DIGEST(poll_uuid::TEXT || user_uuid::TEXT || NOW()::TEXT, 'sha256'), 'hex')::VARCHAR(50);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE polls IS 'Main polls table supporting all poll types';
COMMENT ON TABLE poll_options IS 'Options for choice-based polls';
COMMENT ON TABLE poll_responses IS 'User responses to polls - supports all poll types';
COMMENT ON TABLE poll_comments IS 'Comments and replies on polls';
COMMENT ON TABLE poll_ratings IS 'User ratings for polls (1-5 stars)';
COMMENT ON TABLE poll_engagements IS 'Unified table for all engagement types';
COMMENT ON TABLE poll_stats IS 'Denormalized counters for performance';
COMMENT ON TABLE engagement_events IS 'Analytics events for rewarding users';
COMMENT ON TABLE poll_reposts IS 'Track repost chains and influence';
COMMENT ON TABLE poll_share_logs IS 'Track shares across platforms';
COMMENT ON TABLE poll_tags IS 'Tags for poll categorization';

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
-- Adjust these based on your application user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
