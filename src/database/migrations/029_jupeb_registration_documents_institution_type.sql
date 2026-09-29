ALTER TABLE jupeb_registration_documents
ADD COLUMN IF NOT EXISTS institution_type VARCHAR(50) NULL;
