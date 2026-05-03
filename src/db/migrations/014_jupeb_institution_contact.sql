-- Institution contact + capacity fields (figma "Create New Institution" modal)

ALTER TABLE jupeb_universities
  ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS address TEXT NULL,
  ADD COLUMN IF NOT EXISTS phone VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS expected_candidate_count INTEGER NULL,
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

ALTER TABLE jupeb_universities DROP CONSTRAINT IF EXISTS jupeb_uni_capacity_nonneg;
ALTER TABLE jupeb_universities ADD CONSTRAINT jupeb_uni_capacity_nonneg
  CHECK (expected_candidate_count IS NULL OR expected_candidate_count >= 0);
