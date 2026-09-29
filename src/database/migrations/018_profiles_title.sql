-- M.15: honorific / title on profiles (Mr, Mrs, Ms, Dr, Prof, …).
-- A short free-text honorific that prefixes a person's name on receipts,
-- candidate detail, etc. Nullable — not everyone has one.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS title VARCHAR(20) NULL;
