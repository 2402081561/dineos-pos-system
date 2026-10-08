-- A single ticket may contain both dine-in and take-away lines.
-- Preserve old tickets, their prices and their original packing instructions.
ALTER TABLE orders DROP CONSTRAINT orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('dine_in', 'take_away', 'mixed'));

ALTER TABLE order_items ADD COLUMN order_type text;
UPDATE order_items SET order_type = CASE WHEN orders.order_type = 'take_away' THEN 'take_away' ELSE 'dine_in' END
  FROM orders WHERE orders.id = order_items.order_id;
ALTER TABLE order_items ALTER COLUMN order_type SET DEFAULT 'dine_in';
ALTER TABLE order_items ALTER COLUMN order_type SET NOT NULL;
ALTER TABLE order_items ADD CONSTRAINT order_items_order_type_check
  CHECK (order_type IN ('dine_in', 'take_away'));
CREATE INDEX orders_active_mixed_idx ON orders (created_at)
  WHERE order_type = 'mixed' AND status IN ('received', 'preparing', 'ready');
