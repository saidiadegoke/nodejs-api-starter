-- Intake extensions: sittings_count, result_types on registrations + university_type on universities

ALTER TABLE jupeb_registrations
  ADD COLUMN IF NOT EXISTS sittings_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS result_types JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE jupeb_registrations DROP CONSTRAINT IF EXISTS jupeb_reg_sittings_check;
ALTER TABLE jupeb_registrations ADD CONSTRAINT jupeb_reg_sittings_check
  CHECK (sittings_count IN (1, 2));

ALTER TABLE jupeb_universities
  ADD COLUMN IF NOT EXISTS university_type VARCHAR(20) NULL;

ALTER TABLE jupeb_universities DROP CONSTRAINT IF EXISTS jupeb_uni_type_check;
ALTER TABLE jupeb_universities ADD CONSTRAINT jupeb_uni_type_check
  CHECK (university_type IS NULL OR university_type IN ('federal', 'state', 'private'));
