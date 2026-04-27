-- JUPEB submission: document requirements + registration document attachments

CREATE TABLE IF NOT EXISTS jupeb_document_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(60) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  allowed_mime_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_file_size_mb INTEGER NOT NULL DEFAULT 10,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_doc_req_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_doc_req_key_lower
  ON jupeb_document_requirements (LOWER(key));

CREATE TABLE IF NOT EXISTS jupeb_registration_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES jupeb_registrations(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES jupeb_document_requirements(id) ON DELETE RESTRICT,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  review_note TEXT NULL,
  reviewed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_reg_doc_status_check CHECK (status IN ('submitted', 'replaced', 'rejected', 'accepted'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_docs_one_active_submitted_accepted
  ON jupeb_registration_documents (registration_id, requirement_id)
  WHERE status IN ('submitted', 'accepted');

CREATE INDEX IF NOT EXISTS idx_registration_documents_registration_id
  ON jupeb_registration_documents (registration_id);

CREATE INDEX IF NOT EXISTS idx_registration_documents_status
  ON jupeb_registration_documents (status);
