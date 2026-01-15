-- Add created_by column to templates table for user filtering
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS created_by UUID;

-- Add foreign key constraint
ALTER TABLE templates
ADD CONSTRAINT fk_templates_created_by
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON templates(created_by);

-- Update existing templates to set created_by to NULL (they're system templates)
-- This is safe because the column allows NULL
UPDATE templates SET created_by = NULL WHERE created_by IS NULL;

