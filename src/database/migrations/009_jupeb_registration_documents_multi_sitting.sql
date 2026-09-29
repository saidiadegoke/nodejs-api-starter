-- M.4 follow-up: the partial unique index on (registration_id, requirement_id)
-- from migration 002 enforces "one active document per requirement", which
-- predates the source/sitting model added in migration 006. For result-type
-- requirements (waec_result etc.) we now want each (source, sitting) tuple
-- to be uploadable as its own active row — sittings 1 and 2 should coexist.
--
-- Drop the broad index and recreate it scoped to rows without a (source, sitting)
-- — for those rows, idx_reg_docs_one_active_per_source_sitting (migration 006)
-- already enforces single-active-per-tuple.

DROP INDEX IF EXISTS idx_reg_docs_one_active_submitted_accepted;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_docs_one_active_submitted_accepted
  ON jupeb_registration_documents (registration_id, requirement_id)
  WHERE status IN ('submitted', 'accepted')
    AND source IS NULL
    AND sitting IS NULL;
