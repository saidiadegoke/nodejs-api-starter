-- M.7: parsed subject + grade rows extracted from uploaded WAEC / NECO / NABTEB / GCE results
-- See docs-impl/016-student-registration-end-to-end.md.
-- Drives the figma `log in 18` final-preview subject/grade table.

CREATE TABLE IF NOT EXISTS jupeb_result_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES jupeb_registrations(id) ON DELETE CASCADE,
  source VARCHAR(20) NOT NULL,
  sitting INTEGER NOT NULL,
  serial INTEGER NOT NULL,
  subject TEXT NOT NULL,
  grade VARCHAR(4) NOT NULL,
  grade_normalized CHAR(1) NULL,
  score INTEGER NULL,
  origin VARCHAR(10) NOT NULL DEFAULT 'manual',
  ocr_job_id UUID NULL REFERENCES ocr_jobs(id) ON DELETE SET NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_result_entry_source_check
    CHECK (source IN ('waec', 'neco', 'nabteb', 'gce', 'jamb')),
  CONSTRAINT jupeb_result_entry_sitting_check
    CHECK (sitting IN (1, 2)),
  CONSTRAINT jupeb_result_entry_origin_check
    CHECK (origin IN ('ocr', 'manual')),
  CONSTRAINT jupeb_result_entry_grade_normalized_check
    CHECK (grade_normalized IS NULL OR grade_normalized IN ('A', 'B', 'C', 'D', 'E', 'F')),
  CONSTRAINT jupeb_result_entry_serial_positive CHECK (serial >= 0),
  CONSTRAINT jupeb_result_entry_score_range
    CHECK (score IS NULL OR (score >= 0 AND score <= 100))
);

-- One row per (registration, source, sitting, serial). The serial is the
-- 0-based position on the certificate; manual upserts replace OCR rows by
-- reusing the same serial.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_result_entries_unique
  ON jupeb_result_entries (registration_id, source, sitting, serial);

-- Hot lookups: by registration (final-preview render), by ocr_job (worker
-- write-through), and by source/sitting (registrar review filter).
CREATE INDEX IF NOT EXISTS idx_jupeb_result_entries_registration
  ON jupeb_result_entries (registration_id);

CREATE INDEX IF NOT EXISTS idx_jupeb_result_entries_ocr_job
  ON jupeb_result_entries (ocr_job_id)
  WHERE ocr_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_result_entries_origin
  ON jupeb_result_entries (origin);
