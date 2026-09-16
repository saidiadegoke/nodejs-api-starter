-- 034: Support manual result entry (no file/OCR required)
-- • file_id becomes nullable on ocr_jobs (manual entries carry no file)
-- • 'manual' added to the provider CHECK constraint

-- 1. Drop and recreate provider check to include 'manual'
ALTER TABLE ocr_jobs
  DROP CONSTRAINT IF EXISTS ocr_jobs_provider_check;

ALTER TABLE ocr_jobs
  ADD CONSTRAINT ocr_jobs_provider_check
    CHECK (provider IN (
      'pdf_text', 'tesseract', 'ocr_space',
      'aws_textract', 'google_doc_ai', 'mock', 'manual'
    ));

-- 2. Make file_id nullable (manual entries carry no file)
ALTER TABLE ocr_jobs
  ALTER COLUMN file_id DROP NOT NULL;

-- 3. RBAC: add 'ocr.manual_entry' permission
INSERT INTO permissions (name, resource, action, description)
VALUES (
  'ocr.manual_entry',
  'ocr',
  'manual_entry',
  'Submit exam results manually without a document upload'
)
ON CONFLICT (name) DO NOTHING;

-- Grant to student-facing roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('user', 'student')
  AND p.name = 'ocr.manual_entry'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant to staff roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'super_admin', 'registrar')
  AND p.name = 'ocr.manual_entry'
ON CONFLICT (role_id, permission_id) DO NOTHING;
