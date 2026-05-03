-- Session cutoff dates, fees, max CA score (figma "Create New Session" modal)

ALTER TABLE jupeb_registration_sessions
  ADD COLUMN IF NOT EXISTS candidate_info_cutoff_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS profile_update_cutoff_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS ca_cutoff_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS max_ca_score INTEGER NULL,
  ADD COLUMN IF NOT EXISTS affiliation_fee_existing NUMERIC(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS affiliation_fee_new NUMERIC(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS exam_fee_per_candidate NUMERIC(12, 2) NULL;

ALTER TABLE jupeb_registration_sessions DROP CONSTRAINT IF EXISTS jupeb_sessions_max_ca_score_check;
ALTER TABLE jupeb_registration_sessions ADD CONSTRAINT jupeb_sessions_max_ca_score_check
  CHECK (max_ca_score IS NULL OR (max_ca_score >= 0 AND max_ca_score <= 100));
