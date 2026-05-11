-- M.1: Next of Kin per registration
-- See docs-impl/016-student-registration-end-to-end.md

CREATE TABLE IF NOT EXISTS jupeb_next_of_kin (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES jupeb_registrations(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  relationship VARCHAR(60) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(255) NULL,
  address TEXT NULL,
  source VARCHAR(10) NOT NULL DEFAULT 'student',
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT jupeb_nok_source_check CHECK (source IN ('nin', 'student', 'institution')),
  CONSTRAINT jupeb_nok_contact_required CHECK (
    phone IS NOT NULL OR email IS NOT NULL
  )
);

-- One active NoK per registration; soft-deletes (deleted_at) preserve history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_nok_active_per_registration
  ON jupeb_next_of_kin (registration_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_nok_registration_id
  ON jupeb_next_of_kin (registration_id);
