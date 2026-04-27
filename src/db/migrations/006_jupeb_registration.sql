-- JUPEB registration workflow: extend jupeb_registrations + status history

ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS subject_combination_id UUID REFERENCES jupeb_subject_combinations(id);
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS institution_issued_code VARCHAR(32);
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS provisional_serial INTEGER;
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS provisional_candidate_code VARCHAR(20);
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS jupeb_candidate_number VARCHAR(20);
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'provisional';
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS dashboard_unlocked_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE jupeb_registrations DROP CONSTRAINT IF EXISTS jupeb_reg_status_check;
ALTER TABLE jupeb_registrations ADD CONSTRAINT jupeb_reg_status_check CHECK (
  status IN (
    'provisional',
    'code_issued',
    'claimed',
    'pending_student_confirm',
    'pending_documents',
    'pending_institution_review',
    'approved',
    'rejected',
    'withdrawn'
  )
);

ALTER TABLE jupeb_registrations DROP CONSTRAINT IF EXISTS jupeb_reg_final_number_format;
ALTER TABLE jupeb_registrations ADD CONSTRAINT jupeb_reg_final_number_format CHECK (
  jupeb_candidate_number IS NULL OR jupeb_candidate_number ~ '^[0-9]{2}[0-9]{3}[0-9]{4,}$'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_reg_institution_code
  ON jupeb_registrations (institution_issued_code)
  WHERE institution_issued_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_reg_jupeb_candidate_number
  ON jupeb_registrations (jupeb_candidate_number)
  WHERE jupeb_candidate_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_reg_session_uni_nin
  ON jupeb_registrations (session_id, university_id, nin_verification_id)
  WHERE nin_verification_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_session_status ON jupeb_registrations (session_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_university_status ON jupeb_registrations (university_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_institution_code ON jupeb_registrations (institution_issued_code);

CREATE TABLE IF NOT EXISTS jupeb_registration_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES jupeb_registrations(id) ON DELETE CASCADE,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NOT NULL,
  reason TEXT NULL,
  changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jupeb_reg_hist_registration_id ON jupeb_registration_status_history (registration_id);
