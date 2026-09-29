-- Allow subject combinations to share the same code (e.g. JUPEB SC-001 with CRS vs ISS),
-- while ensuring combinations remain unique on (code, title).

DROP INDEX IF EXISTS idx_jupeb_sc_code_lower;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_sc_code_title_lower
  ON jupeb_subject_combinations (LOWER(code), LOWER(title))
  WHERE deleted_at IS NULL;
