-- Session-level registration lock. When true, institutions cannot issue
-- new candidate registration codes even if the session itself is open.

ALTER TABLE jupeb_registration_sessions
  ADD COLUMN IF NOT EXISTS registration_locked BOOLEAN NOT NULL DEFAULT false;
