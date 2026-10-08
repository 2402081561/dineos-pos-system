-- Additive, single-store upgrade. Existing paid orders/receipts are untouched.
ALTER TABLE shop_settings ADD COLUMN config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE shop_settings ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN option_groups jsonb NOT NULL DEFAULT '[]';
ALTER TABLE order_items ADD COLUMN selections jsonb NOT NULL DEFAULT '[]';
ALTER TABLE order_items ADD COLUMN option_snapshot jsonb NOT NULL DEFAULT '[]';
ALTER TABLE orders ADD COLUMN service_charge_rate numeric(5,2) NOT NULL DEFAULT 10 CHECK (service_charge_rate BETWEEN 0 AND 100);
ALTER TABLE orders ADD COLUMN sst_rate numeric(5,2) NOT NULL DEFAULT 6 CHECK (sst_rate BETWEEN 0 AND 100);
ALTER TABLE orders ADD COLUMN version integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN revision_note text;
ALTER TABLE orders ADD COLUMN is_addition boolean NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN shop_snapshot jsonb;
CREATE TABLE order_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_revisions_order_date_idx ON order_revisions(order_id, created_at);
ALTER TABLE order_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON order_revisions FROM anon, authenticated;
