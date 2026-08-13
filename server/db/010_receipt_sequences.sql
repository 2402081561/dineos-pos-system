CREATE TABLE receipt_sequences (
  business_date date PRIMARY KEY,
  last_number integer NOT NULL CHECK (last_number > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
