-- Keep every existing member, payment, point transaction and visit. Unverified
-- legacy contact emails must NOT be used to automatically claim old accounts.
ALTER TABLE members ADD COLUMN auth_user_id uuid UNIQUE;
ALTER TABLE members ADD COLUMN email_verified_at timestamptz;
CREATE UNIQUE INDEX members_verified_email_unique
  ON members (lower(email)) WHERE email_verified_at IS NOT NULL;
ALTER TABLE members ADD CONSTRAINT members_email_identity_complete
  CHECK ((auth_user_id IS NULL AND email_verified_at IS NULL)
    OR (auth_user_id IS NOT NULL AND email_verified_at IS NOT NULL AND email IS NOT NULL));
