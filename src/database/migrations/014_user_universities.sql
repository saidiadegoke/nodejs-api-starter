-- M.11: user_universities (many-to-many between users and JUPEB universities)
--
-- Replaces the implicit single-uni binding carried by profiles.jupeb_university_id
-- with a real join table. profiles.jupeb_university_id is kept as the
-- denormalized "primary" pointer so existing institution-scope code
-- (src/modules/jupeb/utils/institution-scope.js, payment.model.js, etc.)
-- continues to read it; the new table is the source of truth for which
-- universities a user is associated with.

CREATE TABLE IF NOT EXISTS user_universities (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  university_id UUID NOT NULL REFERENCES jupeb_universities(id) ON DELETE CASCADE,
  -- Optional context: what *kind* of relationship this is (student,
  -- registrar, institution_admin, ...). Free-form so future user types
  -- don't require a migration. Mirrors users.role naming.
  role          VARCHAR(40) NULL,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  created_by    UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    TIMESTAMP WITHOUT TIME ZONE NULL,
  UNIQUE (user_id, university_id)
);

CREATE INDEX IF NOT EXISTS idx_user_universities_user_id       ON user_universities (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_universities_university_id ON user_universities (university_id) WHERE deleted_at IS NULL;

-- At most one *active* primary per user. Active = deleted_at IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_universities_one_primary_per_user
  ON user_universities (user_id)
  WHERE is_primary = true AND deleted_at IS NULL;

-- Backfill: for every existing profiles.jupeb_university_id, create a
-- matching primary user_universities row. Idempotent because of the
-- (user_id, university_id) UNIQUE constraint above.
INSERT INTO user_universities (user_id, university_id, is_primary)
SELECT p.user_id, p.jupeb_university_id, true
FROM profiles p
WHERE p.jupeb_university_id IS NOT NULL
ON CONFLICT (user_id, university_id) DO NOTHING;
