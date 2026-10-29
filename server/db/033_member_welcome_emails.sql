-- Transactional confirmations only. Never queue historical members in bulk.
CREATE TABLE member_welcome_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL UNIQUE REFERENCES members(id),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retry','accepted','blocked')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX member_welcome_due ON member_welcome_emails(next_attempt_at)
  WHERE status IN ('pending','processing','retry');
ALTER TABLE member_welcome_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE member_welcome_emails FROM anon, authenticated;
