-- Allow 'pending' status on user_subscriptions so subscriptions can be created before payment
-- and activated after admin approval or payment verification.

ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE user_subscriptions ADD CONSTRAINT valid_status
  CHECK (status IN ('active', 'cancelled', 'expired', 'past_due', 'trialing', 'pending'));
