-- Keep old tickets and amounts intact. Type belongs to each order, not the table.
ALTER TABLE orders ADD COLUMN order_type text NOT NULL DEFAULT 'dine_in'
  CONSTRAINT orders_order_type_check CHECK (order_type IN ('dine_in', 'take_away'));
CREATE INDEX orders_active_take_away_idx ON orders (created_at)
  WHERE order_type = 'take_away' AND status IN ('received', 'preparing', 'ready');
