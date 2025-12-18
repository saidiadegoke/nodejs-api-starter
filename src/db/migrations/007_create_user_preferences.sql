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

-- =====================================================
-- Migration: Create Polymorphic Comments System
-- =====================================================
-- This migration refactors the comments system to support multiple models
-- (polls, context sources, and future entities) using a polymorphic approach

-- =====================================================
-- 2. Create indexes for the new comments table
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_comments_commentable ON comments(commentable_type, commentable_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_not_deleted ON comments(commentable_type, commentable_id) WHERE deleted_at IS NULL;
-- =====================================================
-- 3. Migrate existing poll comments to new table
-- =====================================================
INSERT INTO comments (
  commentable_type,
  commentable_id,
  user_id,
  parent_comment_id,
  comment,
  is_flagged,
  is_hidden,
  created_at,
  updated_at,
  deleted_at
)
SELECT 
  'poll' as commentable_type,
  poll_id as commentable_id,
  user_id,
  parent_comment_id,
  comment,
  is_flagged,
  is_hidden,
  created_at,
  updated_at,
  deleted_at
FROM poll_comments;

-- =====================================================
-- 4. Update parent_comment_id references for migrated data
-- =====================================================
-- We need to map old poll_comment IDs to new comment IDs
WITH comment_mapping AS (
  SELECT 
    pc.id as old_id,
    c.id as new_id
  FROM poll_comments pc
  JOIN comments c ON (
    c.commentable_type = 'poll' 
    AND c.commentable_id = pc.poll_id 
    AND c.user_id = pc.user_id 
    AND c.comment = pc.comment 
    AND c.created_at = pc.created_at
  )
)
UPDATE comments 
SET parent_comment_id = cm_parent.new_id
FROM comment_mapping cm_child
JOIN comment_mapping cm_parent ON cm_parent.old_id = (
  SELECT parent_comment_id 
  FROM poll_comments 
  WHERE id = cm_child.old_id
)
WHERE comments.id = cm_child.new_id
AND comments.parent_comment_id IS NOT NULL;

-- =====================================================
-- 6. Drop problematic trigger and function if they exist
-- =====================================================
DROP TRIGGER IF EXISTS trigger_update_stats_on_comment_new ON comments;
DROP TRIGGER IF EXISTS trigger_update_stats_on_comment ON poll_comments;

-- Recreate the function to work with poll_stats table (not comments_count column)
CREATE OR REPLACE FUNCTION update_poll_stats_on_comment()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Handle both old poll_comments and new polymorphic comments
    IF TG_TABLE_NAME = 'poll_comments' THEN
      UPDATE poll_stats
      SET comments = comments + 1, updated_at = NOW()
      WHERE poll_id = NEW.poll_id;
    ELSIF TG_TABLE_NAME = 'comments' AND NEW.commentable_type = 'poll' THEN
      UPDATE poll_stats
      SET comments = comments + 1, updated_at = NOW()
      WHERE poll_id = NEW.commentable_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Handle deletions
    IF TG_TABLE_NAME = 'poll_comments' THEN
      UPDATE poll_stats
      SET comments = comments - 1, updated_at = NOW()
      WHERE poll_id = OLD.poll_id;
    ELSIF TG_TABLE_NAME = 'comments' AND OLD.commentable_type = 'poll' THEN
      UPDATE poll_stats
      SET comments = comments - 1, updated_at = NOW()
      WHERE poll_id = OLD.commentable_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for the new comments table
CREATE TRIGGER trigger_update_stats_on_comment_new
AFTER INSERT OR DELETE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_poll_stats_on_comment();

-- =====================================================
-- 7. Drop old trigger and table (commented out for safety)
-- =====================================================
-- DROP TRIGGER IF EXISTS trigger_update_stats_on_comment ON poll_comments;
-- DROP TABLE IF EXISTS poll_comments;

-- =====================================================
-- 8. Add table comments
-- =====================================================
COMMENT ON TABLE comments IS 'Polymorphic comments table supporting polls, context sources, and other entities';
COMMENT ON COLUMN comments.commentable_type IS 'Type of entity being commented on (poll, context_source, etc.)';
COMMENT ON COLUMN comments.commentable_id IS 'ID of the entity being commented on';

-- Migration: Add analytics and authoring permissions and extend user activities
-- This migration adds the necessary permissions for the new analytics and authoring features
-- and extends the user_activities table to support context sources (stories)

-- Add context_source_id column to user_activities table for story-related activities
ALTER TABLE user_activities 
ADD COLUMN IF NOT EXISTS context_source_id UUID REFERENCES context_sources(id) ON DELETE CASCADE;

-- Add index for the new column
CREATE INDEX IF NOT EXISTS idx_user_activities_context_source_id ON user_activities(context_source_id);

-- Add some sample permissions for analytics and authoring
INSERT INTO permissions (id, name, resource, action, description, created_at) 
VALUES 
    (gen_random_uuid(), 'analytics.view', 'analytics', 'view', 'View analytics and statistics', NOW()),
    (gen_random_uuid(), 'analytics.export', 'analytics', 'export', 'Export analytics data', NOW()),
    (gen_random_uuid(), 'authoring.create', 'authoring', 'create', 'Create single content using wizards', NOW()),
    (gen_random_uuid(), 'authoring.bulk_create', 'authoring', 'bulk_create', 'Create content in bulk (polls, stories)', NOW())
ON CONFLICT (name) DO NOTHING;

-- Create uploads directory structure (this would be handled by the application)
-- The application should ensure these directories exist:
-- uploads/authoring/ - for bulk creation file uploads

-- Note: Bulk creation activities will be logged using the existing comprehensive logging system
-- instead of a separate bulk_creation_logs table