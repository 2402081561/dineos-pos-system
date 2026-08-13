-- Structures needed to retain operational Firebase history during the one-way import.
ALTER TABLE payments ALTER COLUMN cashier_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN legacy_receipt_number text UNIQUE;
ALTER TABLE member_point_transactions ADD COLUMN legacy_source_id text UNIQUE;
ALTER TABLE orders ADD COLUMN receipt_number text;
ALTER TABLE orders ADD COLUMN payment_method text;
ALTER TABLE orders ADD COLUMN paid_at timestamptz;

CREATE TABLE service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id uuid REFERENCES table_sessions(id) ON DELETE SET NULL,
  customer_session_id uuid REFERENCES customer_sessions(id) ON DELETE SET NULL,
  request_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'completed')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  legacy_source_id text NOT NULL UNIQUE
);

CREATE TABLE shift_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id text NOT NULL UNIQUE,
  shift_date text,
  cashier_name text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  closed_at timestamptz NOT NULL DEFAULT now(),
  legacy_source_id text NOT NULL UNIQUE
);

ALTER TABLE audit_logs ADD COLUMN legacy_source_id text UNIQUE;
