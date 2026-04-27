-- JUPEB catalog: universities + subject combinations (001 technical design)

CREATE TABLE IF NOT EXISTS jupeb_universities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(80),
  jupeb_prefix CHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT jupeb_universities_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT jupeb_universities_prefix_numeric CHECK (jupeb_prefix ~ '^[0-9]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_universities_code_lower
  ON jupeb_universities (LOWER(code))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_universities_prefix_active
  ON jupeb_universities (jupeb_prefix)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_universities_status
  ON jupeb_universities (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_universities_name
  ON jupeb_universities (name);

CREATE TABLE IF NOT EXISTS jupeb_subject_combinations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  subjects JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_global BOOLEAN NOT NULL DEFAULT true,
  university_id UUID NULL REFERENCES jupeb_universities(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT jupeb_sc_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT jupeb_sc_scope_check CHECK (
    (is_global = true AND university_id IS NULL)
    OR (is_global = false AND university_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_sc_code_lower
  ON jupeb_subject_combinations (LOWER(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_sc_status
  ON jupeb_subject_combinations (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_sc_university_id
  ON jupeb_subject_combinations (university_id)
  WHERE deleted_at IS NULL;
