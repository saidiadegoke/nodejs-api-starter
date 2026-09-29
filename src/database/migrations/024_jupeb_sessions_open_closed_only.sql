-- JUPEB sessions have only two lifecycle statuses: open and closed.
-- Existing draft sessions become open; archived sessions remain historical
-- closed sessions.

ALTER TABLE jupeb_registration_sessions
  DROP CONSTRAINT IF EXISTS jupeb_sessions_status_check;

UPDATE jupeb_registration_sessions
   SET status = 'open',
       updated_at = CURRENT_TIMESTAMP
 WHERE status = 'draft';

UPDATE jupeb_registration_sessions
   SET status = 'closed',
       updated_at = CURRENT_TIMESTAMP
 WHERE status = 'archived';

WITH ranked_open_sessions AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY academic_year DESC, created_at DESC) AS rn
    FROM jupeb_registration_sessions
   WHERE status = 'open'
)
UPDATE jupeb_registration_sessions s
   SET status = 'closed',
       updated_at = CURRENT_TIMESTAMP
  FROM ranked_open_sessions r
 WHERE s.id = r.id
   AND r.rn > 1;

ALTER TABLE jupeb_registration_sessions
  ALTER COLUMN status SET DEFAULT 'open';

ALTER TABLE jupeb_registration_sessions
  ADD CONSTRAINT jupeb_sessions_status_check
  CHECK (status IN ('open', 'closed'));
