-- OCR module: jobs + results + RBAC seeds
-- See docs-impl/015-ocr-technical-design.md

CREATE TABLE IF NOT EXISTS ocr_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  exam_type VARCHAR(20) NOT NULL DEFAULT 'auto',
  provider VARCHAR(40) NOT NULL DEFAULT 'pdf_text',
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_code VARCHAR(60) NULL,
  error_message TEXT NULL,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_for UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  context VARCHAR(40) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMP WITHOUT TIME ZONE NULL,
  completed_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ocr_jobs_status_check CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  CONSTRAINT ocr_jobs_exam_type_check CHECK (exam_type IN ('auto', 'waec', 'neco', 'nabteb', 'gce', 'generic')),
  CONSTRAINT ocr_jobs_provider_check CHECK (provider IN ('pdf_text', 'tesseract', 'ocr_space', 'aws_textract', 'google_doc_ai', 'mock'))
);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status_created_at
  ON ocr_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_file_id
  ON ocr_jobs (file_id);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_requested_by
  ON ocr_jobs (requested_by, created_at DESC);

CREATE TABLE IF NOT EXISTS ocr_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL UNIQUE REFERENCES ocr_jobs(id) ON DELETE CASCADE,
  exam_type_detected VARCHAR(20) NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  result_json JSONB NOT NULL,
  raw_text TEXT NOT NULL,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  page_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ocr_results_exam_type_check CHECK (exam_type_detected IN ('waec', 'neco', 'nabteb', 'gce', 'generic')),
  CONSTRAINT ocr_results_confidence_range CHECK (confidence >= 0 AND confidence <= 100)
);

CREATE INDEX IF NOT EXISTS idx_ocr_results_exam_type_detected
  ON ocr_results (exam_type_detected);

-- RBAC seed: permissions
INSERT INTO permissions (name, resource, action, description)
VALUES
  ('ocr.create', 'ocr', 'create', 'Submit OCR jobs for own files'),
  ('ocr.read', 'ocr', 'read', 'Read OCR jobs for own files'),
  ('ocr.read.any', 'ocr', 'read.any', 'Read OCR jobs for any file (staff)'),
  ('ocr.requirement.bind', 'ocr', 'requirement.bind', 'Bind OCR results to JUPEB submission requirements')
ON CONFLICT (name) DO NOTHING;

-- RBAC seed: grant ocr.create + ocr.read to common student-facing roles when present
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('user', 'student')
  AND p.name IN ('ocr.create', 'ocr.read')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- RBAC seed: grant all OCR permissions to staff roles when present
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'super_admin', 'registrar')
  AND p.name IN ('ocr.create', 'ocr.read', 'ocr.read.any', 'ocr.requirement.bind')
ON CONFLICT (role_id, permission_id) DO NOTHING;
