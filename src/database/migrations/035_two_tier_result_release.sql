-- Two-Tier Result Release Workflow (Registrar -> Institutions -> Students)
-- Tier 1: Registrar releases session results to institutions
-- Tier 2: Institution releases session results to students (bulk or per-candidate)

ALTER TABLE jupeb_registration_sessions
  ADD COLUMN IF NOT EXISTS results_released_to_institutions BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS results_released_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS results_released_by UUID NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_sessions_results_released 
  ON jupeb_registration_sessions (results_released_to_institutions);

CREATE TABLE IF NOT EXISTS jupeb_institution_session_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES jupeb_registration_sessions(id) ON DELETE CASCADE,
  university_id UUID NOT NULL REFERENCES jupeb_universities(id) ON DELETE CASCADE,
  results_released_to_students BOOLEAN NOT NULL DEFAULT false,
  students_results_released_at TIMESTAMP WITHOUT TIME ZONE NULL,
  released_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_inst_session_results_unique UNIQUE (session_id, university_id)
);

CREATE INDEX IF NOT EXISTS idx_jupeb_inst_results_session_uni 
  ON jupeb_institution_session_results (session_id, university_id);

ALTER TABLE jupeb_registrations
  ADD COLUMN IF NOT EXISTS is_result_released BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS result_released_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS result_released_by UUID NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_registrations_result_released 
  ON jupeb_registrations (is_result_released);
