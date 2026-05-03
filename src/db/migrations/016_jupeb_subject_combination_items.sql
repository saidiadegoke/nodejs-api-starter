-- Subject combination items: relational expansion of jupeb_subject_combinations.subjects JSONB.
-- Dual-write phase: the JSONB column stays authoritative for reads until consumers cut over.

CREATE TABLE IF NOT EXISTS jupeb_subject_combination_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  combination_id UUID NOT NULL REFERENCES jupeb_subject_combinations(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES jupeb_subjects(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_sci_position_check CHECK (position >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_sci_combo_position
  ON jupeb_subject_combination_items (combination_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_sci_combo_subject
  ON jupeb_subject_combination_items (combination_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_jupeb_sci_subject_id
  ON jupeb_subject_combination_items (subject_id);

-- Backfill: expand each combination's JSONB array into items, auto-creating subjects on miss.
DO $$
DECLARE
  combo RECORD;
  raw_subj TEXT;
  trimmed TEXT;
  upper_code TEXT;
  subj_id UUID;
  pos INT;
BEGIN
  FOR combo IN
    SELECT id, subjects FROM jupeb_subject_combinations WHERE deleted_at IS NULL
  LOOP
    pos := 0;
    FOR raw_subj IN SELECT jsonb_array_elements_text(combo.subjects) LOOP
      trimmed := TRIM(raw_subj);
      IF trimmed = '' THEN
        CONTINUE;
      END IF;
      upper_code := UPPER(LEFT(trimmed, 20));

      -- Try existing subject by code, then by name (case-insensitive).
      SELECT id INTO subj_id
        FROM jupeb_subjects
       WHERE deleted_at IS NULL AND LOWER(code) = LOWER(trimmed)
       LIMIT 1;
      IF subj_id IS NULL THEN
        SELECT id INTO subj_id
          FROM jupeb_subjects
         WHERE deleted_at IS NULL AND LOWER(name) = LOWER(trimmed)
         LIMIT 1;
      END IF;
      IF subj_id IS NULL THEN
        SELECT id INTO subj_id
          FROM jupeb_subjects
         WHERE deleted_at IS NULL AND LOWER(code) = LOWER(upper_code)
         LIMIT 1;
      END IF;

      -- Auto-create when nothing matched.
      IF subj_id IS NULL THEN
        INSERT INTO jupeb_subjects (code, name)
          VALUES (upper_code, trimmed)
        ON CONFLICT DO NOTHING
        RETURNING id INTO subj_id;
        IF subj_id IS NULL THEN
          SELECT id INTO subj_id
            FROM jupeb_subjects
           WHERE deleted_at IS NULL AND LOWER(code) = LOWER(upper_code)
           LIMIT 1;
        END IF;
      END IF;

      -- Insert join row; ignore duplicates (e.g. same subject listed twice).
      IF subj_id IS NOT NULL THEN
        INSERT INTO jupeb_subject_combination_items (combination_id, subject_id, position)
          VALUES (combo.id, subj_id, pos)
        ON CONFLICT DO NOTHING;
      END IF;
      pos := pos + 1;
    END LOOP;
  END LOOP;
END $$;
