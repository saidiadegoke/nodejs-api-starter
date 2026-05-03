-- Cutover: drop the legacy JSONB `subjects` column. The relational join table
-- jupeb_subject_combination_items is now the single source of truth.

ALTER TABLE jupeb_subject_combinations DROP COLUMN IF EXISTS subjects;
