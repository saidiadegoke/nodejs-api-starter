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
