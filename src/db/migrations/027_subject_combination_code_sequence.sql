-- Allocate concurrency-safe subject-combination serials.
-- Existing "JUPEB SC-NNN" (and legacy "JUPEB-SC-NNN") codes advance the
-- sequence so serials are never reused.

CREATE SEQUENCE IF NOT EXISTS jupeb_subject_combination_code_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

DO $$
DECLARE
  highest_existing BIGINT;
BEGIN
  SELECT MAX(SUBSTRING(code FROM '^JUPEB[ -]SC-([0-9]+)$')::BIGINT)
    INTO highest_existing
    FROM jupeb_subject_combinations
   WHERE code ~ '^JUPEB[ -]SC-[0-9]+$';

  IF highest_existing IS NOT NULL THEN
    PERFORM setval(
      'jupeb_subject_combination_code_seq',
      highest_existing,
      true
    );
  END IF;
END
$$;
