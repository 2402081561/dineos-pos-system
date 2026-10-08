-- Keep original quantities; payment and handoff are independent counters.
ALTER TABLE order_items ADD COLUMN paid_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN fulfilled_quantity integer NOT NULL DEFAULT 0;
UPDATE order_items SET paid_quantity = quantity FROM orders WHERE orders.id = order_items.order_id AND orders.payment_status = 'paid';
UPDATE order_items SET fulfilled_quantity = quantity FROM orders WHERE orders.id = order_items.order_id AND orders.status = 'served';
ALTER TABLE order_items ADD CONSTRAINT item_paid_quantity_range CHECK (paid_quantity BETWEEN 0 AND quantity);
ALTER TABLE order_items ADD CONSTRAINT item_fulfilled_quantity_range CHECK (fulfilled_quantity BETWEEN 0 AND quantity);
ALTER TABLE orders ADD COLUMN paid_subtotal numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN paid_service_charge numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN paid_sst numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN paid_amount numeric(12,2) NOT NULL DEFAULT 0;
UPDATE orders SET paid_subtotal = subtotal, paid_service_charge = service_charge, paid_sst = sst, paid_amount = grand_total WHERE payment_status = 'paid';
ALTER TABLE payments ADD COLUMN order_snapshot jsonb;
ALTER TABLE payments ADD COLUMN request_id uuid UNIQUE;
ALTER TABLE payments ADD COLUMN request_fingerprint text;
-- Freeze valid historical receipts before later partial payments can occur.
UPDATE payments p SET order_snapshot = (
  SELECT jsonb_agg(jsonb_build_object('id', o.id, 'orderType', o.order_type, 'subtotal', o.subtotal,
    'discountAmount', o.discount_amount, 'serviceCharge', o.service_charge, 'sst', o.sst, 'grandTotal', o.grand_total,
    'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'menuItemId', i.menu_item_id, 'name', i.item_name, 'price', i.unit_price, 'quantity', i.quantity, 'orderType', i.order_type, 'optionSnapshot', i.option_snapshot, 'notes', i.notes)), '[]'::jsonb) FROM order_items i WHERE i.order_id = o.id)))
  FROM orders o WHERE o.receipt_number = p.receipt_number AND o.payment_status = 'paid'
) WHERE p.paid_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.receipt_number = p.receipt_number AND o.payment_status <> 'paid');
