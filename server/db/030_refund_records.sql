-- Refunds are separate ledger entries; never reopen paid orders or rewrite receipts.
ALTER TYPE point_transaction_type ADD VALUE IF NOT EXISTS 'refund';
-- Spent points can become a debt on refund. Future earnings offset that debt;
-- existing redemption checks already require a sufficient positive balance.
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_points_balance_check;
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'member_point_transactions'::regclass
    AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%points%' AND pg_get_constraintdef(oid) LIKE '%type%'
  LOOP EXECUTE format('ALTER TABLE member_point_transactions DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
-- Compare as text so the newly added enum value need not be used before COMMIT.
ALTER TABLE member_point_transactions ADD CONSTRAINT point_transaction_sign
  CHECK ((type::text = 'earn' AND points > 0) OR (type::text IN ('redeem', 'refund') AND points < 0));
CREATE TABLE payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_number text NOT NULL UNIQUE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  method text NOT NULL CHECK (method IN ('Cash', 'Original payment method', 'Other')),
  funds_returned boolean NOT NULL CHECK (funds_returned),
  request_id uuid NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  points_reversed integer NOT NULL DEFAULT 0 CHECK (points_reversed >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_refunds_payment_idx ON payment_refunds(payment_id);
CREATE INDEX payment_refunds_date_idx ON payment_refunds(created_at);
ALTER TABLE payment_refunds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON payment_refunds FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON payment_refunds FROM authenticated; END IF;
END $$;
CREATE FUNCTION preserve_refund_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Refund records are immutable'; END $$;
CREATE TRIGGER preserve_refund_record BEFORE UPDATE OR DELETE ON payment_refunds
FOR EACH ROW EXECUTE FUNCTION preserve_refund_record();
