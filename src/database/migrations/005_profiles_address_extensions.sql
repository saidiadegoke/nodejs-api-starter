-- M.2: editable address + Nigerian admin fields on profiles
-- See docs-impl/016-student-registration-end-to-end.md

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS residential_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS state_of_origin VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS lga VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS place_of_birth VARCHAR(120) NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_state_of_origin
  ON profiles (state_of_origin)
  WHERE state_of_origin IS NOT NULL;
