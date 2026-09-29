-- Track who created custom roles and which institution owns them (for scoped admin lists).

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_jupeb_university_id UUID REFERENCES jupeb_universities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roles_created_by ON roles(created_by);
CREATE INDEX IF NOT EXISTS idx_roles_owner_uni ON roles(owner_jupeb_university_id);
