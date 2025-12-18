-- =====================================================
-- 1. Create new polymorphic comments table
-- =====================================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Polymorphic relationship
  commentable_type VARCHAR(50) NOT NULL, -- 'poll', 'context_source', etc.
  commentable_id UUID NOT NULL,          -- ID of the related entity
  
  -- User and content
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- For nested replies
  
  -- Comment content
  comment TEXT NOT NULL,
  
  -- Moderation
  is_flagged BOOLEAN DEFAULT FALSE,
  is_hidden BOOLEAN DEFAULT FALSE,
  flagged_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- =====================================================
-- FIX COMMENT TRIGGER FUNCTION
-- Fixes the update_poll_stats_on_comment function to use correct column name
-- =====================================================

-- Drop the problematic trigger and function
DROP TRIGGER IF EXISTS trigger_update_stats_on_comment_new ON comments;
DROP TRIGGER IF EXISTS trigger_update_stats_on_comment ON poll_comments;
DROP FUNCTION IF EXISTS update_poll_stats_on_comment();

-- Recreate the function with correct column references
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

-- Recreate triggers
CREATE TRIGGER trigger_update_stats_on_comment
AFTER INSERT OR DELETE ON poll_comments
FOR EACH ROW
EXECUTE FUNCTION update_poll_stats_on_comment();

CREATE TRIGGER trigger_update_stats_on_comment_new
AFTER INSERT OR DELETE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_poll_stats_on_comment();