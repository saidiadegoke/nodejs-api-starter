-- =====================================================
-- POLL CONTEXT / EVIDENCE LAYER MIGRATION
-- Adds research, evidence, and context support to polls
-- Enables structured, reusable, versionable context
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CONTEXT SOURCES (Canonical Truth)
-- =====================================================
-- Represents source of truth (research, articles, reports, datasets)
CREATE TABLE context_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Source Type
  source_type VARCHAR(50) NOT NULL,
  -- research, news_article, blog_post, whitepaper, dataset, report, story, study, survey

  -- Core Information
  title TEXT NOT NULL,
  summary TEXT,
  author TEXT,
  publisher TEXT,
  source_url TEXT,
  publication_date DATE,

  -- Credibility & Classification
  credibility_score FLOAT CHECK (credibility_score >= 0 AND credibility_score <= 10),
  tags TEXT[],

  -- Metadata
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Indexes for context_sources
CREATE INDEX idx_context_sources_type ON context_sources(source_type);
CREATE INDEX idx_context_sources_created_by ON context_sources(created_by);
CREATE INDEX idx_context_sources_publication_date ON context_sources(publication_date DESC);
CREATE INDEX idx_context_sources_tags ON context_sources USING GIN(tags);
CREATE INDEX idx_context_sources_credibility ON context_sources(credibility_score DESC) WHERE credibility_score IS NOT NULL;

-- =====================================================
-- 2. CONTEXT BLOCKS (How It's Displayed)
-- =====================================================
-- Rich storytelling blocks for context presentation
CREATE TABLE context_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES context_sources(id) ON DELETE CASCADE,

  -- Block Type
  block_type VARCHAR(50) NOT NULL,
  -- text, quote, image, chart, video, dataset_preview, statistic, key_finding, methodology

  -- Content
  content TEXT,           -- Markdown/HTML for text content
  media_url TEXT,         -- URL for images, videos, datasets
  citation TEXT,          -- Inline citation text
  order_index INT NOT NULL DEFAULT 0,

  -- Display Configuration
  display_config JSONB DEFAULT '{}',
  -- e.g., { "highlight": true, "collapsible": false, "theme": "emphasis" }

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for context_blocks
CREATE INDEX idx_context_blocks_source_id ON context_blocks(source_id);
CREATE INDEX idx_context_blocks_order ON context_blocks(source_id, order_index);
CREATE INDEX idx_context_blocks_type ON context_blocks(block_type);

-- =====================================================
-- 3. POLL ↔ CONTEXT MAPPING
-- =====================================================
-- Links polls to context sources with display configuration
CREATE TABLE poll_contexts (
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES context_sources(id) ON DELETE CASCADE,

  -- Display Configuration
  display_position VARCHAR(20) NOT NULL DEFAULT 'pre_poll',
  -- pre_poll, inline, post_poll, on_demand

  is_required BOOLEAN DEFAULT FALSE,
  -- Must read before voting?

  order_index INT DEFAULT 0,
  -- Order when multiple contexts exist

  created_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY (poll_id, source_id)
);

-- Indexes for poll_contexts
CREATE INDEX idx_poll_contexts_poll_id ON poll_contexts(poll_id);
CREATE INDEX idx_poll_contexts_source_id ON poll_contexts(source_id);
CREATE INDEX idx_poll_contexts_required ON poll_contexts(poll_id) WHERE is_required = TRUE;

-- =====================================================
-- 4. CONTEXT ENGAGEMENT ANALYTICS
-- =====================================================
-- Track how users engage with context
CREATE TABLE context_engagements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES context_sources(id) ON DELETE CASCADE,
  poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Engagement Type
  engagement_type VARCHAR(30) NOT NULL,
  -- view, scroll_complete, click_source, expand, download, share

  -- Metrics
  duration_seconds INT,
  scroll_percentage INT CHECK (scroll_percentage >= 0 AND scroll_percentage <= 100),

  -- Context
  metadata JSONB DEFAULT '{}',
  -- e.g., { "device": "mobile", "referrer": "twitter" }

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for context_engagements
CREATE INDEX idx_context_engagements_source_id ON context_engagements(source_id);
CREATE INDEX idx_context_engagements_poll_id ON context_engagements(poll_id);
CREATE INDEX idx_context_engagements_user_id ON context_engagements(user_id);
CREATE INDEX idx_context_engagements_type ON context_engagements(engagement_type);
CREATE INDEX idx_context_engagements_created_at ON context_engagements(created_at DESC);

-- =====================================================
-- 5. CONTEXT VERSIONS (Optional but Powerful)
-- =====================================================
-- Track updates to context sources for audit trails
CREATE TABLE context_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES context_sources(id) ON DELETE CASCADE,

  version_number INT NOT NULL,
  content_snapshot JSONB NOT NULL,
  -- Full snapshot of the source at this version

  content_hash TEXT NOT NULL,
  -- SHA-256 hash for integrity verification

  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  change_notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(source_id, version_number)
);

