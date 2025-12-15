-- =====================================================
-- USER PREFERENCES AND PERSONALIZATION MIGRATION
-- Creates tables for personalized home feed
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USER PREFERENCES TABLE
-- =====================================================
-- Stores user's explicit preferences for feed customization
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Category preferences (explicit choices)
  preferred_categories TEXT[] DEFAULT '{}',
  blocked_categories TEXT[] DEFAULT '{}',
  
  -- Poll type preferences
  preferred_poll_types TEXT[] DEFAULT '{}',
  blocked_poll_types TEXT[] DEFAULT '{}',
  
  -- Content preferences
  show_controversial BOOLEAN DEFAULT true,
  show_trending BOOLEAN DEFAULT true,
  show_new BOOLEAN DEFAULT true,
  show_followed_users BOOLEAN DEFAULT true,
  
  -- Feed algorithm preferences
  feed_algorithm VARCHAR(20) DEFAULT 'balanced', -- 'chronological', 'engagement', 'personalized', 'balanced'
  content_freshness VARCHAR(20) DEFAULT 'mixed', -- 'latest', 'popular', 'mixed'
  
  -- Engagement thresholds
  min_responses INTEGER DEFAULT 0,
  min_comments INTEGER DEFAULT 0,
  
  -- Language preferences
  preferred_languages TEXT[] DEFAULT '{"en"}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id)
);

-- =====================================================
-- USER INTERESTS TABLE (Implicit from behavior)
-- =====================================================
-- Tracks user interests based on their behavior
CREATE TABLE user_interests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Interest details
  interest_type VARCHAR(50) NOT NULL, -- 'category', 'keyword', 'author', 'poll_type'
  interest_value TEXT NOT NULL, -- The actual category/keyword/author_id/poll_type
  
  -- Interest strength (calculated from behavior)
  score FLOAT DEFAULT 1.0, -- Higher = more interested
  interaction_count INTEGER DEFAULT 1,
  
  -- Last interaction
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, interest_type, interest_value)
);

-- =====================================================
-- USER FEED HISTORY TABLE
-- =====================================================
-- Tracks what polls user has seen to avoid repetition
CREATE TABLE user_feed_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  
  -- Interaction details
  shown_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  clicked BOOLEAN DEFAULT false,
  clicked_at TIMESTAMP WITH TIME ZONE,
  
  -- Feed context
  feed_position INTEGER, -- Position in feed when shown
  feed_algorithm VARCHAR(20), -- Which algorithm showed this poll
  
  UNIQUE(user_id, poll_id)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- User preferences indexes
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX idx_user_preferences_categories ON user_preferences USING GIN(preferred_categories);
CREATE INDEX idx_user_preferences_poll_types ON user_preferences USING GIN(preferred_poll_types);

-- User interests indexes
CREATE INDEX idx_user_interests_user_id ON user_interests(user_id);
CREATE INDEX idx_user_interests_type_value ON user_interests(interest_type, interest_value);
CREATE INDEX idx_user_interests_score ON user_interests(user_id, score DESC);
CREATE INDEX idx_user_interests_last_interaction ON user_interests(last_interaction_at DESC);

-- Feed history indexes
CREATE INDEX idx_user_feed_history_user_id ON user_feed_history(user_id);
CREATE INDEX idx_user_feed_history_shown_at ON user_feed_history(shown_at DESC);
CREATE INDEX idx_user_feed_history_user_poll ON user_feed_history(user_id, poll_id);

-- =====================================================
-- TRIGGERS FOR AUTO-UPDATES
-- =====================================================

-- Update user_preferences updated_at
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_preferences_timestamp
BEFORE UPDATE ON user_preferences
FOR EACH ROW
EXECUTE FUNCTION update_user_preferences_updated_at();

-- Update user_interests updated_at
CREATE OR REPLACE FUNCTION update_user_interests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_interests_timestamp
BEFORE UPDATE ON user_interests
FOR EACH ROW
EXECUTE FUNCTION update_user_interests_updated_at();

-- =====================================================
-- FUNCTIONS FOR INTEREST TRACKING
-- =====================================================

-- Function to update user interest score
CREATE OR REPLACE FUNCTION update_user_interest(
  p_user_id UUID,
  p_interest_type VARCHAR(50),
  p_interest_value TEXT,
  p_score_increment FLOAT DEFAULT 1.0
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_interests (user_id, interest_type, interest_value, score, interaction_count)
  VALUES (p_user_id, p_interest_type, p_interest_value, p_score_increment, 1)
  ON CONFLICT (user_id, interest_type, interest_value)
  DO UPDATE SET
    score = user_interests.score + p_score_increment,
    interaction_count = user_interests.interaction_count + 1,
    last_interaction_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to decay interest scores over time
CREATE OR REPLACE FUNCTION decay_user_interests()
RETURNS VOID AS $$
BEGIN
  UPDATE user_interests
  SET 
    score = score * 0.95, -- 5% decay
    updated_at = CURRENT_TIMESTAMP
  WHERE last_interaction_at < NOW() - INTERVAL '7 days'
    AND score > 0.1; -- Don't decay below minimum threshold
    
  -- Remove very low scores
  DELETE FROM user_interests
  WHERE score < 0.1 AND last_interaction_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEWS FOR EASY QUERYING
-- =====================================================

-- View for user's top interests
CREATE OR REPLACE VIEW user_top_interests AS
SELECT 
  ui.user_id,
  ui.interest_type,
  ui.interest_value,
  ui.score,
  ui.interaction_count,
  ui.last_interaction_at,
  ROW_NUMBER() OVER (PARTITION BY ui.user_id, ui.interest_type ORDER BY ui.score DESC) as rank
FROM user_interests ui
WHERE ui.score > 0.5
ORDER BY ui.user_id, ui.interest_type, ui.score DESC;

-- View for user feed preferences summary
CREATE OR REPLACE VIEW user_feed_preferences AS
SELECT 
  up.user_id,
  up.preferred_categories,
  up.blocked_categories,
  up.preferred_poll_types,
  up.blocked_poll_types,
  up.feed_algorithm,
  up.content_freshness,
  up.show_controversial,
  up.show_trending,
  up.show_new,
  -- Top category interests
  COALESCE(
    ARRAY(
      SELECT uti.interest_value 
      FROM user_top_interests uti 
      WHERE uti.user_id = up.user_id 
        AND uti.interest_type = 'category' 
        AND uti.rank <= 5
      ORDER BY uti.score DESC
    ), 
    '{}'::TEXT[]
  ) as top_category_interests,
  -- Top poll type interests
  COALESCE(
    ARRAY(
      SELECT uti.interest_value 
      FROM user_top_interests uti 
      WHERE uti.user_id = up.user_id 
        AND uti.interest_type = 'poll_type' 
        AND uti.rank <= 3
      ORDER BY uti.score DESC
    ), 
    '{}'::TEXT[]
  ) as top_poll_type_interests
FROM user_preferences up;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE user_preferences IS 'User explicit preferences for feed customization';
COMMENT ON TABLE user_interests IS 'User implicit interests derived from behavior';
COMMENT ON TABLE user_feed_history IS 'History of polls shown to user to avoid repetition';

COMMENT ON COLUMN user_interests.score IS 'Interest strength score, higher = more interested';
COMMENT ON COLUMN user_interests.interaction_count IS 'Number of interactions with this interest';

COMMENT ON FUNCTION update_user_interest IS 'Updates user interest score based on interactions';
COMMENT ON FUNCTION decay_user_interests IS 'Decays interest scores over time to keep preferences fresh';