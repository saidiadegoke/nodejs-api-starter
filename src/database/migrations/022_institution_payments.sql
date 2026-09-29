-- Institution-scoped JUPEB payments (portal checkout without registration_id).

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS jupeb_university_id UUID REFERENCES jupeb_universities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS jupeb_session_id UUID REFERENCES jupeb_registration_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_jupeb_university_session
  ON payments (jupeb_university_id, jupeb_session_id)
  WHERE jupeb_university_id IS NOT NULL;