-- Indexes for context_versions
CREATE INDEX idx_context_versions_source_id ON context_versions(source_id);
CREATE INDEX idx_context_versions_created_at ON context_versions(created_at DESC);

-- =====================================================
-- 6. AI SUMMARIES (For Fast Consumption)
-- =====================================================
-- AI-generated summaries for different audiences
CREATE TABLE context_ai_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES context_sources(id) ON DELETE CASCADE,

  summary_type VARCHAR(30) NOT NULL,
  -- tldr, neutral, opposing_view, youth_friendly, expert_level, eli5

  content TEXT NOT NULL,

  -- Generation Metadata
  model_version TEXT,
  generated_at TIMESTAMP DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  is_approved BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(source_id, summary_type)
);

-- Indexes for context_ai_summaries
CREATE INDEX idx_context_ai_summaries_source_id ON context_ai_summaries(source_id);
CREATE INDEX idx_context_ai_summaries_type ON context_ai_summaries(summary_type);
CREATE INDEX idx_context_ai_summaries_approved ON context_ai_summaries(source_id) WHERE is_approved = TRUE;

-- =====================================================
-- 7. USER CONTEXT READING REQUIREMENTS
-- =====================================================
-- Track required context completion for voting
CREATE TABLE user_context_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES context_sources(id) ON DELETE CASCADE,

  completed_at TIMESTAMP DEFAULT NOW(),
  completion_percentage INT DEFAULT 100,

  UNIQUE(user_id, poll_id, source_id)
);

-- Indexes for user_context_completions
CREATE INDEX idx_user_context_completions_user_poll ON user_context_completions(user_id, poll_id);
CREATE INDEX idx_user_context_completions_poll ON user_context_completions(poll_id);

-- =====================================================
-- TRIGGERS FOR CONTEXT VERSIONS
-- =====================================================

