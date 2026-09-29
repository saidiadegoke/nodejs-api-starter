-- jupeb_candidate_number — real matric formats vary widely across
-- institutions:
--   UNILAG  19021200N1
--   OAU     OAU/2024/12345
--   UI      UI/202012345
--   FUTA    PG21/3/CHM/0123
-- Original constraint (^[0-9]{2}[0-9]{3}[0-9]{4,}$) only accepts the
-- all-numeric UNILAG style and rejects everything else. Loosen to
-- alphanumeric plus `-`, `/`, and `_` with a minimum length of 4 so we
-- still catch obvious junk but support real-world formats.

ALTER TABLE jupeb_registrations DROP CONSTRAINT IF EXISTS jupeb_reg_final_number_format;

ALTER TABLE jupeb_registrations ADD CONSTRAINT jupeb_reg_final_number_format CHECK (
  jupeb_candidate_number IS NULL
  OR jupeb_candidate_number ~ '^[A-Za-z0-9/_-]{4,}$'
);
