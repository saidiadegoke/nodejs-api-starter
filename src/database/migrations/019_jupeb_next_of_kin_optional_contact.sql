-- Allow next-of-kin rows with name only (e.g. NIN snapshot before cache purge)
-- when the provider returns a contact name but no phone/email.
ALTER TABLE jupeb_next_of_kin DROP CONSTRAINT IF EXISTS jupeb_nok_contact_required;
