-- Role names are scoped by ownership.
--
-- Platform/system roles keep global uniqueness (owner_jupeb_university_id IS NULL).
-- Institution-owned custom roles may reuse names from system roles or other
-- institutions, but remain unique inside the same institution.

ALTER TABLE roles
  DROP CONSTRAINT IF EXISTS roles_name_key;

DROP INDEX IF EXISTS idx_roles_name;

CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_global_scope_name_lower
  ON roles (LOWER(name))
  WHERE owner_jupeb_university_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_institution_scope_name_lower
  ON roles (owner_jupeb_university_id, LOWER(name))
  WHERE owner_jupeb_university_id IS NOT NULL;
