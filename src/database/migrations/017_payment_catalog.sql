-- M.14: configurable payment catalog.
--
-- payment_items     — *what* a payer pays for (Affiliation Fee, Examination, …).
-- payment_structures — *how* they pay (Full, Partial).
-- Both are admin-managed catalogs; payments references them by FK so
-- receipts and reports resolve names instead of carrying loose strings.

CREATE TABLE IF NOT EXISTS payment_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code         VARCHAR(40)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  description  TEXT NULL,
  -- How the payable amount is derived for a given session/registration:
  --   'affiliation' → session affiliation fee (existing/new by institution)
  --   'examination' → session exam fee per candidate
  --   'fixed'       → the fixed_amount below
  fee_source   VARCHAR(20) NOT NULL DEFAULT 'fixed',
  fixed_amount NUMERIC(12, 2) NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at   TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT payment_items_fee_source_check
    CHECK (fee_source IN ('affiliation', 'examination', 'fixed')),
  CONSTRAINT payment_items_fixed_amount_check
    CHECK (fee_source <> 'fixed' OR fixed_amount IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_items_code_lower
  ON payment_items (LOWER(code)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS payment_structures (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code           VARCHAR(40)  NOT NULL,
  name           VARCHAR(120) NOT NULL,
  description    TEXT NULL,
  -- true  → payer enters any amount up to the outstanding balance
  -- false → payer must clear the full outstanding balance in one go
  allows_partial BOOLEAN NOT NULL DEFAULT false,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at     TIMESTAMP WITHOUT TIME ZONE NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_structures_code_lower
  ON payment_structures (LOWER(code)) WHERE deleted_at IS NULL;

-- Default catalog (from the figma "Make Payment" screens).
INSERT INTO payment_items (code, name, description, fee_source, sort_order)
VALUES
  ('affiliation_fee', 'Affiliation Fee', 'Institution affiliation fee for the session.', 'affiliation', 1),
  ('examination_fee', 'Examination', 'JUPEB examination fee.', 'examination', 2)
ON CONFLICT DO NOTHING;

INSERT INTO payment_structures (code, name, description, allows_partial, sort_order)
VALUES
  ('full',    'Full Payment',    'Clear the full outstanding amount at once.', false, 1),
  ('partial', 'Partial Payment', 'Pay part of the balance now; settle the rest later.', true, 2)
ON CONFLICT DO NOTHING;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_item_id      UUID REFERENCES payment_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_structure_id UUID REFERENCES payment_structures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_payment_item_id ON payments (payment_item_id);
