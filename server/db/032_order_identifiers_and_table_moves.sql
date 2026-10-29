ALTER TABLE orders ADD COLUMN ticket_seat text NOT NULL DEFAULT '' CHECK (char_length(ticket_seat) <= 80);
ALTER TABLE orders ADD COLUMN ticket_reference text NOT NULL DEFAULT '' CHECK (char_length(ticket_reference) <= 80);
ALTER TABLE orders ADD COLUMN ticket_revision integer NOT NULL DEFAULT 0 CHECK (ticket_revision >= 0);
ALTER TABLE orders ADD COLUMN counter_request_table_id uuid REFERENCES restaurant_tables(id);
-- Multiple original shared Guest identities remain shared after a merge.
ALTER TABLE customer_sessions ADD COLUMN merged_shared_guest boolean NOT NULL DEFAULT false;
ALTER TABLE customer_sessions ADD COLUMN previous_table_session_ids uuid[] NOT NULL DEFAULT '{}';
CREATE TABLE table_visit_moves (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE table_visit_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON table_visit_moves FROM anon, authenticated;
