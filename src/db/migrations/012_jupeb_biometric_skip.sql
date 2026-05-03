-- Biometric skip + replace-in-place support

ALTER TABLE jupeb_registrations
  ADD COLUMN IF NOT EXISTS fingerprint_skipped_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS face_skipped_at TIMESTAMP WITHOUT TIME ZONE NULL;

ALTER TABLE jupeb_biometric_captures
  ADD COLUMN IF NOT EXISTS replaced_at TIMESTAMP WITHOUT TIME ZONE NULL;

-- Replace the (registration_id, capture_type) uniqueness so replaced rows don't block re-capture.
DROP INDEX IF EXISTS idx_jupeb_bio_registration_type;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_bio_registration_type_active
  ON jupeb_biometric_captures (registration_id, capture_type)
  WHERE replaced_at IS NULL;
