-- Per-user viewing session for registrar/finance portals (read context only).
-- Does not change global open/closed session lifecycle.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS viewing_jupeb_session_id UUID NULL
  REFERENCES jupeb_registration_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_viewing_jupeb_session_id
  ON profiles (viewing_jupeb_session_id)
  WHERE viewing_jupeb_session_id IS NOT NULL;
