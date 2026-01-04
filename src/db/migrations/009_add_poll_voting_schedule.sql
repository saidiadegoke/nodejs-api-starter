-- =====================================================
-- Migration: Add Poll Voting Schedule & Frequency Controls
-- Description: Adds fields to control when and how often users can vote on polls
-- =====================================================

-- Add new columns to polls table for voting schedule and frequency controls
ALTER TABLE polls
  -- Voting Time Period Controls (absolute date/time windows)
  -- Note: voting_starts_at/voting_ends_at work together with existing expires_at
  -- - voting_starts_at: When voting opens (defaults to created_at if null)
  -- - voting_ends_at: When voting closes (defaults to expires_at if null)
  -- - expires_at: When poll expires/closes entirely (existing field)
  ADD COLUMN voting_starts_at TIMESTAMP,                    -- When voting period begins (null = use created_at)
  ADD COLUMN voting_ends_at TIMESTAMP,                      -- When voting period ends (null = use expires_at)

  -- Voting Time Restrictions (daily recurring windows)
  ADD COLUMN voting_days_of_week INTEGER[] DEFAULT ARRAY[0,1,2,3,4,5,6], -- Allowed days [0=Sunday to 6=Saturday], default = all days
  ADD COLUMN voting_time_start TIME DEFAULT '00:00:00',    -- Daily start time, default = midnight
  ADD COLUMN voting_time_end TIME DEFAULT '23:59:59',      -- Daily end time, default = end of day

  -- Vote Frequency Controls
  ADD COLUMN allow_revote BOOLEAN DEFAULT false,            -- Whether users can change their vote or vote multiple times
  ADD COLUMN vote_frequency_type VARCHAR(20) DEFAULT 'once', -- once, unlimited, hourly, daily, weekly, monthly
  ADD COLUMN vote_frequency_value INTEGER DEFAULT 1;       -- Number of votes allowed per frequency period

-- Add comments to document the new fields
COMMENT ON COLUMN polls.voting_starts_at IS 'Absolute start time for voting window (null = use created_at). Works with voting_ends_at to define overall voting period.';
COMMENT ON COLUMN polls.voting_ends_at IS 'Absolute end time for voting window (null = use expires_at). Voting closes at this time.';
COMMENT ON COLUMN polls.voting_days_of_week IS 'Array of allowed weekdays [0=Sunday to 6=Saturday]. Default [0,1,2,3,4,5,6] = all days. Use for recurring weekly restrictions.';
COMMENT ON COLUMN polls.voting_time_start IS 'Daily time when voting opens. Default 00:00:00 = midnight. Applies every day within voting window.';
COMMENT ON COLUMN polls.voting_time_end IS 'Daily time when voting closes. Default 23:59:59 = end of day. Applies every day within voting window.';
COMMENT ON COLUMN polls.allow_revote IS 'Whether users can change their vote (true) or vote is permanent (false). Default true for flexibility.';
COMMENT ON COLUMN polls.vote_frequency_type IS 'Frequency limit type: once, unlimited, hourly, daily, weekly, monthly. Default "once" = vote only once.';
COMMENT ON COLUMN polls.vote_frequency_value IS 'Number of votes allowed within frequency period (e.g., 3 for "3 times per week"). Default 1.';

-- Add indexes for efficient querying of voting windows
CREATE INDEX idx_polls_voting_starts_at ON polls(voting_starts_at) WHERE voting_starts_at IS NOT NULL;
CREATE INDEX idx_polls_voting_ends_at ON polls(voting_ends_at) WHERE voting_ends_at IS NOT NULL;
CREATE INDEX idx_polls_active_voting ON polls(voting_starts_at, voting_ends_at)
  WHERE status = 'active' AND voting_starts_at IS NOT NULL;

-- =====================================================
-- Create user_vote_history table for tracking vote frequency
-- =====================================================
-- This table records each time a user votes, enabling frequency limit enforcement

CREATE TABLE user_vote_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_id UUID REFERENCES poll_responses(id) ON DELETE CASCADE, -- Link to actual response
  voted_at TIMESTAMP DEFAULT NOW(),

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient frequency checking
CREATE INDEX idx_user_vote_history_poll_user ON user_vote_history(poll_id, user_id);
CREATE INDEX idx_user_vote_history_user_voted_at ON user_vote_history(user_id, voted_at DESC);
CREATE INDEX idx_user_vote_history_poll_voted_at ON user_vote_history(poll_id, voted_at DESC);

-- Composite index for frequency queries (most common query pattern)
CREATE INDEX idx_user_vote_history_frequency_check ON user_vote_history(poll_id, user_id, voted_at DESC);

