-- Subjects as a first-class catalog (figma "Create New Subject" modal)

CREATE TABLE IF NOT EXISTS jupeb_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT jupeb_subjects_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_subjects_code_lower
  ON jupeb_subjects (LOWER(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_subjects_status
  ON jupeb_subjects (status)
  WHERE deleted_at IS NULL;
