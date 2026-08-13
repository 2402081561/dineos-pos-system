-- Opaque, high-entropy tokens let QR guests resume only their own customer
-- session without exposing database identifiers as authorization credentials.
ALTER TABLE customer_sessions
  ADD COLUMN access_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;

CREATE INDEX customer_sessions_access_token_idx ON customer_sessions (access_token);
