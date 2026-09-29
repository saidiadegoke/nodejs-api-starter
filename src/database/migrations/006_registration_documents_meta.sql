-- M.4: source + sitting metadata on jupeb_registration_documents
-- See docs-impl/016-student-registration-end-to-end.md

ALTER TABLE jupeb_registration_documents
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS sitting INTEGER NULL;

ALTER TABLE jupeb_registration_documents DROP CONSTRAINT IF EXISTS jupeb_reg_doc_source_check;
ALTER TABLE jupeb_registration_documents ADD CONSTRAINT jupeb_reg_doc_source_check
  CHECK (source IS NULL OR source IN ('waec', 'neco', 'nabteb', 'gce', 'jamb', 'other'));

ALTER TABLE jupeb_registration_documents DROP CONSTRAINT IF EXISTS jupeb_reg_doc_sitting_check;
ALTER TABLE jupeb_registration_documents ADD CONSTRAINT jupeb_reg_doc_sitting_check
  CHECK (sitting IS NULL OR sitting IN (1, 2));

-- One active row per (registration, source, sitting) when both metadata fields are set.
-- The existing (registration, requirement) unique index continues to enforce
-- "one active row per requirement" for non-result requirements.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_docs_one_active_per_source_sitting
  ON jupeb_registration_documents (registration_id, source, sitting)
  WHERE status IN ('submitted', 'accepted')
    AND source IS NOT NULL
    AND sitting IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_documents_source
  ON jupeb_registration_documents (registration_id, source)
  WHERE source IS NOT NULL;
