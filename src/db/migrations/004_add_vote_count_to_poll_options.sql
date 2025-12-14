-- Migration: Add vote_count to poll_options for pre-computed analytics
-- This adds denormalized vote counts for efficient reads

-- Add vote_count column to poll_options
ALTER TABLE poll_options
ADD COLUMN vote_count INT DEFAULT 0 NOT NULL;

-- Create index on vote_count for sorting by popularity
CREATE INDEX idx_poll_options_vote_count ON poll_options(poll_id, vote_count DESC);

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
