-- Private no-table QR visits, separate from shared dine-in and cashier guests.
-- Only new QR orders get pickup codes. No old bill/receipt is rewritten.
ALTER TABLE customer_sessions ADD COLUMN takeaway_join_hash text UNIQUE;
ALTER TABLE customer_sessions ADD COLUMN takeaway_expires_at timestamptz;
ALTER TABLE orders ADD COLUMN pickup_code text;
ALTER TABLE orders ADD COLUMN pickup_reference text;
ALTER TABLE orders ADD COLUMN pickup_day date;
ALTER TABLE orders ADD CONSTRAINT orders_pickup_identity CHECK (
  (pickup_code IS NULL AND pickup_reference IS NULL AND pickup_day IS NULL) OR
  (pickup_code IS NOT NULL AND pickup_reference IS NOT NULL AND pickup_code ~ '^T[0-9]{3,}$' AND length(pickup_reference) BETWEEN 1 AND 40 AND pickup_day IS NOT NULL)
);
CREATE UNIQUE INDEX orders_pickup_day_code ON orders(pickup_day,pickup_code) WHERE pickup_code IS NOT NULL;
CREATE TABLE takeaway_pickup_sequences (
  business_date date PRIMARY KEY,
  last_number bigint NOT NULL CHECK(last_number>0)
);
ALTER TABLE takeaway_pickup_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON takeaway_pickup_sequences FROM anon,authenticated;
CREATE INDEX customer_takeaway_expiry ON customer_sessions(takeaway_expires_at) WHERE takeaway_join_hash IS NOT NULL;
