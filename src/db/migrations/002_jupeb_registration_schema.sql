-- JUPEB catalog: universities + subject combinations (001 technical design)

CREATE TABLE IF NOT EXISTS jupeb_universities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(80),
  jupeb_prefix CHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT jupeb_universities_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT jupeb_universities_prefix_numeric CHECK (jupeb_prefix ~ '^[0-9]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_universities_code_lower
  ON jupeb_universities (LOWER(code))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_universities_prefix_active
  ON jupeb_universities (jupeb_prefix)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_universities_status
  ON jupeb_universities (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_universities_name
  ON jupeb_universities (name);

CREATE TABLE IF NOT EXISTS jupeb_subject_combinations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  subjects JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_global BOOLEAN NOT NULL DEFAULT true,
  university_id UUID NULL REFERENCES jupeb_universities(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT jupeb_sc_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT jupeb_sc_scope_check CHECK (
    (is_global = true AND university_id IS NULL)
    OR (is_global = false AND university_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_sc_code_lower
  ON jupeb_subject_combinations (LOWER(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_sc_status
  ON jupeb_subject_combinations (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_sc_university_id
  ON jupeb_subject_combinations (university_id)
  WHERE deleted_at IS NULL;
-- JUPEB registration sessions + audit events (002 technical design)

CREATE TABLE IF NOT EXISTS jupeb_registration_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academic_year VARCHAR(9) NOT NULL,
  year_short CHAR(2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  opens_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  closes_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  student_submission_deadline TIMESTAMP WITHOUT TIME ZONE NULL,
  institution_approval_deadline TIMESTAMP WITHOUT TIME ZONE NULL,
  registration_locked BOOLEAN NOT NULL DEFAULT false,
  final_numbers_generated_at TIMESTAMP WITHOUT TIME ZONE NULL,
  notes TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_sessions_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT jupeb_sessions_opens_before_closes CHECK (opens_at < closes_at),
  CONSTRAINT jupeb_sessions_academic_year_unique UNIQUE (academic_year)
);

CREATE INDEX IF NOT EXISTS idx_jupeb_sessions_status ON jupeb_registration_sessions (status);
CREATE INDEX IF NOT EXISTS idx_jupeb_sessions_dates ON jupeb_registration_sessions (opens_at, closes_at);

CREATE TABLE IF NOT EXISTS jupeb_session_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES jupeb_registration_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jupeb_session_events_session_id ON jupeb_session_events (session_id);
-- JUPEB identity: NIN verifications, minimal registrations (for biometric FKs; extended by registration module), biometrics

CREATE TABLE IF NOT EXISTS jupeb_nin_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nin_hash CHAR(64) NOT NULL,
  nin_last4 CHAR(4) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  provider_reference VARCHAR(120) NULL,
  idempotency_key VARCHAR(128) NULL,
  status VARCHAR(20) NOT NULL,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  requested_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_nin_status_check CHECK (status IN ('verified', 'failed', 'pending'))
);

CREATE INDEX IF NOT EXISTS idx_nin_verifications_nin_hash ON jupeb_nin_verifications (nin_hash);
CREATE INDEX IF NOT EXISTS idx_nin_verifications_status_created ON jupeb_nin_verifications (status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nin_verifications_idempotency_key
  ON jupeb_nin_verifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Minimal registration row holder (extended by future registration migration)
CREATE TABLE IF NOT EXISTS jupeb_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES jupeb_registration_sessions(id) ON DELETE CASCADE,
  university_id UUID NOT NULL REFERENCES jupeb_universities(id) ON DELETE RESTRICT,
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  nin_verification_id UUID NULL REFERENCES jupeb_nin_verifications(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jupeb_registrations_user_id ON jupeb_registrations (user_id);
CREATE INDEX IF NOT EXISTS idx_jupeb_registrations_session_id ON jupeb_registrations (session_id);

CREATE TABLE IF NOT EXISTS jupeb_biometric_captures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES jupeb_registrations(id) ON DELETE CASCADE,
  capture_type VARCHAR(20) NOT NULL,
  file_id UUID NULL REFERENCES files(id) ON DELETE SET NULL,
  external_reference VARCHAR(200) NULL,
  quality_score NUMERIC(5, 2) NULL,
  device_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_bio_capture_type_check CHECK (capture_type IN ('face', 'fingerprint')),
  CONSTRAINT jupeb_bio_file_or_external CHECK (
    (file_id IS NOT NULL AND external_reference IS NULL)
    OR (file_id IS NULL AND external_reference IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_bio_registration_type
  ON jupeb_biometric_captures (registration_id, capture_type);

CREATE INDEX IF NOT EXISTS idx_jupeb_bio_registration_id ON jupeb_biometric_captures (registration_id);
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
  CONSTRAINT jupeb_reg_doc_status_check CHECK (status IN ('submitted', 'replaced', 'rejected', 'accepted', 'deleted'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_docs_one_active_submitted_accepted
  ON jupeb_registration_documents (registration_id, requirement_id)
  WHERE status IN ('submitted', 'accepted');

CREATE INDEX IF NOT EXISTS idx_registration_documents_registration_id
  ON jupeb_registration_documents (registration_id);

CREATE INDEX IF NOT EXISTS idx_registration_documents_status
  ON jupeb_registration_documents (status);
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
-- JUPEB finance: link payments to registrations + optional reconciliation audit rows

ALTER TABLE payments ADD COLUMN IF NOT EXISTS registration_id UUID REFERENCES jupeb_registrations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_registration_id ON payments (registration_id);

CREATE TABLE IF NOT EXISTS jupeb_payment_reconciliations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES jupeb_registrations(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  status_snapshot VARCHAR(20) NOT NULL,
  captured_amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  gateway_reference VARCHAR(120) NULL,
  reconciled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reconciled_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_pay_recon_status_check CHECK (
    status_snapshot IN ('pending', 'successful', 'failed', 'refunded')
  )
);

CREATE INDEX IF NOT EXISTS idx_jupeb_pay_recon_registration_id ON jupeb_payment_reconciliations (registration_id);
CREATE INDEX IF NOT EXISTS idx_jupeb_pay_recon_payment_id ON jupeb_payment_reconciliations (payment_id);
-- JUPEB academic (phase 2): courses, per-registration grades, score snapshot

CREATE TABLE IF NOT EXISTS jupeb_courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL,
  title VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_courses_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_courses_code ON jupeb_courses (code);

CREATE INDEX IF NOT EXISTS idx_jupeb_courses_status ON jupeb_courses (status);

CREATE TABLE IF NOT EXISTS jupeb_registration_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES jupeb_registrations(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES jupeb_courses(id) ON DELETE RESTRICT,
  grade CHAR(1) NOT NULL,
  plus_one_awarded BOOLEAN NOT NULL,
  entered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entered_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_reg_results_grade_check CHECK (grade IN ('A', 'B', 'C', 'D', 'E', 'F')),
  CONSTRAINT jupeb_reg_results_unique_course UNIQUE (registration_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_jupeb_reg_results_registration_id ON jupeb_registration_results (registration_id);
CREATE INDEX IF NOT EXISTS idx_jupeb_reg_results_course_id ON jupeb_registration_results (course_id);

CREATE TABLE IF NOT EXISTS jupeb_registration_scores (
  registration_id UUID PRIMARY KEY REFERENCES jupeb_registrations(id) ON DELETE CASCADE,
  passed_courses_count INTEGER NOT NULL,
  failed_courses_count INTEGER NOT NULL,
  plus_one_total INTEGER NOT NULL,
  computed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- JUPEB gaps: institution scope, code TTL, session fees, payment projection on registrations

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS jupeb_university_id UUID REFERENCES jupeb_universities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_jupeb_university_id ON profiles (jupeb_university_id);

ALTER TABLE jupeb_registration_sessions ADD COLUMN IF NOT EXISTS registration_fee_amount NUMERIC(12, 2) NULL;
ALTER TABLE jupeb_registration_sessions ADD COLUMN IF NOT EXISTS registration_fee_currency VARCHAR(3) NOT NULL DEFAULT 'NGN';

ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS payment_projection VARCHAR(20) NOT NULL DEFAULT 'unpaid';
ALTER TABLE jupeb_registrations DROP CONSTRAINT IF EXISTS jupeb_reg_payment_proj_check;
ALTER TABLE jupeb_registrations ADD CONSTRAINT jupeb_reg_payment_proj_check CHECK (
  payment_projection IN ('unpaid', 'pending', 'paid', 'payment_failed')
);

ALTER TABLE jupeb_registrations ADD COLUMN IF NOT EXISTS institution_code_expires_at TIMESTAMP WITHOUT TIME ZONE NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_registrations_payment_projection ON jupeb_registrations (payment_projection);
-- NIN pending verification: track unavailable provider state and cache candidate intake fields

ALTER TABLE jupeb_nin_verifications
  ADD COLUMN IF NOT EXISTS intake_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(40) NULL;

CREATE INDEX IF NOT EXISTS idx_nin_verifications_pending_retry
  ON jupeb_nin_verifications (status, retry_after)
  WHERE status = 'pending';
-- Intake extensions: sittings_count, result_types on registrations + university_type on universities

ALTER TABLE jupeb_registrations
  ADD COLUMN IF NOT EXISTS sittings_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS result_types JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE jupeb_registrations DROP CONSTRAINT IF EXISTS jupeb_reg_sittings_check;
ALTER TABLE jupeb_registrations ADD CONSTRAINT jupeb_reg_sittings_check
  CHECK (sittings_count IN (1, 2));

ALTER TABLE jupeb_universities
  ADD COLUMN IF NOT EXISTS university_type VARCHAR(20) NULL;

ALTER TABLE jupeb_universities DROP CONSTRAINT IF EXISTS jupeb_uni_type_check;
ALTER TABLE jupeb_universities ADD CONSTRAINT jupeb_uni_type_check
  CHECK (university_type IS NULL OR university_type IN ('federal', 'state', 'private'));
-- Biometric skip + replace-in-place support

ALTER TABLE jupeb_registrations
  ADD COLUMN IF NOT EXISTS fingerprint_skipped_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS face_skipped_at TIMESTAMP WITHOUT TIME ZONE NULL;

ALTER TABLE jupeb_biometric_captures
  ADD COLUMN IF NOT EXISTS replaced_at TIMESTAMP WITHOUT TIME ZONE NULL;

-- Replace the (registration_id, capture_type) uniqueness so replaced rows don't block re-capture.
DROP INDEX IF EXISTS idx_jupeb_bio_registration_type;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_bio_registration_type_active
  ON jupeb_biometric_captures (registration_id, capture_type)
  WHERE replaced_at IS NULL;
-- Subjects as a first-class catalog (figma "Create New Subject" modal)

CREATE TABLE IF NOT EXISTS jupeb_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT jupeb_subjects_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_subjects_code_lower
  ON jupeb_subjects (LOWER(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jupeb_subjects_status
  ON jupeb_subjects (status)
  WHERE deleted_at IS NULL;
-- Institution contact + capacity fields (figma "Create New Institution" modal)

ALTER TABLE jupeb_universities
  ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS address TEXT NULL,
  ADD COLUMN IF NOT EXISTS phone VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS expected_candidate_count INTEGER NULL,
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

ALTER TABLE jupeb_universities DROP CONSTRAINT IF EXISTS jupeb_uni_capacity_nonneg;
ALTER TABLE jupeb_universities ADD CONSTRAINT jupeb_uni_capacity_nonneg
  CHECK (expected_candidate_count IS NULL OR expected_candidate_count >= 0);
-- Session cutoff dates, fees, max CA score (figma "Create New Session" modal)

ALTER TABLE jupeb_registration_sessions
  ADD COLUMN IF NOT EXISTS candidate_info_cutoff_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS profile_update_cutoff_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS ca_cutoff_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS max_ca_score INTEGER NULL,
  ADD COLUMN IF NOT EXISTS affiliation_fee_existing NUMERIC(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS affiliation_fee_new NUMERIC(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS exam_fee_per_candidate NUMERIC(12, 2) NULL;

ALTER TABLE jupeb_registration_sessions DROP CONSTRAINT IF EXISTS jupeb_sessions_max_ca_score_check;
ALTER TABLE jupeb_registration_sessions ADD CONSTRAINT jupeb_sessions_max_ca_score_check
  CHECK (max_ca_score IS NULL OR (max_ca_score >= 0 AND max_ca_score <= 100));
-- Subject combination items: relational expansion of jupeb_subject_combinations.subjects JSONB.
-- Dual-write phase: the JSONB column stays authoritative for reads until consumers cut over.

CREATE TABLE IF NOT EXISTS jupeb_subject_combination_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  combination_id UUID NOT NULL REFERENCES jupeb_subject_combinations(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES jupeb_subjects(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT jupeb_sci_position_check CHECK (position >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_sci_combo_position
  ON jupeb_subject_combination_items (combination_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jupeb_sci_combo_subject
  ON jupeb_subject_combination_items (combination_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_jupeb_sci_subject_id
  ON jupeb_subject_combination_items (subject_id);

-- Backfill: expand each combination's JSONB array into items, auto-creating subjects on miss.
-- Idempotent: skipped entirely when the JSONB column has already been dropped (later migration).
DO $$
DECLARE
  combo RECORD;
  raw_subj TEXT;
  trimmed TEXT;
  upper_code TEXT;
  subj_id UUID;
  pos INT;
  has_jsonb_subjects BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jupeb_subject_combinations' AND column_name = 'subjects'
  ) INTO has_jsonb_subjects;
  IF NOT has_jsonb_subjects THEN
    RETURN;
  END IF;

  FOR combo IN
    EXECUTE 'SELECT id, subjects FROM jupeb_subject_combinations WHERE deleted_at IS NULL'
  LOOP
    pos := 0;
    FOR raw_subj IN SELECT jsonb_array_elements_text(combo.subjects) LOOP
      trimmed := TRIM(raw_subj);
      IF trimmed = '' THEN
        CONTINUE;
      END IF;
      upper_code := UPPER(LEFT(trimmed, 20));

      -- Try existing subject by code, then by name (case-insensitive).
      SELECT id INTO subj_id
        FROM jupeb_subjects
       WHERE deleted_at IS NULL AND LOWER(code) = LOWER(trimmed)
       LIMIT 1;
      IF subj_id IS NULL THEN
        SELECT id INTO subj_id
          FROM jupeb_subjects
         WHERE deleted_at IS NULL AND LOWER(name) = LOWER(trimmed)
         LIMIT 1;
      END IF;
      IF subj_id IS NULL THEN
        SELECT id INTO subj_id
          FROM jupeb_subjects
         WHERE deleted_at IS NULL AND LOWER(code) = LOWER(upper_code)
         LIMIT 1;
      END IF;

      -- Auto-create when nothing matched.
      IF subj_id IS NULL THEN
        INSERT INTO jupeb_subjects (code, name)
          VALUES (upper_code, trimmed)
        ON CONFLICT DO NOTHING
        RETURNING id INTO subj_id;
        IF subj_id IS NULL THEN
          SELECT id INTO subj_id
            FROM jupeb_subjects
           WHERE deleted_at IS NULL AND LOWER(code) = LOWER(upper_code)
           LIMIT 1;
        END IF;
      END IF;

      -- Insert join row; ignore duplicates (e.g. same subject listed twice).
      IF subj_id IS NOT NULL THEN
        INSERT INTO jupeb_subject_combination_items (combination_id, subject_id, position)
          VALUES (combo.id, subj_id, pos)
        ON CONFLICT DO NOTHING;
      END IF;
      pos := pos + 1;
    END LOOP;
  END LOOP;
END $$;
-- Cutover: drop the legacy JSONB `subjects` column. The relational join table
-- jupeb_subject_combination_items is now the single source of truth.

ALTER TABLE jupeb_subject_combinations DROP COLUMN IF EXISTS subjects;
