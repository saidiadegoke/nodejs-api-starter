-- JUPEB registration sessions + audit events (002 technical design)

CREATE TABLE IF NOT EXISTS jupeb_registration_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academic_year VARCHAR(9) NOT NULL,
  year_short CHAR(2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  opens_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  closes_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  student_submission_deadline TIMESTAMP WITHOUT TIME ZONE NULL,
  institution_approval_deadline TIMESTAMP WITHOUT TIME ZONE NULL,
  final_numbers_generated_at TIMESTAMP WITHOUT TIME ZONE NULL,
  notes TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_sessions_status_check CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  CONSTRAINT jupeb_sessions_opens_before_closes CHECK (opens_at < closes_at),
  CONSTRAINT jupeb_sessions_academic_year_unique UNIQUE (academic_year)
);

CREATE INDEX IF NOT EXISTS idx_jupeb_sessions_status ON jupeb_registration_sessions (status);
CREATE INDEX IF NOT EXISTS idx_jupeb_sessions_dates ON jupeb_registration_sessions (opens_at, closes_at);

CREATE TABLE IF NOT EXISTS jupeb_session_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES jupeb_registration_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jupeb_session_events_session_id ON jupeb_session_events (session_id);
