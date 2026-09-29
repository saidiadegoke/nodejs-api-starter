ALTER TABLE jupeb_registration_documents DROP CONSTRAINT IF EXISTS jupeb_reg_doc_status_check;
ALTER TABLE jupeb_registration_documents ADD CONSTRAINT jupeb_reg_doc_status_check CHECK (status IN ('submitted', 'replaced', 'rejected', 'accepted', 'deleted'));
