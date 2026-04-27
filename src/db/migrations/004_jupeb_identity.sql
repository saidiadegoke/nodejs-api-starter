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
