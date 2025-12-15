-- ============================================================================
-- FILE ASSOCIATIONS MIGRATION
-- Add proper file associations for profile photos and poll images
-- ============================================================================

-- ============================================================================
-- 1. UPDATE USERS/PROFILES TABLE FOR PROFILE PHOTOS
-- ============================================================================

-- Add profile_photo_id column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS profile_photo_id UUID REFERENCES files(id) ON DELETE SET NULL;

-- Create index for profile photo lookups
CREATE INDEX IF NOT EXISTS idx_profiles_profile_photo_id ON profiles(profile_photo_id);

-- Update existing profile_photo_url entries to use file IDs if they exist
-- This is a data migration that would need to be run carefully in production
-- For now, we'll just add the column and leave existing URLs as-is

-- ============================================================================
-- 2. CREATE POLL IMAGES JUNCTION TABLE
-- ============================================================================

-- Junction table for poll images (many-to-many relationship)
CREATE TABLE IF NOT EXISTS poll_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  
  -- Image metadata for polls
  display_order INTEGER NOT NULL DEFAULT 0,
  image_role VARCHAR(50), -- 'option_a', 'option_b', 'background', 'cover', etc.
  caption TEXT, -- Optional caption for the image
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure unique file per poll per role
  UNIQUE(poll_id, file_id, image_role)
);

