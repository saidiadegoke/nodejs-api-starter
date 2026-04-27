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
