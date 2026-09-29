-- Add status column to roles table
ALTER TABLE roles ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

-- Back-fill existing rows
UPDATE roles SET status = 'active' WHERE status IS NULL;
