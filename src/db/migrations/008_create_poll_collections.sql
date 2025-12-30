-- Migration: Create Poll Collections Tables
-- Description: Tables for grouping multiple polls together for sharing as a wizard

-- Poll Collections Table
CREATE TABLE IF NOT EXISTS poll_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  slug VARCHAR(255) UNIQUE NOT NULL,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Indexes for poll_collections
CREATE INDEX idx_poll_collections_slug ON poll_collections(slug);
CREATE INDEX idx_poll_collections_user_id ON poll_collections(user_id);
CREATE INDEX idx_poll_collections_deleted_at ON poll_collections(deleted_at);

-- Poll Collection Items (Links polls to collections with ordering)
CREATE TABLE IF NOT EXISTS poll_collection_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES poll_collections(id) ON DELETE CASCADE,
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(collection_id, poll_id)
);

-- Indexes for poll_collection_items
CREATE INDEX idx_poll_collection_items_collection_id ON poll_collection_items(collection_id);
CREATE INDEX idx_poll_collection_items_poll_id ON poll_collection_items(poll_id);

-- Updated at trigger for poll_collections
CREATE OR REPLACE FUNCTION update_poll_collections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER poll_collections_updated_at
BEFORE UPDATE ON poll_collections
FOR EACH ROW
EXECUTE FUNCTION update_poll_collections_updated_at();

-- Comments
COMMENT ON TABLE poll_collections IS 'Collections of polls that can be shared together as a wizard';
COMMENT ON TABLE poll_collection_items IS 'Links polls to collections with ordering for wizard steps';
COMMENT ON COLUMN poll_collections.slug IS 'URL-friendly identifier for sharing (e.g., climate-polls-abc123)';
COMMENT ON COLUMN poll_collection_items.order_index IS 'Order of poll in wizard (0-based)';