-- Indexes for poll_images
CREATE INDEX IF NOT EXISTS idx_poll_images_poll_id ON poll_images(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_images_file_id ON poll_images(file_id);
CREATE INDEX IF NOT EXISTS idx_poll_images_role ON poll_images(image_role);
CREATE INDEX IF NOT EXISTS idx_poll_images_display_order ON poll_images(poll_id, display_order);

-- ============================================================================
-- 3. UPDATE FILES TABLE FOR BETTER ORGANIZATION
-- ============================================================================

-- Add additional fields to files table for better organization
ALTER TABLE files 
ADD COLUMN IF NOT EXISTS width INTEGER,
ADD COLUMN IF NOT EXISTS height INTEGER,
ADD COLUMN IF NOT EXISTS thumbnail_s3_key VARCHAR(500),
ADD COLUMN IF NOT EXISTS optimized_s3_key VARCHAR(500),
ADD COLUMN IF NOT EXISTS upload_ip INET,
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_dimensions ON files(width, height) WHERE width IS NOT NULL AND height IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_usage_count ON files(usage_count);

-- ============================================================================
-- 4. UPDATE POLL OPTIONS TABLE FOR IMAGE REFERENCES
-- ============================================================================

-- Add file_id column to poll_options for image-based polls
ALTER TABLE poll_options 
ADD COLUMN IF NOT EXISTS file_id UUID REFERENCES files(id) ON DELETE SET NULL;

-- Create index for file lookups in poll options
CREATE INDEX IF NOT EXISTS idx_poll_options_file_id ON poll_options(file_id);

-- ============================================================================
-- 5. CREATE FUNCTIONS FOR FILE USAGE TRACKING
-- ============================================================================

-- Function to increment file usage count
CREATE OR REPLACE FUNCTION increment_file_usage(file_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE files 
  SET usage_count = usage_count + 1,
      updated_at = NOW()
  WHERE id = file_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to decrement file usage count
CREATE OR REPLACE FUNCTION decrement_file_usage(file_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE files 
  SET usage_count = GREATEST(usage_count - 1, 0),
      updated_at = NOW()
  WHERE id = file_uuid;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. CREATE TRIGGERS FOR AUTOMATIC USAGE TRACKING
-- ============================================================================

-- Trigger function to update file usage when poll images are added/removed
CREATE OR REPLACE FUNCTION update_file_usage_on_poll_image()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM increment_file_usage(NEW.file_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM decrement_file_usage(OLD.file_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for poll_images
DROP TRIGGER IF EXISTS trigger_poll_images_usage_insert ON poll_images;
CREATE TRIGGER trigger_poll_images_usage_insert
  AFTER INSERT ON poll_images
  FOR EACH ROW
  EXECUTE FUNCTION update_file_usage_on_poll_image();

DROP TRIGGER IF EXISTS trigger_poll_images_usage_delete ON poll_images;
CREATE TRIGGER trigger_poll_images_usage_delete
  AFTER DELETE ON poll_images
  FOR EACH ROW
  EXECUTE FUNCTION update_file_usage_on_poll_image();

-- Trigger function to update file usage when profile photos are changed
CREATE OR REPLACE FUNCTION update_file_usage_on_profile_photo()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle INSERT (new profile)
  IF TG_OP = 'INSERT' AND NEW.profile_photo_id IS NOT NULL THEN
    PERFORM increment_file_usage(NEW.profile_photo_id);
    RETURN NEW;
  END IF;
  
  -- Handle UPDATE (profile photo changed)
  IF TG_OP = 'UPDATE' THEN
    -- Decrement old file usage
    IF OLD.profile_photo_id IS NOT NULL AND (NEW.profile_photo_id IS NULL OR OLD.profile_photo_id != NEW.profile_photo_id) THEN
      PERFORM decrement_file_usage(OLD.profile_photo_id);
    END IF;
    
    -- Increment new file usage
    IF NEW.profile_photo_id IS NOT NULL AND (OLD.profile_photo_id IS NULL OR OLD.profile_photo_id != NEW.profile_photo_id) THEN
      PERFORM increment_file_usage(NEW.profile_photo_id);
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Handle DELETE (profile deleted)
  IF TG_OP = 'DELETE' AND OLD.profile_photo_id IS NOT NULL THEN
    PERFORM decrement_file_usage(OLD.profile_photo_id);
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for profiles
DROP TRIGGER IF EXISTS trigger_profiles_photo_usage ON profiles;
CREATE TRIGGER trigger_profiles_photo_usage
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_file_usage_on_profile_photo();

-- ============================================================================
-- 7. CREATE VIEWS FOR EASIER QUERYING
-- ============================================================================

-- View for polls with their images
CREATE OR REPLACE VIEW poll_with_images AS
SELECT 
  p.*,
  COALESCE(
    json_agg(
      json_build_object(
        'id', pi.id,
        'file_id', pi.file_id,
        'file_url', f.file_url,
        'display_order', pi.display_order,
        'image_role', pi.image_role,
        'caption', pi.caption,
        'width', f.width,
        'height', f.height
      ) ORDER BY pi.display_order
    ) FILTER (WHERE pi.id IS NOT NULL),
    '[]'::json
  ) as images
FROM polls p
LEFT JOIN poll_images pi ON p.id = pi.poll_id
LEFT JOIN files f ON pi.file_id = f.id AND f.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id;

-- View for users with profile photos
CREATE OR REPLACE VIEW users_with_profiles AS
SELECT 
  u.*,
  p.first_name,
  p.last_name,
  p.display_name,
  p.bio,
  p.profile_photo_url,
  p.profile_photo_id,
  f.file_url as profile_photo_file_url,
  f.width as profile_photo_width,
  f.height as profile_photo_height
FROM users u
LEFT JOIN profiles p ON u.id = p.user_id
LEFT JOIN files f ON p.profile_photo_id = f.id AND f.deleted_at IS NULL
WHERE u.deleted_at IS NULL;

-- ============================================================================
-- 8. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE poll_images IS 'Junction table linking polls to their associated images';
COMMENT ON COLUMN poll_images.image_role IS 'Role of image in poll: option_a, option_b, background, cover, etc.';
COMMENT ON COLUMN poll_images.display_order IS 'Order in which images should be displayed (0-based)';

COMMENT ON COLUMN profiles.profile_photo_id IS 'Reference to file ID for profile photo (preferred over profile_photo_url)';

COMMENT ON COLUMN files.width IS 'Image width in pixels (for images only)';
COMMENT ON COLUMN files.height IS 'Image height in pixels (for images only)';
COMMENT ON COLUMN files.thumbnail_s3_key IS 'S3 key for thumbnail version of image';
COMMENT ON COLUMN files.optimized_s3_key IS 'S3 key for optimized version of image';
COMMENT ON COLUMN files.usage_count IS 'Number of times this file is referenced (auto-updated by triggers)';
COMMENT ON COLUMN files.status IS 'File status: active, processing, deleted, error';

-- ============================================================================
-- 9. GRANT PERMISSIONS (adjust as needed)
-- ============================================================================

-- Grant permissions on new tables and functions
-- GRANT SELECT, INSERT, UPDATE, DELETE ON poll_images TO your_app_user;
-- GRANT EXECUTE ON FUNCTION increment_file_usage(UUID) TO your_app_user;
-- GRANT EXECUTE ON FUNCTION decrement_file_usage(UUID) TO your_app_user;

-- =====================================================
-- USER ACTIVITIES MIGRATION
-- Creates table to track user activities for profile display
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USER ACTIVITIES TABLE
-- =====================================================
-- Tracks all user activities for profile activities tab
CREATE TABLE user_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Activity Type
  activity_type VARCHAR(50) NOT NULL,
  -- 'poll_created', 'poll_voted', 'poll_liked', 'poll_commented', 'poll_bookmarked', 'poll_shared', 'poll_reposted'
  
  -- Related entities
  poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES poll_comments(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- For follow activities
  
  -- Activity details
  title TEXT NOT NULL, -- Display title for the activity
  description TEXT, -- Optional description
  metadata JSONB DEFAULT '{}', -- Additional activity data
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX idx_user_activities_user_id ON user_activities(user_id);
CREATE INDEX idx_user_activities_created_at ON user_activities(created_at DESC);
CREATE INDEX idx_user_activities_type ON user_activities(activity_type);
CREATE INDEX idx_user_activities_poll_id ON user_activities(poll_id);
CREATE INDEX idx_user_activities_user_type ON user_activities(user_id, activity_type);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_user_activities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_activities_timestamp
BEFORE UPDATE ON user_activities
FOR EACH ROW
EXECUTE FUNCTION update_user_activities_updated_at();

-- Comments
COMMENT ON TABLE user_activities IS 'User activities for profile activities tab display';
COMMENT ON COLUMN user_activities.activity_type IS 'Type of activity: poll_created, poll_voted, poll_liked, poll_commented, poll_bookmarked, poll_shared, poll_reposted';
COMMENT ON COLUMN user_activities.title IS 'Display title for the activity';
COMMENT ON COLUMN user_activities.metadata IS 'Additional activity data in JSON format';