COMMENT ON TABLE user_vote_history IS 'Tracks voting history for enforcing frequency limits and analytics';
COMMENT ON COLUMN user_vote_history.response_id IS 'Reference to the actual poll response (can be null if response is deleted)';

-- =====================================================
-- Create function to automatically log votes to history
-- =====================================================

CREATE OR REPLACE FUNCTION log_vote_to_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if the poll has frequency restrictions
  IF EXISTS (
    SELECT 1 FROM polls
    WHERE id = NEW.poll_id
    AND (vote_frequency_type != 'once' OR vote_frequency_type IS NOT NULL)
  ) THEN
    INSERT INTO user_vote_history (poll_id, user_id, response_id, voted_at)
    VALUES (NEW.poll_id, NEW.user_id, NEW.id, NEW.created_at);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically log votes
CREATE TRIGGER trigger_log_vote_history
  AFTER INSERT ON poll_responses
  FOR EACH ROW
  EXECUTE FUNCTION log_vote_to_history();

COMMENT ON FUNCTION log_vote_to_history() IS 'Automatically logs votes to history table for frequency tracking';

-- =====================================================
-- Helper function to check if user can vote based on schedule
-- =====================================================

CREATE OR REPLACE FUNCTION can_vote_on_poll(
  p_poll_id UUID,
  p_user_id UUID,
  p_check_time TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE(
  can_vote BOOLEAN,
  reason TEXT,
  next_available_at TIMESTAMP
) AS $$
DECLARE
  v_poll RECORD;
  v_current_day INTEGER;
  v_current_time TIME;
  v_vote_count INTEGER;
  v_period_start TIMESTAMP;
BEGIN
  -- Get poll details
  SELECT * INTO v_poll FROM polls WHERE id = p_poll_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Poll not found'::TEXT, NULL::TIMESTAMP;
    RETURN;
  END IF;

  -- Check if poll is active
  IF v_poll.status != 'active' THEN
    RETURN QUERY SELECT false, 'Poll is not active'::TEXT, NULL::TIMESTAMP;
    RETURN;
  END IF;

  -- Check absolute voting period
  -- voting_starts_at: If null, use created_at (poll opens when created)
  -- voting_ends_at: If null, use expires_at (poll closes when it expires)

  -- Check if voting has started (use voting_starts_at or created_at)
  IF COALESCE(v_poll.voting_starts_at, v_poll.created_at) > p_check_time THEN
    RETURN QUERY SELECT false, 'Voting has not started yet'::TEXT, COALESCE(v_poll.voting_starts_at, v_poll.created_at);
    RETURN;
  END IF;

  -- Check if voting has ended (use voting_ends_at or expires_at)
  IF COALESCE(v_poll.voting_ends_at, v_poll.expires_at) IS NOT NULL
     AND p_check_time > COALESCE(v_poll.voting_ends_at, v_poll.expires_at) THEN
    RETURN QUERY SELECT false, 'Voting period has ended'::TEXT, NULL::TIMESTAMP;
    RETURN;
  END IF;

  -- Check day of week restrictions
  IF v_poll.voting_days_of_week IS NOT NULL AND array_length(v_poll.voting_days_of_week, 1) > 0 THEN
    v_current_day := EXTRACT(DOW FROM p_check_time); -- 0-6

    IF NOT (v_current_day = ANY(v_poll.voting_days_of_week)) THEN
      RETURN QUERY SELECT false, 'Voting not allowed on this day of week'::TEXT, NULL::TIMESTAMP;
      RETURN;
    END IF;
  END IF;

  -- Check time of day restrictions
  IF v_poll.voting_time_start IS NOT NULL AND v_poll.voting_time_end IS NOT NULL THEN
    v_current_time := p_check_time::TIME;

    IF v_current_time < v_poll.voting_time_start OR v_current_time > v_poll.voting_time_end THEN
      RETURN QUERY SELECT false, 'Voting not allowed at this time of day'::TEXT, NULL::TIMESTAMP;
      RETURN;
    END IF;
  END IF;

  -- Check frequency limits
  IF v_poll.vote_frequency_type = 'once' THEN
    -- Check if user has already voted
    IF EXISTS (SELECT 1 FROM poll_responses WHERE poll_id = p_poll_id AND user_id = p_user_id) THEN
      RETURN QUERY SELECT false, 'You have already voted on this poll'::TEXT, NULL::TIMESTAMP;
      RETURN;
    END IF;
  ELSIF v_poll.vote_frequency_type = 'unlimited' THEN
    -- No frequency restriction
    NULL;
  ELSIF v_poll.vote_frequency_type IN ('hourly', 'daily', 'weekly', 'monthly') THEN
    -- Calculate period start based on frequency type
    CASE v_poll.vote_frequency_type
      WHEN 'hourly' THEN
        v_period_start := p_check_time - INTERVAL '1 hour';
      WHEN 'daily' THEN
        v_period_start := p_check_time - INTERVAL '1 day';
      WHEN 'weekly' THEN
        v_period_start := p_check_time - INTERVAL '1 week';
      WHEN 'monthly' THEN
        v_period_start := p_check_time - INTERVAL '1 month';
    END CASE;

    -- Count votes in this period
    SELECT COUNT(*) INTO v_vote_count
    FROM user_vote_history
    WHERE poll_id = p_poll_id
      AND user_id = p_user_id
      AND voted_at >= v_period_start;

    IF v_vote_count >= v_poll.vote_frequency_value THEN
      RETURN QUERY SELECT
        false,
        format('Vote limit reached: %s/%s votes per %s', v_vote_count, v_poll.vote_frequency_value, v_poll.vote_frequency_type)::TEXT,
        NULL::TIMESTAMP;
      RETURN;
    END IF;
  END IF;

  -- All checks passed
  RETURN QUERY SELECT true, 'You can vote on this poll'::TEXT, NULL::TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION can_vote_on_poll(UUID, UUID, TIMESTAMP) IS 'Checks if a user can vote on a poll based on all schedule and frequency restrictions';

-- =====================================================
-- Add check constraints for data integrity
-- =====================================================

-- Ensure voting_ends_at is after voting_starts_at (when both are set)
ALTER TABLE polls
  ADD CONSTRAINT check_voting_period
  CHECK (voting_starts_at IS NULL OR voting_ends_at IS NULL OR voting_ends_at > voting_starts_at);

-- Ensure voting_ends_at doesn't exceed expires_at (if expires_at is set)
-- Note: It's OK for voting to end before poll expires (e.g., early voting cutoff)
ALTER TABLE polls
  ADD CONSTRAINT check_voting_ends_before_expires
  CHECK (voting_ends_at IS NULL OR expires_at IS NULL OR voting_ends_at <= expires_at);

-- Ensure voting_time_end is after voting_time_start
ALTER TABLE polls
  ADD CONSTRAINT check_voting_time_range
  CHECK (voting_time_start IS NULL OR voting_time_end IS NULL OR voting_time_end > voting_time_start);

-- Ensure vote_frequency_value is positive
ALTER TABLE polls
  ADD CONSTRAINT check_vote_frequency_value
  CHECK (vote_frequency_value > 0);

-- Ensure vote_frequency_type is valid
ALTER TABLE polls
  ADD CONSTRAINT check_vote_frequency_type
  CHECK (vote_frequency_type IN ('once', 'unlimited', 'hourly', 'daily', 'weekly', 'monthly'));

-- Ensure voting_days_of_week contains valid days (0-6)
ALTER TABLE polls
  ADD CONSTRAINT check_voting_days_of_week
  CHECK (
    voting_days_of_week IS NULL OR
    (
      voting_days_of_week <@ ARRAY[0,1,2,3,4,5,6] AND
      array_length(voting_days_of_week, 1) > 0
    )
  );

-- =====================================================
-- Update existing polls with default values
-- =====================================================
-- This ensures backward compatibility

-- All existing polls get the default behavior (vote once, anytime)
UPDATE polls
SET
  allow_revote = true,
  vote_frequency_type = 'once',
  vote_frequency_value = 1
WHERE
  allow_revote IS NULL OR
  vote_frequency_type IS NULL OR
  vote_frequency_value IS NULL;

-- =====================================================
-- Create view for active voting windows
-- =====================================================
-- Useful for queries that need to check current voting availability

CREATE OR REPLACE VIEW active_voting_polls AS
SELECT
  p.*,
  CASE
    WHEN p.voting_starts_at IS NOT NULL AND NOW() < p.voting_starts_at THEN 'upcoming'
    WHEN p.voting_ends_at IS NOT NULL AND NOW() > p.voting_ends_at THEN 'ended'
    WHEN p.status = 'active' THEN 'open'
    ELSE 'closed'
  END AS voting_status,
  EXTRACT(DOW FROM NOW()) AS current_day_of_week,
  NOW()::TIME AS current_time_of_day
FROM polls p
WHERE p.status = 'active' AND p.deleted_at IS NULL;

COMMENT ON VIEW active_voting_polls IS 'View showing all active polls with their current voting status';
