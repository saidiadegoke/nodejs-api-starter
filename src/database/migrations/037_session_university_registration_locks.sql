-- Migration 037: Per-university registration lock per session
-- Allows locking or unlocking registration for select universities in a session.

CREATE TABLE IF NOT EXISTS jupeb_session_university_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES jupeb_registration_sessions(id) ON DELETE CASCADE,
  university_id UUID NOT NULL REFERENCES jupeb_universities(id) ON DELETE CASCADE,
  locked BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  locked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_session_university_lock UNIQUE (session_id, university_id)
);

CREATE INDEX IF NOT EXISTS idx_session_uni_locks_session ON jupeb_session_university_locks (session_id);
CREATE INDEX IF NOT EXISTS idx_session_uni_locks_lookup ON jupeb_session_university_locks (session_id, university_id, locked);