-- Function to create version snapshot on context source update
CREATE OR REPLACE FUNCTION create_context_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INT;
  content_json JSONB;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version
  FROM context_versions
  WHERE source_id = NEW.id;

  -- Create content snapshot
  content_json := jsonb_build_object(
    'title', NEW.title,
    'summary', NEW.summary,
    'author', NEW.author,
    'publisher', NEW.publisher,
    'source_url', NEW.source_url,
    'publication_date', NEW.publication_date,
    'credibility_score', NEW.credibility_score,
    'tags', NEW.tags
  );

  -- Insert version record
  INSERT INTO context_versions (
    source_id,
    version_number,
    content_snapshot,
    content_hash,
    changed_by
  ) VALUES (
    NEW.id,
    next_version,
    content_json,
    md5(content_json::text),
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on context source updates
CREATE TRIGGER trigger_version_context_source
AFTER UPDATE ON context_sources
FOR EACH ROW
WHEN (OLD.title IS DISTINCT FROM NEW.title
   OR OLD.summary IS DISTINCT FROM NEW.summary
   OR OLD.source_url IS DISTINCT FROM NEW.source_url)
EXECUTE FUNCTION create_context_version();

-- =====================================================
-- VIEWS FOR ANALYTICS
-- =====================================================

-- View: Context engagement summary by source
CREATE VIEW context_engagement_summary AS
SELECT
  cs.id as source_id,
  cs.title as source_title,
  cs.source_type,
  COUNT(DISTINCT ce.user_id) as unique_viewers,
  COUNT(*) as total_engagements,
  AVG(ce.duration_seconds) as avg_duration_seconds,
  AVG(ce.scroll_percentage) as avg_scroll_percentage,
  COUNT(CASE WHEN ce.engagement_type = 'scroll_complete' THEN 1 END) as complete_reads,
  COUNT(CASE WHEN ce.engagement_type = 'click_source' THEN 1 END) as source_clicks
FROM context_sources cs
LEFT JOIN context_engagements ce ON cs.id = ce.source_id
GROUP BY cs.id, cs.title, cs.source_type;

-- View: Poll context effectiveness
CREATE VIEW poll_context_effectiveness AS
SELECT
  p.id as poll_id,
  p.question as poll_question,
  COUNT(DISTINCT pc.source_id) as context_count,
  COUNT(DISTINCT ce.user_id) as context_readers,
  COUNT(DISTINCT pr.user_id) as total_voters,
  CASE
    WHEN COUNT(DISTINCT pr.user_id) > 0
    THEN CAST(ROUND(CAST((COUNT(DISTINCT ce.user_id)::FLOAT / COUNT(DISTINCT pr.user_id)) * 100 AS NUMERIC), 2) AS FLOAT)
    ELSE 0
  END as context_read_percentage
FROM polls p
LEFT JOIN poll_contexts pc ON p.id = pc.poll_id
LEFT JOIN context_engagements ce ON pc.source_id = ce.source_id AND pc.poll_id = ce.poll_id
LEFT JOIN poll_responses pr ON p.id = pr.poll_id
GROUP BY p.id, p.question;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE context_sources IS 'Canonical sources of truth for poll context (research, articles, reports)';
COMMENT ON TABLE context_blocks IS 'Rich presentation blocks for displaying context';
COMMENT ON TABLE poll_contexts IS 'Links polls to context sources with display configuration';
COMMENT ON TABLE context_engagements IS 'Analytics for tracking user engagement with context';
COMMENT ON TABLE context_versions IS 'Version history for context sources (audit trail)';
COMMENT ON TABLE context_ai_summaries IS 'AI-generated summaries for different audiences';
COMMENT ON TABLE user_context_completions IS 'Tracks required context completion for voting';

COMMENT ON VIEW context_engagement_summary IS 'Summary analytics for context source engagement';
COMMENT ON VIEW poll_context_effectiveness IS 'Effectiveness metrics for poll context (read vs vote rates)';

-- Migration: Add vote_count to poll_options for pre-computed analytics
-- This adds denormalized vote counts for efficient reads

-- Add vote_count column to poll_options
ALTER TABLE poll_options
ADD COLUMN IF NOT EXISTS vote_count INT DEFAULT 0 NOT NULL;

-- Create index on vote_count for sorting by popularity
CREATE INDEX IF NOT EXISTS idx_poll_options_vote_count ON poll_options(poll_id, vote_count DESC);

-- Function to update poll option vote counts
CREATE OR REPLACE FUNCTION update_option_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INSERT
  IF (TG_OP = 'INSERT') THEN
    IF NEW.option_id IS NOT NULL THEN
      UPDATE poll_options
      SET vote_count = vote_count + 1
      WHERE id = NEW.option_id;
    END IF;

    -- Handle option_ids array (for multi-select polls)
    IF NEW.option_ids IS NOT NULL THEN
      UPDATE poll_options
      SET vote_count = vote_count + 1
      WHERE id = ANY(NEW.option_ids);
    END IF;

    RETURN NEW;
  END IF;

  -- Handle UPDATE (when user changes their vote)
  IF (TG_OP = 'UPDATE') THEN
    -- Decrement old option
    IF OLD.option_id IS NOT NULL AND OLD.option_id != NEW.option_id THEN
      UPDATE poll_options
      SET vote_count = GREATEST(0, vote_count - 1)
      WHERE id = OLD.option_id;
    END IF;

    -- Increment new option
    IF NEW.option_id IS NOT NULL AND OLD.option_id != NEW.option_id THEN
      UPDATE poll_options
      SET vote_count = vote_count + 1
      WHERE id = NEW.option_id;
    END IF;

    -- Handle option_ids array changes
    IF OLD.option_ids IS NOT NULL THEN
      UPDATE poll_options
      SET vote_count = GREATEST(0, vote_count - 1)
      WHERE id = ANY(OLD.option_ids)
        AND NOT (id = ANY(COALESCE(NEW.option_ids, ARRAY[]::UUID[])));
    END IF;

    IF NEW.option_ids IS NOT NULL THEN
      UPDATE poll_options
      SET vote_count = vote_count + 1
      WHERE id = ANY(NEW.option_ids)
        AND NOT (id = ANY(COALESCE(OLD.option_ids, ARRAY[]::UUID[])));
    END IF;

    RETURN NEW;
  END IF;

  -- Handle DELETE
  IF (TG_OP = 'DELETE') THEN
    IF OLD.option_id IS NOT NULL THEN
      UPDATE poll_options
      SET vote_count = GREATEST(0, vote_count - 1)
      WHERE id = OLD.option_id;
    END IF;

    IF OLD.option_ids IS NOT NULL THEN
      UPDATE poll_options
      SET vote_count = GREATEST(0, vote_count - 1)
      WHERE id = ANY(OLD.option_ids);
    END IF;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_option_vote_count ON poll_responses;

-- Create trigger to update option vote counts
CREATE TRIGGER trigger_update_option_vote_count
AFTER INSERT OR UPDATE OR DELETE ON poll_responses
FOR EACH ROW
EXECUTE FUNCTION update_option_vote_count();

-- Initialize vote counts for existing options
UPDATE poll_options po
SET vote_count = (
  SELECT COUNT(*)
  FROM poll_responses pr
  WHERE pr.option_id = po.id
);

-- Handle multi-select polls (option_ids array)
UPDATE poll_options po
SET vote_count = vote_count + (
  SELECT COUNT(*)
  FROM poll_responses pr
  WHERE po.id = ANY(pr.option_ids)
);

-- Add comment
COMMENT ON COLUMN poll_options.vote_count IS 'Denormalized vote count for efficient reads, automatically updated by triggers';

-- Migration: Create notifications table
-- Description: Table for storing user notifications (likes, comments, follows, etc.)

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'like', 'comment', 'bookmark', 'repost', 'follow', 'response', 'mention'
  actor_id UUID REFERENCES users(id) ON DELETE CASCADE, -- User who triggered the notification
  poll_id UUID REFERENCES polls(id) ON DELETE CASCADE, -- Related poll (if applicable)
  comment_id UUID, -- Related comment (if applicable)
  message TEXT, -- Notification message/content
  metadata JSONB, -- Additional data
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS update_notifications_timestamp ON notifications;

CREATE TRIGGER update_notifications_timestamp
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION update_notifications_updated_at();

-- Comments
COMMENT ON TABLE notifications IS 'User notifications for various activities';
COMMENT ON COLUMN notifications.type IS 'Type of notification: like, comment, bookmark, repost, follow, response, mention';
COMMENT ON COLUMN notifications.actor_id IS 'User who performed the action that triggered the notification';
COMMENT ON COLUMN notifications.poll_id IS 'Related poll ID (if notification is poll-related)';
COMMENT ON COLUMN notifications.comment_id IS 'Related comment ID (if notification is comment-related)';
COMMENT ON COLUMN notifications.metadata IS 'Additional notification data in JSON format';
