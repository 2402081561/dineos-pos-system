-- Preserve the original no-table intent for retries after assigning a table.
ALTER TABLE orders ADD COLUMN counter_request_walk_in boolean NOT NULL DEFAULT false;
UPDATE orders SET counter_request_walk_in = true
FROM table_sessions s, customer_sessions c
WHERE orders.table_session_id = s.id AND orders.customer_session_id = c.id
  AND s.table_id IS NULL AND c.created_by_cashier = true;

CREATE TABLE walk_in_table_assignments (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE walk_in_table_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON walk_in_table_assignments FROM anon, authenticated;
