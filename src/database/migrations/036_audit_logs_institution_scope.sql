-- M.36: Add institution scoping and resource indexing to admin_audit_logs

ALTER TABLE admin_audit_logs
  ADD COLUMN IF NOT EXISTS jupeb_university_id UUID NULL REFERENCES jupeb_universities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_university_id
  ON admin_audit_logs (jupeb_university_id)
  WHERE jupeb_university_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_resource
  ON admin_audit_logs (resource_type, resource_id);
