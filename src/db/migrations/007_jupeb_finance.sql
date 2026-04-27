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
